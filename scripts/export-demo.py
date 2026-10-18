"""Export verified browser footage with optional captions; never retime the run."""

import argparse
import json
from pathlib import Path
import subprocess
import textwrap


CAPTIONS = {
    "incident": ["Rehearsal: test incident repairs against customer requirements.",
                 "Alder and Beacon cannot export. Cedar is still healthy."],
    "dependencies": ["FalkorDB connects customers, capabilities, operations, and services.",
                     "The shared worker also serves Cedar. Rollback could affect it too."],
    "cypher": ["Executed Cypher follows customer dependencies to the failed service."],
    "investigation": ["{investigation} Actual MCP tool activity is shown.",
                      "Read graph context and sources. Test all three repairs on isolated copies."],
    "bypass": ["Bypass returns HTTP 200, but Alder's required provenance is missing."],
    "source": ["Alder's reviewed agreement supplies the requirement in FalkorDB."],
    "rollback": ["Rollback cannot read the current schema. It also affects Cedar."],
    "cache": ["Verified cache preserves the required data and passes the freshness policy."],
    "approval": ["The owner approves. The server rechecks graph context and reruns the trial."],
    "receipt": ["Recovery verified: all three exports work. The change has a durable receipt."],
    "policy": ["Reset the incident. Propose a graph-policy change: 900 seconds to 600."],
    "accepted-policy": ["The reviewer accepts the new source revision and active claim in FalkorDB."],
    "second-investigation": ["A second investigation reads the revised graph policy.",
                             "The cache is already 720 seconds old. It now exceeds the 600-second limit."],
    "blocked": ["All three repairs fail. No proposal is created.",
                "Changing a graph fact changed the permitted action."],
    "exact-boundary": ["Keyless public example: cache at exactly 900 seconds passes."],
    "one-second-late": ["At 901 seconds, the same complete output fails freshness."],
    "closing": ["Graph model, queries, algorithms, setup, and tests are in the public repository.",
                "github.com/aman-a-shah/rehearsal | Synthetic data; three predefined repairs."],
}


def timestamp(seconds):
    milliseconds = max(0, round(seconds * 1000))
    minutes, milliseconds = divmod(milliseconds, 60000)
    hours, minutes = divmod(minutes, 60)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("recording", type=Path, help="Directory written by demo:record")
    args = parser.parse_args()
    folder = args.recording.resolve()
    recording = json.loads((folder / "recording.json").read_text())
    if not recording.get("succeeded"):
        parser.error("Only a verified, complete take may be exported.")
    if recording.get("pacing") != 1:
        parser.error("Practice captures are accelerated; record at the default pace for submission.")
    source = folder / "recording.webm"
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(source),
    ]))
    duration = float(probe["format"]["duration"])
    cues = []
    investigation = ("Live Backboard investigation." if recording["mode"] == "live"
                     else "Guided rehearsal; no model inference.")
    for shot in recording["shots"]:
        captions = CAPTIONS[shot["id"]]
        start, end = shot["start"], min(shot["end"], duration)
        step = (end - start) / len(captions)
        for index, caption in enumerate(captions):
            text = "\n".join(textwrap.wrap(caption.format(investigation=investigation), width=54))
            cues.append(f"{len(cues) + 1}\n{timestamp(start + index * step)} --> "
                        f"{timestamp(start + (index + 1) * step)}\n{text}\n")
    captions = folder / "captions.srt"
    captions.write_text("\n".join(cues))
    target = folder / "rehearsal-demo.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-n",
        "-i", str(source), "-i", str(captions),
        "-map", "0:v:0", "-map", "1:0", "-an",
        "-vf", "scale=1920:1080:flags=lanczos", "-c:v", "libx264",
        "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
        "-disposition:s:0", "default", "-movflags", "+faststart",
        "-metadata", "title=Rehearsal — Graph Hacks demo",
        "-metadata", "comment=Actual browser capture at original speed; no voice track.",
        str(target),
    ], check=True)
    print(json.dumps({"video": str(target), "captions": str(captions),
                      "duration_seconds": duration, "mode": recording["mode"],
                      "narration": str(folder / "narration.txt")}))


if __name__ == "__main__":
    main()
