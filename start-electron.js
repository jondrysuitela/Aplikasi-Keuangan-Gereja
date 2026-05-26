const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const appRoot = path.join(__dirname);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.NODE_ENV = 'development';

const electronExe = path.join(appRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const child = spawn(electronExe, ['.'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
  cwd: appRoot,
  env,
});

// Pipe stdout/stderr to parent terminal
child.stdout.on('data', (data) => process.stdout.write(data));
child.stderr.on('data', (data) => process.stderr.write(data));

child.on('exit', (code) => {
  console.log(`Electron exited with code ${code}`);
  process.exit(code || 0);
});

console.log('Launched Electron (PID: ' + child.pid + ')');
