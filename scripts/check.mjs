import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
for (const dir of ['src', 'bin', 'public', 'scripts', 'test']) {
  for (const file of fs.readdirSync(path.join(root, dir))) {
    if (!/\.(mjs|js)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', path.join(root, dir, file)], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) { console.error(result.error?.message || result.stderr || 'Syntax check could not run.'); process.exit(1); }
    count++;
  }
}
console.log(`Syntax checked ${count} JavaScript files.`);
