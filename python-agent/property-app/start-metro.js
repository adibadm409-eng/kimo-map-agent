const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.resolve(__dirname, 'metro.log');
const out = fs.openSync(logPath, 'a');

const child = spawn(
  'node',
  ['node_modules/expo/bin/cli', 'start', '--port', '8081', '--host', 'lan'],
  {
    cwd: __dirname,
    env: { ...process.env, CI: 'true', EXPO_NO_DEPENDENCY_VALIDATION: '1' },
    detached: true,
    stdio: ['ignore', out, out],
  }
);
child.unref();
console.log('launched metro pid', child.pid);
