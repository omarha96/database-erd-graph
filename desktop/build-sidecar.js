/* Builds the desktop app's backend: server.js (+ lib/, pg, dotenv) bundled
   into one script, then compiled into a standalone Node executable (Node
   single executable application). Tauri ships it as a sidecar named
   erd-server-<rust target triple>, as externalBin requires. */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const work = path.join(__dirname, 'sea');
const binDir = path.join(__dirname, 'src-tauri', 'binaries');
const triple = execSync('rustc -vV').toString().match(/^host: (.+)$/m)[1];
const ext = process.platform === 'win32' ? '.exe' : '';
const output = path.join(binDir, `erd-server-${triple}${ext}`);

fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });

// pg-native is pg's optional native driver; the pure-JS one is used.
execSync(`npx esbuild server.js --bundle --platform=node --format=cjs --external:pg-native --outfile="${path.join(work, 'server.cjs')}"`, { cwd: root, stdio: 'inherit' });

fs.writeFileSync(path.join(work, 'sea-config.json'), JSON.stringify({
  main: path.join(work, 'server.cjs'),
  output,
  disableExperimentalSEAWarning: true,
}));
execSync(`"${process.execPath}" --build-sea "${path.join(work, 'sea-config.json')}"`, { stdio: 'inherit' });
// macOS refuses to run the modified Node binary until it is re-signed.
if (process.platform === 'darwin') execSync(`codesign --sign - --force "${output}"`);
console.log(`Sidecar: ${path.relative(root, output)}`);
