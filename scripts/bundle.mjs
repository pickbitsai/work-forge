import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script with npm run bundle.');
const invoke = args => {
  const r = spawnSync(process.execPath, [npm, ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(r.stderr || 'npm pack failed.');
  return JSON.parse(r.stdout);
};
const allowed = /^(bin\/|src\/|public\/|docs\/|examples\/|scripts\/|test\/|AGENTS\.md$|README\.md$|LICENSE$|package(?:-lock)?\.json$)/;
const manifest = invoke(['pack', '--dry-run', '--json', '--ignore-scripts'])[0];
for (const file of manifest.files) {
  if (!allowed.test(file.path) || /(?:^|\/)(?:workspace|node_modules|\.env|\.git)(?:\/|$)|\.local\.json$|\.log$/.test(file.path)) throw new Error(`Private or unexpected file in bundle: ${file.path}`);
  if (fs.lstatSync(path.join(root, file.path)).isSymbolicLink()) throw new Error('Release files cannot be symlinks.');
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const packed = invoke(['pack', '--json', '--ignore-scripts', '--pack-destination', 'dist'])[0];
fs.writeFileSync(path.join(root, 'dist', 'release-manifest.json'), JSON.stringify(packed, null, 2) + '\n');
console.log(`Created dist/${packed.filename}; ${packed.files.length} public files. No workspace data included.`);
