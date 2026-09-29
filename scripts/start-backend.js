#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

// ── 1. Safe Environment Variable Normalization (Fixes 'PATH is not defined') ──
function getNormalizedEnv(extraPaths = [], venvDir = null) {
  const env = { ...process.env };
  
  // Find case-insensitive PATH key
  const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  const existingPath = env[pathKey] || '';
  
  const validExtra = extraPaths.filter(p => p && fs.existsSync(p));
  const mergedPath = validExtra.length > 0
    ? `${validExtra.join(path.delimiter)}${path.delimiter}${existingPath}`
    : existingPath;

  // Assign both common casings on Windows to prevent undefined PATH crashes
  env.PATH = mergedPath;
  if (isWindows) {
    env.Path = mergedPath;
  }

  if (venvDir && fs.existsSync(venvDir)) {
    env.VIRTUAL_ENV = venvDir;
  }

  // Force unbuffered UTF-8 python streaming
  env.PYTHONUNBUFFERED = '1';
  env.PYTHONIOENCODING = 'utf-8';

  return env;
}

// ── 2. Check if Python binary is functioning ──────────────────────────────────
function testPythonBinary(executablePath) {
  try {
    if (!fs.existsSync(executablePath)) return false;
    const res = spawnSync(executablePath, ['-c', 'import sys; print(sys.version_info[0])'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      env: getNormalizedEnv(),
      shell: false,
      timeout: 5000
    });
    return res.status === 0 && res.stdout && res.stdout.trim() === '3';
  } catch {
    return false;
  }
}

// ── 3. Find Best Python Executable ────────────────────────────────────────────
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

    if (fs.existsSync(pythonExe) && testPythonBinary(pythonExe)) {
      return {
        path: pythonExe,
        venvDir: venvPath,
        scriptsDir: scriptsDir,
        isVenv: true
      };
    }
  }

  // Global fallbacks
  const globalNames = isWindows ? ['python', 'py', 'python3'] : ['python3', 'python'];
  for (const name of globalNames) {
    try {
      const args = name === 'py' ? ['-3', '-c', 'import sys; print(sys.executable)'] : ['-c', 'import sys; print(sys.executable)'];
      const res = spawnSync(name, args, {
        cwd: projectRoot,
        encoding: 'utf-8',
        env: getNormalizedEnv(),
        shell: false,
        timeout: 5000
      });
      if (res.status === 0 && res.stdout && res.stdout.trim()) {
        const discovered = res.stdout.trim().split('\n')[0].trim();
        if (fs.existsSync(discovered)) {
          return {
            path: discovered,
            venvDir: null,
            scriptsDir: path.dirname(discovered),
            isVenv: false
          };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ── 4. Verify & Auto-Install Required Dependencies ───────────────────────────
function ensureDependencies(pythonInfo) {
  const checkRes = spawnSync(
    pythonInfo.path,
    ['-c', 'import uvicorn, fastapi, yt_dlp, youtube_transcript_api; print("OK")'],
    {
      cwd: projectRoot,
      encoding: 'utf-8',
      env: getNormalizedEnv([pythonInfo.scriptsDir], pythonInfo.venvDir),
      shell: false,
      timeout: 8000
    }
  );

  if (checkRes.status === 0 && checkRes.stdout && checkRes.stdout.includes('OK')) {
    return true;
  }

  const reqFile = path.join(projectRoot, 'backend', 'requirements.txt');
  if (fs.existsSync(reqFile)) {
    console.log('\x1b[36m%s\x1b[0m', '📦 Installing backend requirements (fastapi, uvicorn, yt-dlp)...');
    const pipArgs = ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', reqFile];
    const pipRes = spawnSync(pythonInfo.path, pipArgs, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: getNormalizedEnv([pythonInfo.scriptsDir], pythonInfo.venvDir),
      shell: false
    });
    return pipRes.status === 0;
  }
  return false;
}

// ── 5. Check Port Availability ────────────────────────────────────────────────
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

// ── 6. Main Launcher ─────────────────────────────────────────────────────────
async function main() {
  console.log('\x1b[35m%s\x1b[0m', '⚡ [Cheat Clip] Initializing Fast & Resilient Python Backend...');

  const pythonInfo = findPython();
  if (!pythonInfo) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Error: Python 3 was not found in venv or system PATH.');
    console.error('\x1b[33m%s\x1b[0m', '💡 Please ensure Python 3.9+ is installed, or create a virtual environment:');
    console.error('\x1b[37m%s\x1b[0m', '   python -m venv venv');
    console.error('\x1b[37m%s\x1b[0m', '   venv\\Scripts\\pip install -r backend/requirements.txt');
    process.exit(1);
  }

  const relPython = path.relative(projectRoot, pythonInfo.path) || pythonInfo.path;
  console.log('\x1b[32m%s\x1b[0m', `🐍 Using Python: ${relPython} (${pythonInfo.path})`);

  // Ensure requirements are met
  ensureDependencies(pythonInfo);

  // Check Port 8000
  const isPortFree = await checkPortAvailable(8000);
  if (!isPortFree) {
    console.warn('\x1b[33m%s\x1b[0m', '⚠️ Port 8000 is currently occupied. Attempting to start (or reuse) server...');
  }

  const uvicornArgs = [
    '-m',
    'uvicorn',
    'backend.main:app',
    '--host',
    '127.0.0.1',
    '--port',
    '8000',
    '--reload'
  ];

  console.log('\x1b[36m%s\x1b[0m', '🚀 Launching FastAPI server on http://127.0.0.1:8000 ...');

  const childEnv = getNormalizedEnv([pythonInfo.scriptsDir], pythonInfo.venvDir);

  // CRITICAL: Always use shell: false on Windows to prevent cmd.exe from corrupting paths with spaces!
  const backendProcess = spawn(pythonInfo.path, uvicornArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: childEnv,
    shell: false
  });

  backendProcess.on('error', (err) => {
    console.error('\x1b[31m%s\x1b[0m', `❌ Failed to start Python backend: ${err.message}`);
    process.exit(1);
  });

  backendProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error('\x1b[31m%s\x1b[0m', `⚠️ Backend server process exited with code ${code}.`);
      console.error('\x1b[33m%s\x1b[0m', '💡 If port 8000 was in use or dependencies missing, try:');
      console.error('\x1b[37m%s\x1b[0m', `   ${pythonInfo.path} -m pip install -r backend/requirements.txt`);
    }
  });

  // Forward termination signals gracefully
  const cleanExit = () => {
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill('SIGINT');
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);
}

main().catch((err) => {
  console.error('\x1b[31m%s\x1b[0m', `❌ Fatal Error: ${err.message}`);
  process.exit(1);
});
