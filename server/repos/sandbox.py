"""Repository commands execute only in disposable VMs or explicitly enabled local containers."""

import asyncio
import io
import os
import tarfile
import time
import uuid
from pathlib import PurePosixPath

from ..domain import Problem
from .snapshot import SECRET, safe_path

OUTPUT_LIMIT = 24000


class BoundedLog(io.TextIOBase):
    """Keep draining VM output without buffering arbitrarily large command logs."""
    def __init__(self):
        self.tail = ""

    def write(self, value):
        self.tail = (self.tail + value)[-OUTPUT_LIMIT:]
        return len(value)

    def writable(self):
        return True

    def flush(self):
        pass


def clean_log(text):
    import re
    text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)
    text = SECRET.sub("[credential redacted]", text)
    return text[-OUTPUT_LIMIT:]


class SandboxRunner:
    def __init__(self):
        self.mode = os.getenv("REHEARSAL_SANDBOX", "disabled")
        self.image = os.getenv("REHEARSAL_RUNNER_IMAGE", "rehearsal-runner:local")
        from .sandbox_identity import SandboxIdentity
        self.identity = SandboxIdentity()

    def configuration(self):
        configured = self.mode == "docker" and os.getenv("REHEARSAL_PUBLIC") != "1"
        if self.mode == "vercel":
            broker = len(os.getenv("REHEARSAL_SANDBOX_BROKER_SECRET", "")) >= 40 and all(os.getenv(k) for k in ("REHEARSAL_APP_ORIGIN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"))
            configured = bool(broker or os.getenv("VERCEL_OIDC_TOKEN") or all(os.getenv(k) for k in ("VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID")))
        return {"provider": self.mode, "available": configured,
                "description": "Vercel microVM" if self.mode == "vercel" else "Local Docker container" if self.mode == "docker" else "Runner not configured"}

    async def run(self, files, config):
        if not self.configuration()["available"]:
            raise Problem("runner_unavailable", "Configure a sandbox runner before starting a repair. Public servers require the Vercel sandbox adapter.", 503)
        for path in files:
            safe_path(path)
        started = time.monotonic()
        if self.mode == "vercel":
            result = await self._vercel(files, config)
        else:
            result = await self._docker(files, config)
        return {**result, "duration_ms": round((time.monotonic() - started) * 1000), "provider": self.mode,
                "setup_command": config["setup_command"], "test_command": config["test_command"], "directory": config["directory"]}

    async def _command(self, *args, data=None, timeout=140):
        proc = await asyncio.create_subprocess_exec(*args, stdin=asyncio.subprocess.PIPE if data is not None else asyncio.subprocess.DEVNULL,
                                                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        output = bytearray()

        async def read():
            while chunk := await proc.stdout.read(8192):
                output.extend(chunk)
                if len(output) > OUTPUT_LIMIT * 2:
                    del output[:-OUTPUT_LIMIT]

        async def write():
            if data is not None:
                try:
                    proc.stdin.write(data)
                    await proc.stdin.drain()
                except (BrokenPipeError, ConnectionResetError):
                    pass
                finally:
                    proc.stdin.close()

        try:
            async with asyncio.timeout(timeout):
                await asyncio.gather(read(), write(), proc.wait())
        except BaseException:
            if proc.returncode is None:
                proc.kill()
            await proc.wait()
            raise
        return proc.returncode, clean_log(output.decode("utf-8", errors="replace"))

    async def _docker(self, files, config):
        name = "rehearsal-trial-" + uuid.uuid4().hex
        cwd = "/work" + ("/" + config["directory"] if config["directory"] else "")
        created = False
        try:
            code, _ = await self._command("docker", "run", "-d", "--name", name, "--pull", "never", "--read-only", "--network", "none",
                                        "--user", "10001:10001", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                                        "--pids-limit", "128", "--cpus", "1", "--memory", "768m", "--memory-swap", "768m",
                                        "--tmpfs", "/work:rw,nosuid,nodev,size=536870912,uid=10001,gid=10001",
                                        "--tmpfs", "/tmp:rw,nosuid,nodev,size=134217728,mode=1777", "--env", "HOME=/tmp",
                                        "--env", "CI=true", "--env", "PYTHONDONTWRITEBYTECODE=1", "--init", self.image, "sleep", "600", timeout=30)
            if code:
                raise Problem("docker_unavailable", "The local runner image is missing or Docker is unavailable. Run npm run runner:build.", 503)
            created = True
            archive = io.BytesIO()
            with tarfile.open(fileobj=archive, mode="w") as tar:
                for path, content in files.items():
                    data = content.encode()
                    entry = tarfile.TarInfo(path)
                    entry.size, entry.mode, entry.uid, entry.gid = len(data), 0o644, 10001, 10001
                    tar.addfile(entry, io.BytesIO(data))
            code, _ = await self._command("docker", "exec", "-i", name, "tar", "-xf", "-", "-C", "/work", data=archive.getvalue(), timeout=30)
            if code:
                raise Problem("sandbox_upload", "The source snapshot could not be copied to the test container.", 503)
            setup = ""
            if config["setup_command"]:
                code, setup = await self._command("docker", "exec", "-w", cwd, name, "sh", "-lc", config["setup_command"], timeout=180)
                if code:
                    return {"stage": "setup", "exit_code": code, "output": setup, "setup_output": setup, "timed_out": False}
            code, output = await self._command("docker", "exec", "-w", cwd, name, "sh", "-lc", config["test_command"], timeout=120)
            return {"stage": "test", "exit_code": code, "output": output, "setup_output": setup, "timed_out": False}
        except TimeoutError:
            return {"stage": "timeout", "exit_code": None, "output": "The sandbox command exceeded its time limit.", "setup_output": "", "timed_out": True}
        except FileNotFoundError as error:
            raise Problem("docker_unavailable", "Install Docker or configure the Vercel sandbox runner.", 503) from error
        finally:
            if created:
                await asyncio.shield(self._command("docker", "rm", "-f", name, timeout=15))

    async def _vercel(self, files, config):
        from vercel import sandbox

        registry_policy = sandbox.NetworkPolicy.custom(allow={
            host: () for host in ("registry.npmjs.org", "pypi.org", "files.pythonhosted.org")
        })
        cwd = "/tmp/project" + ("/" + config["directory"] if config["directory"] else "")
        client = None
        try:
            creator = sandbox.create_sandbox
            if os.getenv("REHEARSAL_SANDBOX_BROKER_SECRET"):
                client = sandbox.SandboxClient.create(options=sandbox.SandboxServiceOptions(credentials_factory=self.identity))
                creator = client.create_sandbox
            async with asyncio.timeout(360):
                async with creator(execution_time_limit=360, persistent=False,
                                                  resources=sandbox.SandboxResources(vcpus=2), network_policy=registry_policy,
                                                  env={"CI": "true", "PYTHONDONTWRITEBYTECODE": "1"}) as box:
                    # No GitHub, provider, database, or platform credential enters this VM.
                    for directory in sorted({str(PurePosixPath("/tmp/project/" + p).parent) for p in files}):
                        await box.fs.mkdir(directory, recursive=True)
                    async with box.fs.batch() as batch:
                        for path, content in files.items():
                            batch.write_text("/tmp/project/" + path, content)
                    setup = ""
                    if config["setup_command"]:
                        setup_log = BoundedLog()
                        result = await box.run_process("sh", ["-lc", config["setup_command"]], cwd=cwd, stdout=setup_log, stderr=setup_log, kill_after=180)
                        setup = clean_log(setup_log.tail)
                        if result.returncode != 0:
                            return {"stage": "setup", "exit_code": result.returncode, "output": setup, "setup_output": setup, "timed_out": False}
                    await box.update_network_policy(sandbox.NetworkPolicy.deny_all())
                    test_log = BoundedLog()
                    result = await box.run_process("sh", ["-lc", config["test_command"]], cwd=cwd, stdout=test_log, stderr=test_log, kill_after=120)
                    output = clean_log(test_log.tail)
                    return {"stage": "test", "exit_code": result.returncode, "output": output, "setup_output": setup, "timed_out": False}
        except TimeoutError:
            return {"stage": "timeout", "exit_code": None, "output": "The sandbox exceeded its time limit.", "setup_output": "", "timed_out": True}
        except Exception as error:
            # SDK exceptions can contain URLs and credentials. Never return their text.
            raise Problem("sandbox_unavailable", "Vercel could not complete this sandbox. Check the sandbox credentials and account allowance.", 503) from error
        finally:
            if client:
                await client.aclose()
