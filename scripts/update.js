#!/usr/bin/env node

import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

// ── 1. Safe Environment Normalization ─────────────────────────────────────────
function getNormalizedEnv(extraPaths = [], venvDir = null) {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  const existingPath = env[pathKey] || '';
  
  const validExtra = extraPaths.filter(p => p && fs.existsSync(p));
  const mergedPath = validExtra.length > 0
    ? `${validExtra.join(path.delimiter)}${path.delimiter}${existingPath}`
    : existingPath;

  env.PATH = mergedPath;
  if (isWindows) {
    env.Path = mergedPath;
  }

  if (venvDir && fs.existsSync(venvDir)) {
    env.VIRTUAL_ENV = venvDir;
  }

  env.PYTHONUNBUFFERED = '1';
  env.PYTHONIOENCODING = 'utf-8';
  return env;
}

// ── 2. Run Command Helper (Never uses shell: true with unescaped paths) ───────
function runCommand(command, args, options = {}) {
  console.log('\x1b[36m%s\x1b[0m', `> ${command} ${args.join(' ')}`);
  const res = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    ...options
  });
  return res.status === 0;
}

// ── 3. Find Python ────────────────────────────────────────────────────────────
function findPython() {
  const venvCandidates = [
    path.join(projectRoot, 'venv'),
    path.join(projectRoot, '.venv'),
    path.join(projectRoot, 'backend', 'venv'),
    path.join(projectRoot, 'backend', '.venv')
  ];

  for (const venvPath of venvCandidates) {
    const pythonExe = isWindows
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');
    const scriptsDir = isWindows
      ? path.join(venvPath, 'Scripts')
      : path.join(venvPath, 'bin');

    if (fs.existsSync(pythonExe)) {
      return { path: pythonExe, venvDir: venvPath, scriptsDir, isVenv: true };
    }
  }

  const globalNames = isWindows ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const name of globalNames) {
    try {
      const args = name === 'py' ? ['-3', '-c', 'import sys; print(sys.executable)'] : ['-c', 'import sys; print(sys.executable)'];
      const res = spawnSync(name, args, {
        cwd: projectRoot,
        encoding: 'utf-8',
        shell: false,
        timeout: 5000
      });
      if (res.status === 0 && res.stdout && res.stdout.trim()) {
        const discovered = res.stdout.trim().split('\n')[0].trim();
        if (fs.existsSync(discovered)) {
          return { path: discovered, venvDir: null, scriptsDir: path.dirname(discovered), isVenv: false };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ── 4. Main Update Flow ───────────────────────────────────────────────────────
async function update() {
  console.log('\x1b[35m%s\x1b[0m', '🔄 [Cheat Clip] Starting Space-Safe & PATH-Resilient Update...');

  // 1. Git Pull (if in a git repo)
  if (fs.existsSync(path.join(projectRoot, '.git'))) {
    console.log('\n\x1b[33m%s\x1b[0m', '📥 Pulling latest updates from Git...');
    runCommand('git', ['pull', '--rebase'], { env: getNormalizedEnv() });
  }

  // 2. NPM Install
  console.log('\n\x1b[33m%s\x1b[0m', '📦 Updating Node.js dependencies...');
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';
  runCommand(npmCmd, ['install'], { env: getNormalizedEnv() });

  // 3. Python Requirements
  console.log('\n\x1b[33m%s\x1b[0m', '🐍 Updating Python backend dependencies...');
  const pythonInfo = findPython();
  if (pythonInfo) {
    const reqFile = path.join(projectRoot, 'backend', 'requirements.txt');
    if (fs.existsSync(reqFile)) {
      const pipEnv = getNormalizedEnv([pythonInfo.scriptsDir], pythonInfo.venvDir);
      runCommand(pythonInfo.path, ['-m', 'pip', 'install', '--upgrade', 'pip'], { env: pipEnv });
      runCommand(pythonInfo.path, ['-m', 'pip', 'install', '-r', reqFile], { env: pipEnv });
    }
  } else {
    console.warn('\x1b[31m%s\x1b[0m', '⚠️ Python 3 not found. Skipping python dependencies update.');
  }

  console.log('\n\x1b[32m%s\x1b[0m', '✅ [Cheat Clip] Update completed successfully! Run "npm run dev" to start.');
}

update().catch((err) => {
  console.error('\x1b[31m%s\x1b[0m', `❌ Update Failed: ${err.message}`);
  process.exit(1);
});
