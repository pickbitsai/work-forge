import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { init, load, localPath, mutate } from '../src/store.mjs';
import { addSource, extractFile, previewProject, importProject, listGithub, importGithub } from '../src/intake.mjs';
import { propose, reviewClaim, answer, saveProfile } from '../src/qualifications.mjs';
import { createTask, importTask, approveTask, exportResume, exportDraft, runAdapter } from '../src/tasks.mjs';
import { addBoard, scout, normalizeJobs, rankJobs, addJob, setJobStatus } from '../src/feed.mjs';
import { createServer } from '../src/server.mjs';

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'work-forge-test-'));
  init(root);
  t.after(() => {
    const absolute = path.resolve(root), parent = path.resolve(os.tmpdir());
    assert(absolute.startsWith(parent + path.sep) && path.basename(absolute).startsWith('work-forge-test-'));
    fs.rmSync(absolute, { recursive: true, force: true });
  });
  return root;
}
function seed(root) {
  const source = addSource(root, { kind: 'resume', title: 'Fictional resume', text: 'Built Java REST APIs and SQL queries for Example Company.' });
  const claim = propose(root, { text: 'Built Java REST APIs and SQL queries.', category: 'experience', skills: ['Java', 'SQL'], scope: 'Software engineer', evidence: [{ sourceId: source.id, quote: 'Built Java REST APIs and SQL queries' }] });
  return { source, claim };
}
const fakeJob = { company: 'Example Company', title: 'Senior Java Engineer', location: 'Remote', description: 'Build Java REST APIs. SQL and Kubernetes experience.', url: 'https://example.org/careers/1' };
function draft(claimId) {
  return { headline: 'Software Engineer', summary: [{ text: 'Java API development experience.', claimIds: [claimId] }], sections: [{ title: 'Experience', bullets: [{ text: 'Built Java REST APIs.', claimIds: [claimId] }] }], gaps: ['No Kubernetes evidence.'] };
}

