import { spawnSync } from "node:child_process";
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
if (!process.argv.includes("--ui-only"))
  run(".venv/bin/python", ["-m", "pytest", "tests", "-q", "--tb=short"]);
if (!process.argv.includes("--backend-only"))
  run("npm", ["--prefix", "web", "run", "test:e2e"]);
