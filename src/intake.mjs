import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { id, now, hash, requireText, safeUrl, mutate } from './store.mjs';

export const MAX_FILE = 10 * 1024 * 1024;
export const MAX_TEXT = 250000;
const kinds = ['resume', 'linkedin', 'project', 'github', 'interview', 'other'];
export function addSource(root, input) {
  const kind = input.kind || 'other';
  if (!kinds.includes(kind)) throw new Error('Unknown source kind.');
  const text = requireText(input.text, 'Source text', MAX_TEXT);
  const title = requireText(input.title, 'Source title', 200);
  const url = safeUrl(input.url);
  return mutate(root, state => {
    const digest = hash({ kind, title, text, url });
    const existing = state.sources.find(s => s.hash === digest);
    if (existing) return existing;
    const source = { id: id('src'), kind, title, text, url, hash: digest, createdAt: now() };
    state.sources.push(source);
    return source;
  });
}
export function stripHtml(text) {
  return String(text || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|li|div|h\d)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, x => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[x]).trim();
}
export async function extractFile(name, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE) throw new Error('Files must be at most 10 MB.');
  const ext = path.extname(name).toLowerCase();
  let text;
  if (ext === '.pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true });
    try {
      const doc = await task.promise;
      if (doc.numPages > 80) throw new Error('Import at most 80 pages at a time.');
      const pages = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
        page.cleanup();
      }
      text = pages.join('\n\n');
    } finally { await task.destroy(); }
  } else if (ext === '.docx') {
    const mammoth = await import('mammoth');
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (['.txt', '.md', '.csv', '.json', '.html', '.htm'].includes(ext)) {
    text = buffer.toString('utf8');
    if (['.html', '.htm'].includes(ext)) text = stripHtml(text);
  } else throw new Error('Use PDF, DOCX, TXT, Markdown, CSV, JSON, or HTML.');
  if (!text?.trim()) throw new Error('No readable text found. For image-only PDFs, use OCR first or paste a transcript.');
  return requireText(text, 'Extracted text', MAX_TEXT);
}

const BLOCKED = /(^|\/)(\.[^/]+|node_modules|vendor|dist|build|coverage|target|venv|__pycache__|credentials|secrets|private)(\/|$)|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.(pem|key|p12|pfx|sqlite|db|log|zip|map|lock)$/i;
const ALLOWED = /(^|\/)(readme[^/]*|license[^/]*|package\.json|pyproject\.toml|cargo\.toml|go\.mod)$|\.(md|txt|js|mjs|cjs|jsx|ts|tsx|py|rs|go|java|cs|rb|sql|html|css|toml)$/i;
export const allowedProjectFile = filename => !BLOCKED.test(filename.replaceAll('\\', '/')) && ALLOWED.test(filename);
export function previewProject(directory) {
  const root = fs.realpathSync(directory);
  if (!fs.statSync(root).isDirectory()) throw new Error('Select a project directory.');
  let names;
  try {
    names = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean);
  } catch {
    // Outside Git, scan documentation only; arbitrary code needs an explicit file import.
    names = [];
    const walk = (dir, depth = 0) => {
      if (depth > 4 || names.length >= 2000) return;
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = (dir ? `${dir}/` : '') + entry.name;
        if (entry.isSymbolicLink() || BLOCKED.test(rel)) continue;
        if (entry.isDirectory()) { if (/^(docs|documentation|examples)(\/|$)/i.test(rel)) walk(rel, depth + 1); }
        else if (/\.(md|txt)$/i.test(rel) || /(^|\/)(package\.json|pyproject\.toml|cargo\.toml|go\.mod)$/i.test(rel)) names.push(rel);
      }
    };
    walk('');
  }
  const files = [];
  let total = 0;
  for (const name of [...new Set(names)].sort((a, b) => Number(!/readme/i.test(a)) - Number(!/readme/i.test(b)) || a.localeCompare(b))) {
    if (!allowedProjectFile(name)) continue;
    const absolute = path.resolve(root, name);
    if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) continue;
    const real = fs.realpathSync(absolute);
    if (real !== absolute || !real.startsWith(root + path.sep)) continue;
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.size > 30000 || !stat.size) continue;
    if (files.length >= 60 || total + stat.size > 180000) continue;
    total += stat.size;
    files.push({ path: name.replaceAll('\\', '/'), bytes: stat.size });
  }
  return { root, files, bytes: total, note: 'Bounded scan: up to 60 text files / 180 KB. Git ignores are respected; hidden files, credentials, dependencies, binaries, and symlinks are excluded. Review selected content for sensitive details.' };
}
export function importProject(root, directory, selected) {
  const preview = previewProject(directory);
  const permitted = new Set(preview.files.map(f => f.path));
  const names = selected || [...permitted];
  if (!Array.isArray(names) || !names.length || names.some(n => !permitted.has(n))) throw new Error('Choose files from the project preview.');
  const text = names.map(name => `FILE: ${name}\n${fs.readFileSync(path.join(preview.root, name), 'utf8')}`).join('\n\n');
  return addSource(root, { kind: 'project', title: path.basename(preview.root), text });
}

export async function getJson(url, { fetcher = fetch, headers = {} } = {}) {
  const res = await fetcher(url, { headers: { accept: 'application/json', 'user-agent': 'Work-Forge/0.1', ...headers }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Source returned HTTP ${res.status}. Check the account/board name and rate limits.`);
  const reader = res.body?.getReader();
  if (!reader) return res.json(); // also supports simple fixture transports
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 15 * 1024 * 1024) { await reader.cancel(); throw new Error('Source response is too large.'); }
    chunks.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function githubName(value, repository = false) {
  let name = requireText(value, 'GitHub account or repository', 200);
  if (name.startsWith('https://github.com/')) name = new URL(name).pathname.slice(1).replace(/\/$/, '');
  const pattern = repository ? /^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]+$/i : /^[a-z\d][a-z\d-]{0,38}$/i;
  if (!pattern.test(name)) throw new Error(repository ? 'Use owner/repository or its GitHub URL.' : 'Use a GitHub username or profile URL.');
  return name;
}
export async function listGithub(user, options) {
  user = githubName(user);
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await getJson(`https://api.github.com/users/${user}/repos?per_page=100&page=${page}&sort=updated`, options);
    if (!Array.isArray(batch)) throw new Error('Invalid GitHub response.');
    repos.push(...batch.filter(r => !r.private).map(r => ({ name: r.full_name, description: r.description || '', fork: r.fork, url: r.html_url })));
    if (batch.length < 100) return { repos, truncated: false };
  }
  return { repos, truncated: true };
}
export async function importGithub(root, value, options) {
  const name = githubName(value, true);
  const repo = await getJson(`https://api.github.com/repos/${name}`, options);
  if (repo.private) throw new Error('Use selected local files for private repositories.');
  let readme = '', warning = '';
  try {
    const doc = await getJson(`https://api.github.com/repos/${name}/readme`, options);
    if (doc.encoding !== 'base64') throw new Error('README encoding not supported.');
    readme = Buffer.from(doc.content, 'base64').toString('utf8');
  } catch (e) { warning = `README unavailable: ${e.message}`; }
  const source = addSource(root, { title: name, kind: 'github', url: repo.html_url, text: `Repository: ${name}\nDescription: ${repo.description || ''}\nPrimary language: ${repo.language || 'Unspecified'}\nFork: ${!!repo.fork}\nRepository ownership does not establish personal contribution or production use.\n${warning}\n\nREADME\n${readme}` });
  return { source, warning };
}