test('fresh workspace is empty, idempotent, and blocks traversal', t => {
  const root = workspace(t);
  assert.equal(init(root).sources.length, 0);
  for (const bad of ['../private', 'x/../../private', 'C:/private', '/etc/passwd', 'x\\private']) assert.throws(() => localPath(root, bad));
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /\*/);
});
test('immutable sources deduplicate and HTML imports are text-only', async t => {
  const root = workspace(t);
  const text = await extractFile('resume.html', Buffer.from('<h1>Example</h1><script>steal()</script><p>Java &amp; SQL</p>'));
  assert.equal(text, 'Example\nJava & SQL');
  const first = addSource(root, { kind: 'resume', title: 'Resume', text });
  assert.equal(addSource(root, { kind: 'resume', title: 'Resume', text }).id, first.id);
  assert.equal(load(root).sources.length, 1);
  await assert.rejects(extractFile('secret.exe', Buffer.from('data')), /Use PDF/);
  await assert.rejects(extractFile('empty.txt', Buffer.from(' ')), /No readable text/);
});
test('source citations and approvals are required; revocation updates views', t => {
  const root = workspace(t), { source, claim } = seed(root);
  assert.throws(() => propose(root, { ...claim, evidence: [{ sourceId: source.id, quote: 'Fabricated revenue gain' }] }), /exactly match/);
  assert.equal(load(root).claims.length, 1);
  assert(!fs.readFileSync(path.join(root, 'qualifications.md'), 'utf8').includes(claim.text));
  reviewClaim(root, claim.id, 'approved');
  assert(fs.readFileSync(path.join(root, 'qualifications.md'), 'utf8').includes(claim.text));
  reviewClaim(root, claim.id, 'rejected');
  assert(!fs.readFileSync(path.join(root, 'qualifications.md'), 'utf8').includes(claim.text));
});
test('interview answers preserve source history and resume current question', t => {
  const root = workspace(t);
  const first = answer(root, 'career', 'Software engineer since 2021.');
  const next = answer(root, 'career', 'Software engineer since 2020.', 'voice');
  assert.notEqual(first.sourceId, next.sourceId);
  assert.equal(load(root).answers.length, 1);
  assert.equal(load(root).sources.length, 2);
  assert.equal(load(root).answers[0].mode, 'voice');
});
test('agent output is atomic, cannot approve itself, and cannot be replayed', t => {
  const root = workspace(t), { source, claim } = seed(root);
  const task = createTask(root, 'qualifications');
  assert.throws(() => importTask(root, task.id, { claims: [claim, { ...claim, text: 'Invented', evidence: [{ sourceId: source.id, quote: 'never existed' }] }] }), /exactly match/);
  assert.equal(load(root).tasks[0].status, 'pending');
  assert.equal(load(root).claims.length, 1);
  importTask(root, task.id, { claims: [{ ...claim, text: 'Java REST API development.', status: 'approved' }] });
  assert.equal(load(root).claims[1].status, 'proposed');
  assert.throws(() => importTask(root, task.id, { claims: [] }), /already been imported/);
});
test('packets become stale when input sources change', t => {
  const root = workspace(t); seed(root);
  const task = createTask(root, 'qualifications');
  addSource(root, { kind: 'other', title: 'New evidence', text: 'Additional evidence.' });
  assert.throws(() => importTask(root, task.id, { claims: [] }), /input changed/);
});
test('an agent cannot replace the input snapshot to forge source citations', t => {
  const root = workspace(t); seed(root);
  const task = createTask(root, 'qualifications');
  const inputPath = path.join(root, 'tasks', task.id, 'input.json');
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  input.sources[0].text += ' Forged achievement.';
  fs.writeFileSync(inputPath, JSON.stringify(input));
  assert.throws(() => importTask(root, task.id, { claims: [] }), /input file was modified/);
  assert.equal(load(root).tasks[0].status, 'pending');
});
test('resume workflow requires reviewed qualifications, cited output, review, and fresh inputs', t => {
  const root = workspace(t), { claim } = seed(root), job = addJob(root, fakeJob);
  assert.throws(() => createTask(root, 'resume', job.id), /Approve at least/);
  reviewClaim(root, claim.id, 'approved');
  const task = createTask(root, 'resume', job.id);
  assert.throws(() => importTask(root, task.id, draft('invented')), /approved claim IDs/);
  importTask(root, task.id, draft(claim.id));
  assert.throws(() => exportResume(root, task.id), /approve/);
  approveTask(root, task.id);
  assert.match(fs.readFileSync(exportResume(root, task.id), 'utf8'), /Built Java REST APIs/);
  saveProfile(root, { name: 'Changed Candidate' });
  assert.throws(() => exportResume(root, task.id), /inputs changed/);
});
test('provisional resume previews can be shared as drafts but never approved as final', t => {
  const root = workspace(t), { claim } = seed(root), job = addJob(root, fakeJob);
  const task = createTask(root, 'resume-preview', job.id);
  importTask(root, task.id, draft(claim.id));
  assert.match(fs.readFileSync(exportDraft(root, task.id), 'utf8'), /DRAFT FOR OWNER REVIEW/);
  assert.throws(() => approveTask(root, task.id), /No reviewable draft/);
  assert.throws(() => exportResume(root, task.id), /approve/);
  assert.equal(load(root).claims[0].status, 'proposed');
});
test('relevance uses approved skills, word boundaries, and reranks retained jobs', t => {
  const root = workspace(t), { claim } = seed(root);
  const java = addJob(root, fakeJob);
  const js = addJob(root, { ...fakeJob, title: 'JavaScript Engineer', description: 'JavaScript development.', url: 'https://example.org/careers/2' });
  assert.equal(rankJobs(load(root))[0].relevance, 0);
  reviewClaim(root, claim.id, 'approved');
  assert.equal(rankJobs(load(root))[0].id, java.id);
  assert.equal(rankJobs(load(root)).find(j => j.id === js.id).relevance, 0);
  setJobStatus(root, java.id, 'applied');
  assert.equal(load(root).jobs.find(j => j.id === java.id).status, 'applied');
});
test('ATS adapters normalize all three providers and exclude unlisted Ashby jobs', () => {
  assert.equal(normalizeJobs({ type: 'greenhouse', slug: 'test', name: 'Example' }, { jobs: [{ id: 1, title: 'Engineer', absolute_url: 'https://example.org/1', content: '<p>Java</p>' }] })[0].description, 'Java');
  assert.equal(normalizeJobs({ type: 'lever', slug: 'test', name: 'Example' }, [{ id: 'one', text: 'Engineer', hostedUrl: 'https://example.org/1', descriptionPlain: 'APIs', lists: [{ text: 'Skills', content: '<li>Java</li>' }] }])[0].description, 'APIs\nSkills\nJava');
  assert.equal(normalizeJobs({ type: 'ashby', slug: 'test', name: 'Example' }, { jobs: [{ isListed: false }, { title: 'Engineer', jobUrl: 'https://example.org/1', isRemote: true }] }).length, 1);
});
test('scouting deduplicates, preserves application status, detects disappearance and reports partial failure', async t => {
  const root = workspace(t);
  const board = addBoard(root, { type: 'greenhouse', name: 'Example', slug: 'example' });
  let jobs = [{ id: 1, title: 'Engineer', absolute_url: 'https://example.org/1' }];
  const fetcher = async () => new Response(JSON.stringify({ jobs }));
  assert.equal((await scout(root, [board], { fetcher }))[0].added, 1);
  setJobStatus(root, load(root).jobs[0].id, 'applied');
  assert.equal((await scout(root, [board], { fetcher }))[0].added, 0);
  jobs = [];
  await scout(root, [board], { fetcher });
  assert.equal(load(root).jobs[0].available, false);
  assert.equal(load(root).jobs[0].status, 'applied');
  const failure = await scout(root, [board], { fetcher: async () => new Response('', { status: 429 }) });
  assert.match(failure[0].error, /429/);
  assert.equal(load(root).jobs.length, 1);
});
test('GitHub uses selected public repositories and reports README failures', async t => {
  const root = workspace(t);
  const result = await listGithub('sample-user', { fetcher: async () => new Response(JSON.stringify([{ full_name: 'sample-user/project', html_url: 'https://github.com/sample-user/project', fork: true }])) });
  assert.equal(result.repos[0].fork, true);
  await assert.rejects(listGithub('https://private.example/profile'), /GitHub username/);
  const imported = await importGithub(root, 'sample-user/project', { fetcher: async url => url.endsWith('/readme') ? new Response('', { status: 404 }) : new Response(JSON.stringify({ description: 'Example project', html_url: 'https://github.com/sample-user/project' })) });
  assert.match(imported.warning, /404/);
  assert.equal(load(root).claims.length, 0);
});
test('local project preview respects git ignores and blocks secrets and generated output', t => {
  const root = workspace(t), project = path.join(root, 'sample-project'); fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'README.md'), 'A local sample project.');
  fs.writeFileSync(path.join(project, '.env'), 'TOKEN=private');
  fs.writeFileSync(path.join(project, '.gitignore'), 'ignored.js\n');
  fs.writeFileSync(path.join(project, 'ignored.js'), 'private content');
  fs.writeFileSync(path.join(project, 'index.js'), 'export const sample = 1;');
  execFileSync('git', ['init', project], { stdio: 'ignore', windowsHide: true });
  const preview = previewProject(project);
  assert.deepEqual(preview.files.map(f => f.path), ['README.md', 'index.js']);
  assert.throws(() => importProject(root, project, ['.env']), /preview/);
  const source = importProject(root, project, ['README.md']);
  assert(!source.text.includes('private'));
});
test('a second writer fails clearly rather than overwriting another mutation', t => {
  const root = workspace(t); fs.writeFileSync(path.join(root, '.write-lock'), 'locked');
  assert.throws(() => mutate(root, s => s.sources.push({})), /busy/);
  assert.equal(load(root).sources.length, 0);
  fs.unlinkSync(path.join(root, '.write-lock'));
});
test('generic stdin/stdout adapter validates the same contract without shell expansion', async t => {
  const root = workspace(t); seed(root);
  const task = createTask(root, 'interview');
  const script = path.join(root, 'fixture-agent.mjs');
  fs.writeFileSync(script, `let p='';process.stdin.on('data',d=>p+=d);process.stdin.on('end',()=>{if(!p.includes('Work Forge task'))process.exit(2);process.stdout.write(JSON.stringify({questions:[{question:'What was your specific contribution?'}]}));});`);
  const output = await runAdapter(root, task.id, { command: process.execPath, args: [script] });
  assert.equal(output.status, 'imported');
  assert.equal(load(root).questions.length, 9);
});
test('HTTP server rejects cross-origin mutations, invalid tokens, and file traversal', async t => {
  const root = workspace(t), server = createServer(root);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  const headers = { 'content-type': 'application/json', 'x-forge-token': state.token };
  assert.equal((await fetch(`${base}/api/source`, { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${base}/api/source`, { method: 'POST', headers: { ...headers, 'x-forge-token': 'wrong' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${base}/api/source`, { method: 'POST', headers, body: JSON.stringify({ title: 'Sample', kind: 'resume', text: 'Example evidence' }) })).status, 200);
  assert.equal((await fetch(`${base}/state.json`)).status, 404);
  assert.equal((await fetch(`${base}/api/task-detail`, { method: 'POST', headers, body: '{"id":"../state.json"}' })).status, 400);
  assert.match((await fetch(base)).headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
