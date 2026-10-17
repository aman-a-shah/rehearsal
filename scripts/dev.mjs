import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill('SIGTERM'));
}
function start(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(); process.exitCode = 1; });
  child.on('exit', code => { if (!stopping) { stop(); process.exitCode = code ?? 1; } });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start(path.join(root, '.venv/bin/python'), ['-m', 'uvicorn', 'server.api:app', '--host', '127.0.0.1', '--port', '8780']);
if (!process.argv.includes('--api-only')) start('npm', ['--prefix', 'web', 'run', 'dev']);
