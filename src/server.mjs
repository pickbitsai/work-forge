import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { init, load, localPath } from './store.mjs';
import { addSource, extractFile, previewProject, importProject, listGithub, importGithub } from './intake.mjs';
import { saveProfile, propose, reviewClaim, answer } from './qualifications.mjs';
import { addBoard, scout, rankJobs, addJob, setJobStatus } from './feed.mjs';
import { createTask, importTask, approveTask, exportResume, exportDraft } from './tasks.mjs';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const assets = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 15 * 1024 * 1024) throw new Error('Request exceeds 15 MB.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function send(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
export function createServer(root) {
  init(root);
  const token = randomBytes(32).toString('hex');
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const port = req.socket.localPort;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) return send(res, 403, { error: 'This app accepts localhost requests only.' });
      const origin = `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== origin) return send(res, 403, { error: 'Cross-origin requests are not allowed.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Cross-site requests are not allowed.' });
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname];
        res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
        return res.end(fs.readFileSync(path.join(PUBLIC, file)));
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, { ...load(root), feed: rankJobs(load(root)), token, workspace: root });
      if (req.method !== 'POST' || !url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found.' });
      if (req.headers['x-forge-token'] !== token || !req.headers['content-type']?.startsWith('application/json')) return send(res, 403, { error: 'Reload the app before making changes.' });
      const input = await body(req);
      let result;
      switch (url.pathname) {
        case '/api/profile': result = saveProfile(root, input); break;
        case '/api/source': result = addSource(root, input); break;
        case '/api/file': {
          if (typeof input.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)) throw new Error('Invalid file encoding.');
          const text = await extractFile(String(input.name || ''), Buffer.from(input.data, 'base64'));
          result = addSource(root, { kind: input.kind, title: input.name, text }); break;
        }
        case '/api/project-preview': result = previewProject(input.directory); break;
        case '/api/project-import': result = importProject(root, input.directory, input.files); break;
        case '/api/github-list': result = await listGithub(input.user); break;
        case '/api/github-import': result = await importGithub(root, input.repository); break;
        case '/api/claim': result = propose(root, input); break;
        case '/api/claim-review': result = reviewClaim(root, input.id, input.status, input.changes); break;
        case '/api/answer': result = answer(root, input.questionId, input.text, input.mode); break;
        case '/api/board': result = addBoard(root, input); break;
        case '/api/scout': result = await scout(root, load(root).boards); break;
        case '/api/job': result = addJob(root, input); break;
        case '/api/job-status': result = setJobStatus(root, input.id, input.status); break;
        case '/api/task': result = createTask(root, input.kind, input.jobId); break;
        case '/api/task-detail': {
          const task = load(root).tasks.find(t => t.id === input.id);
          if (!task) throw new Error('Task not found.');
          result = { ...task, directory: localPath(root, `tasks/${task.id}`), prompt: fs.readFileSync(localPath(root, `tasks/${task.id}/prompt.md`), 'utf8'), input: JSON.parse(fs.readFileSync(localPath(root, `tasks/${task.id}/input.json`), 'utf8')) };
          break;
        }
        case '/api/task-import': result = importTask(root, input.id, input.result); break;
        case '/api/task-approve': result = approveTask(root, input.id); break;
        case '/api/resume-export': {
          const filename = exportResume(root, input.id);
          result = { filename, markdown: fs.readFileSync(filename, 'utf8') }; break;
        }
        case '/api/draft-export': {
          const filename = exportDraft(root, input.id);
          result = { filename, markdown: fs.readFileSync(filename, 'utf8') }; break;
        }
        default: return send(res, 404, { error: 'Not found.' });
      }
      send(res, 200, result);
    } catch (error) { send(res, 400, { error: error.message || 'Request failed.' }); }
  });
}
export async function serve(root, port = 4660) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
  const server = createServer(root);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  console.log(`Work Forge: http://127.0.0.1:${server.address().port}\nWorkspace: ${root}\nPress Ctrl+C to stop.`);
  return server;
}
