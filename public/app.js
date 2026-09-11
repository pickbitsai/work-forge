const $ = selector => document.querySelector(selector);
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const split = value => String(value || '').split(',').map(s => s.trim()).filter(Boolean);
let state, intakeTab = 'paste', questionId = 'direction', noticeTimer, recognition, activeTask;
const app = $('#app');
const page = () => location.hash.slice(1) || 'sources';
const date = value => value ? new Date(value).toLocaleDateString() : '';
const pill = (text, color = '') => `<span class="pill ${color}">${e(text)}</span>`;
const button = (label, action, id = '', cls = 'secondary') => `<button type="button" class="${cls}" data-action="${action}" data-id="${e(id)}">${label}</button>`;
const empty = (title, text) => `<div class="empty"><div class="empty-symbol">[ + ]</div><strong>${title}</strong><p>${text}</p></div>`;
const head = (label, title, subtitle, action = '') => `<div class="page-head"><div><div class="eyebrow">${label}</div><h1>${title}</h1><p class="intro">${subtitle}</p></div>${action}</div>`;
function notify(message, error = false) {
  const el = $('#notice'); el.textContent = message; el.className = error ? 'error' : ''; el.hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { el.hidden = true; }, error ? 15000 : 6500);
}
async function api(route, data) {
  const response = await fetch(`/api/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forge-token': state.token }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
async function refresh() {
  const response = await fetch('/api/state');
  if (!response.ok) throw new Error('Could not load the workspace.');
  state = await response.json();
  render();
}
function modal(html) { $('#detail-content').innerHTML = html; if (!$('#detail').open) $('#detail').showModal(); }
function closeModal() { $('#detail').close(); activeTask = null; }
function sourceList() {
  return state.sources.length ? `<div class="stack">${[...state.sources].reverse().map(s => `<article class="item"><div class="item-top"><div><div class="source-title"><span class="source-icon">${({ resume: 'CV', linkedin: 'in', github: 'GH', project: '</>', interview: 'Q/A' })[s.kind] || 'TXT'}</span><h3>${e(s.title)}</h3></div><div class="meta">${e(s.kind)} · ${s.text.length.toLocaleString()} characters · ${date(s.createdAt)}</div></div>${button('Read', 'source-detail', s.id)}</div></article>`).join('')}</div>` : empty('Start with something you’ve done', 'Add a resume, a project, or your LinkedIn profile. Each source becomes part of your evidence library.');
}
function intakeForm() {
  if (intakeTab === 'paste') return `<form id="source-form"><label for="source-kind">What are you adding?</label><select id="source-kind" name="kind"><option value="resume">Resume</option><option value="linkedin">LinkedIn profile</option><option value="project">Project write-up</option><option value="other">Other experience</option></select><label for="source-title">Source name</label><input id="source-title" name="title" placeholder="e.g. My current resume" required maxlength="200"><label for="source-text">Paste the text</label><textarea id="source-text" name="text" placeholder="Your experience, projects, education, and skills…" required rows="7" maxlength="250000"></textarea><label for="source-url">Source link <span class="muted">(optional)</span></label><input id="source-url" name="url" type="url" placeholder="https://www.linkedin.com/in/your-profile/"><button class="primary">Add to library ↗</button><p class="subtle">For LinkedIn, paste your profile text or upload an export. A URL alone cannot provide the full profile.</p></form>`;
  if (intakeTab === 'file') return `<form id="file-form"><label for="file-kind">Source type</label><select id="file-kind" name="kind"><option value="resume">Resume</option><option value="linkedin">LinkedIn export</option><option value="project">Project document</option><option value="other">Other</option></select><div class="drop"><label for="source-file">Choose a document from your computer</label><input id="source-file" name="file" type="file" accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm" required><p>PDF, Word, text, Markdown, CSV, JSON, or HTML · up to 10 MB</p></div><p class="subtle">Text is extracted locally. Image-only PDFs need OCR before import. Extract LinkedIn ZIP exports first, then add the relevant files.</p><button class="primary">Import document ↗</button></form>`;
  if (intakeTab === 'github') return `<form id="github-form"><label for="github-user">GitHub username or profile URL</label><input id="github-user" name="user" required placeholder="your-username"><button class="primary">Find repositories ↗</button></form><div class="hint">Select the repositories you want to include. We import public descriptions and READMEs. You’ll confirm your contribution when reviewing qualifications.</div><div id="github-results" class="stack"></div><form id="github-direct-form"><label for="github-repo">Or add a specific repository</label><input id="github-repo" name="repository" required placeholder="owner/repository"><button class="secondary">Import repository</button></form>`;
  return `<form id="project-form"><label for="project-path">Local project folder</label><input id="project-path" name="directory" required placeholder="Absolute path to the project you want to share"><p class="subtle">We preview a limited set of source and documentation files before importing. Git ignores are respected. Nothing is sent to a model during import.</p><button class="primary">Preview files ↗</button></form><div id="project-results"></div>`;
}
function sourcesPage() {
  return head('Make your experience reusable', 'Good work deserves a record.', 'Bring together the things you’ve built, the roles you’ve held, and the experience your resume leaves out.') + `<div class="stats"><div class="stat"><strong>${state.sources.length}</strong><small>Sources in your library</small></div><div class="stat"><strong>${state.claims.filter(c => c.status === 'approved').length}</strong><small>Approved qualifications</small></div><div class="stat"><strong>${state.answers.length}<span class="muted"> / ${state.questions.length}</span></strong><small>Interview questions answered</small></div></div><div class="grid"><section class="card"><div class="section-line"><h2>Add your evidence</h2>${pill('Stays local', 'green')}</div><div class="tabs" aria-label="Source types">${[['paste', 'Paste text'], ['file', 'Upload file'], ['github', 'GitHub'], ['project', 'Local project']].map(([key, label]) => button(label, 'intake-tab', key, intakeTab === key ? 'active' : '')).join('')}</div>${intakeForm()}</section><section><div class="card"><div class="section-line"><h2>Your library</h2><span class="count-label">${state.sources.length} sources</span></div>${sourceList()}</div><div class="card"><h2>From evidence to opportunity</h2><div class="steps"><div class="step"><b>1</b><div><strong>Bring your experience together</strong><p>Import sources or tell your story in an interview.</p></div></div><div class="step"><b>2</b><div><strong>Review what your agent finds</strong><p>Check the evidence behind each proposed qualification.</p></div></div><div class="step"><b>3</b><div><strong>Find work that fits</strong><p>Build a job feed and tailor a resume from approved claims.</p></div></div></div><div class="actions">${button('Build qualifications →', 'create-task', 'qualifications')}</div></div></section></div>`;
}
function interviewPage() {
  const q = state.questions.find(q => q.id === questionId) || state.questions[0]; questionId = q.id;
  const answer = state.answers.find(a => a.questionId === q.id);
  return head('There’s more to your story', 'Let’s fill in the gaps.', 'Talk through your experience in your own words. Your answers become sources you can review with your agent.') + `<div class="grid"><section class="card"><div class="section-line">${pill(`Question ${state.questions.indexOf(q) + 1} of ${state.questions.length}`)}<span class="count-label">${state.answers.length} answered</span></div><progress class="progress" max="${state.questions.length}" value="${state.answers.length}" aria-label="Interview progress"></progress><p class="interview-q">${e(q.question)}</p><form id="answer-form"><input type="hidden" name="questionId" value="${e(q.id)}"><label for="answer-text">Your answer</label><textarea id="answer-text" name="text" rows="8" required placeholder="Start wherever feels natural…">${e(answer?.text || '')}</textarea><label class="inline-label"><input type="checkbox" id="voice-consent">Allow browser dictation, which may send audio to my browser’s speech service.</label><div class="actions">${button('🎙 Dictate', 'voice', '', 'secondary')}<button class="primary">Save answer & continue →</button></div><p class="subtle" id="voice-status">Type here or use your device’s dictation. Browser speech recognition depends on browser and language support.</p></form></section><section><div class="card question-list">${state.questions.map((q, i) => button(`${state.answers.some(a => a.questionId === q.id) ? '✓' : String(i + 1).padStart(2, '0')} &nbsp; ${e(q.id.startsWith('question-') ? 'Follow-up question' : q.id[0].toUpperCase() + q.id.slice(1))}`, 'question', q.id, q.id === questionId ? 'active' : '')).join('')}</div><div class="card"><h2>Let your agent go deeper</h2><p class="subtle">An agent can use your sources and answers to find missing context and suggest follow-up questions.</p><div class="actions">${button('Find follow-up questions', 'create-task', 'interview')}${button('Extract qualifications', 'create-task', 'qualifications')}</div></div></section></div>`;
}
function qualificationsPage() {
  return head('Evidence you can stand behind', 'Your qualifications.', 'Review the wording, scope, and citations. Approved claims become the source of truth for matching and resumes.', button('Extract with an agent ↗', 'create-task', 'qualifications', 'primary')) + `<div class="filter-bar"><select id="claim-filter" aria-label="Filter qualifications"><option value="all">All qualifications</option><option value="proposed">Needs your review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>${button('Add a claim manually', 'manual-claim')}</div><div class="stack" id="claims-list">${claimCards(state.claims)}</div>`;
}
function claimCards(claims) {
  return claims.length ? [...claims].reverse().map(c => `<article class="item"><div class="item-top"><div>${pill(c.category)} ${pill(c.status === 'proposed' ? 'Needs review' : c.status, c.status === 'approved' ? 'green' : 'amber')}</div><span class="count-label">${c.evidence.length} source citations</span></div><p>${e(c.text)}</p><div class="meta">${e(c.scope)}${c.skills.length ? ` · ${e(c.skills.join(', '))}` : ''}</div>${c.limitations ? `<div class="hint">${e(c.limitations)}</div>` : ''}<div class="actions">${button('Review evidence & wording', 'claim-detail', c.id)}</div></article>`).join('') : empty('Your evidence has a next step', 'Create a qualifications task for your agent, or add a claim manually with a quote from your library.');
}
function profilePage() {
  const p = state.profile;
  return head('Set your direction', 'What comes next?', 'Tell your feed what to look for. Use comma-separated terms; you can change them as your search evolves.') + `<form id="profile-form" class="card"><div class="row"><div><label for="profile-name">Your name</label><input id="profile-name" name="name" value="${e(p.name)}" maxlength="200"></div><div><label for="profile-headline">Professional headline</label><input id="profile-headline" name="headline" value="${e(p.headline)}" maxlength="300"></div></div>${[['roles', 'Target roles', 'Software engineer, engineering manager'], ['locations', 'Locations or remote', 'Phoenix, Remote'], ['keywords', 'Topics to prioritize', 'Java, platforms, distributed systems'], ['exclude', 'Terms to exclude from job titles', 'Intern, temporary']].map(([key, label, placeholder]) => `<label for="profile-${key}">${label}</label><input id="profile-${key}" name="${key}" value="${e(p[key].join(', '))}" placeholder="${placeholder}">`).join('')}<button class="primary">Save preferences</button><div class="hint">Relevance uses your preferences and approved skill labels. It does not establish that you meet a job’s requirements.</div></form>`;
}
function jobCards(jobs) {
  return jobs.length ? jobs.map(j => `<article class="item job"><div class="item-top"><div><span class="eyebrow">${e(j.company)}</span><h3>${e(j.title)}</h3><div class="meta">${e(j.location || 'Location not specified')} · Checked ${date(j.checkedAt || j.createdAt)}${j.available === false ? ' · No longer listed on board' : ''}</div></div><div class="job-score"><strong>${j.relevance}</strong><small>keyword relevance</small></div></div><div class="job-tags">${j.matchedSkills.map(s => pill(s, 'green')).join('')}${j.excluded ? pill('Excluded title term', 'amber') : ''}${!j.locationMatch ? pill('Location preference differs', 'amber') : ''}${j.fit ? pill(`Fit: ${j.fit.status}`, 'amber') : ''}</div><div class="actions">${button('View opportunity', 'job-detail', j.id)}${button('Draft resume', 'resume-task', j.id)}<select data-job-status="${j.id}" aria-label="Application status for ${e(j.title)}">${['saved', 'preparing', 'applied', 'interviewing', 'offer', 'rejected', 'skipped', 'closed'].map(s => `<option ${j.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></article>`).join('') : empty('Find your next piece of work', 'Add a company job board or paste a job description. Your preferences and qualifications will help order the feed.');
}
function feedPage() {
  return head('A feed shaped by your experience', 'Your next move.', 'Current roles from the company boards you choose, with a record of what you’ve saved and applied to.', button('Refresh boards ↻', 'scout', '', 'primary')) + `<div class="actions">${button('Add company board', 'board-dialog')}${button('Paste a job', 'job-dialog')}</div><p class="subtle">${state.boards.length} boards · ${state.jobs.length} jobs · ${state.boards.filter(b => b.error).length} board errors</p><div class="filter-bar"><input id="job-search" aria-label="Search jobs" placeholder="Search role, company, or location"><select id="job-filter" aria-label="Filter job status"><option value="all">All statuses</option>${['saved', 'preparing', 'applied', 'interviewing', 'offer', 'rejected', 'skipped', 'closed'].map(s => `<option>${s}</option>`).join('')}</select></div><div class="stack" id="jobs-list">${jobCards(state.feed)}</div>${state.boards.length ? `<details><summary>Company boards & refresh results</summary>${state.boards.map(b => `<div class="item"><strong>${e(b.name)}</strong><p>${e(b.type)} / ${e(b.slug)} · ${b.checkedAt ? `Checked ${date(b.checkedAt)}` : 'Not refreshed yet'}</p>${b.error ? `<p>${e(b.error)}</p>` : ''}</div>`).join('')}</details>` : ''}`;
}
function agentsPage() {
  return head('Bring the agent you already use', 'One workspace. Any agent.', 'Create a task, open it in your CLI or VS Code agent, then import its response for review.') + `<div class="grid"><div class="card"><h2>Create a task</h2><p class="subtle">Each task includes instructions, its evidence, and an output example. No model account is built into Work Forge.</p><div class="actions">${button('Build qualifications', 'create-task', 'qualifications', 'primary')}${button('Interview follow-ups', 'create-task', 'interview')}</div><p class="subtle">For a fit assessment or resume, choose a role in the Work feed.</p><div class="hint">Your chosen agent may send task contents to its provider. Review the packet before handing it over. Keep your workspace private.</div></div><div class="card"><h2>CLI & editor handoff</h2><div class="steps"><div class="step"><b>1</b><div><strong>Create the task here</strong><p>A folder appears under workspace/tasks/.</p></div></div><div class="step"><b>2</b><div><strong>Open prompt.md in your agent</strong><p>Ask it to follow the prompt and write result.json next to it. You can also copy the full prompt.</p></div></div><div class="step"><b>3</b><div><strong>Import and review</strong><p>Paste result.json here. Proposed claims and resumes need your review.</p></div></div></div></div><section class="full"><div class="section-line"><h2>Your tasks</h2><span class="count-label">${state.tasks.length} tasks</span></div><div class="stack">${state.tasks.length ? [...state.tasks].reverse().map(t => `<article class="item"><div class="item-top"><div><h3>${e(t.kind[0].toUpperCase() + t.kind.slice(1))}${t.jobId ? ` · ${e(state.jobs.find(j => j.id === t.jobId)?.company || '')}` : ''}</h3><div class="meta">${e(t.id)} · ${date(t.createdAt)}</div></div>${pill(t.status, t.status === 'approved' ? 'green' : 'amber')}</div><div class="actions">${button(t.status === 'pending' ? 'Open task & import result' : 'Review result', 'task-detail', t.id)}</div></article>`).join('') : empty('Ready for your agent', 'Add evidence first, then create a task to build your qualifications. No integration or API key required.')}</div></section></div>`;
}
function render() {
  const pages = { sources: sourcesPage, interview: interviewPage, qualifications: qualificationsPage, profile: profilePage, feed: feedPage, agents: agentsPage };
  const current = pages[page()] ? page() : 'sources';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.page === current));
  $('#breadcrumb').textContent = `WORKSPACE / ${current.toUpperCase()}`;
  $('#source-count').textContent = state.sources.length; $('#claim-count').textContent = state.claims.filter(c => c.status === 'approved').length; $('#job-count').textContent = state.jobs.length;
  $('#workspace-path').textContent = state.workspace;
  app.innerHTML = pages[current]();
}
function showClaim(id) {
  const c = state.claims.find(c => c.id === id);
  modal(`<h2>Review this qualification</h2><p class="subtle">Confirm personal contribution, dates, scope, and any metrics. A matching quote establishes traceability; you still decide whether the claim is accurate.</p><form id="claim-review-form"><input type="hidden" name="id" value="${c.id}"><label for="claim-text">Claim wording</label><textarea id="claim-text" name="text" required>${e(c.text)}</textarea><label for="claim-scope">Scope</label><input id="claim-scope" name="scope" value="${e(c.scope)}" required><label for="claim-skills">Skills, separated by commas</label><input id="claim-skills" name="skills" value="${e(c.skills.join(', '))}"><label for="claim-limits">Limitations</label><textarea id="claim-limits" name="limitations" rows="2">${e(c.limitations)}</textarea><h3>Source evidence</h3>${c.evidence.map(ref => `<div class="quote">${e(ref.quote)}<br><strong>${e(state.sources.find(s => s.id === ref.sourceId)?.title)} · ${e(ref.sourceId)}</strong></div>`).join('')}<label class="inline-label"><input type="checkbox" name="confirmed" required>I have reviewed the evidence and this wording is accurate.</label><button class="primary">Approve qualification</button></form><div class="actions">${button('Reject claim', 'reject-claim', c.id, 'danger')}${button('Return to proposed', 'unapprove-claim', c.id)}</div>`);
}
function showManualClaim() {
  if (!state.sources.length) throw new Error('Add a source first.');
  modal(`<h2>Add an evidence-backed claim</h2><form id="manual-claim-form"><label for="manual-text">Qualification</label><textarea id="manual-text" name="text" required></textarea><div class="row"><div><label for="manual-category">Category</label><select id="manual-category" name="category">${['experience', 'project', 'skill', 'education', 'certification', 'achievement'].map(s => `<option>${s}</option>`).join('')}</select></div><div><label for="manual-source">Source</label><select id="manual-source" name="sourceId">${state.sources.map(s => `<option value="${s.id}">${e(s.title)}</option>`).join('')}</select></div></div><label for="manual-quote">Exact quote from the source</label><textarea id="manual-quote" name="quote" required></textarea><label for="manual-scope">Scope and your contribution</label><input id="manual-scope" name="scope" required><label for="manual-skills">Skills, separated by commas</label><input id="manual-skills" name="skills"><button class="primary">Save proposed claim</button></form>`);
}
function showJob(id) {
  const job = state.jobs.find(j => j.id === id);
  modal(`<div class="eyebrow">${e(job.company)}</div><h2>${e(job.title)}</h2><p>${e(job.location)}</p>${job.url ? `<a href="${e(job.url)}" target="_blank" rel="noopener noreferrer">Open company posting ↗</a>` : ''}<pre class="pre">${e(job.description)}</pre>${job.fit ? `<h3>Agent fit assessment · ${e(job.fit.status)}</h3><p>${e(job.fit.assessment)}</p><ul>${job.fit.gaps.map(g => `<li>${e(g)}</li>`).join('')}</ul>${button('Review assessment', 'task-detail', job.fit.taskId)}` : ''}<div class="actions">${button('Assess fit', 'fit-task', id)}${button('Draft resume', 'resume-task', id, 'primary')}</div>`);
}
async function showTask(id, created) {
  activeTask = created || await api('task-detail', { id });
  const t = activeTask;
  const renderCited = s => `<li>${e(s.text)} <small class="muted">[${e(s.claimIds.join(', '))}]</small></li>`;
  const result = t.result;
  let review = '';
  if (result && ['resume', 'resume-preview'].includes(t.kind)) review = `<div class="task-result"><h2>${e(state.profile.name)}</h2><h3>${e(result.headline)}</h3><ul>${result.summary.map(renderCited).join('')}</ul>${result.sections.map(s => `<h3>${e(s.title)}</h3><ul>${s.bullets.map(renderCited).join('')}</ul>`).join('')}<h3>Gaps</h3><ul>${result.gaps.map(g => `<li>${e(g)}</li>`).join('')}</ul>${t.kind === 'resume-preview' ? `<div class="hint">This preview uses proposed qualifications. Review and approve your claims, then create a new resume task for a final version.</div>${button('Download review draft', 'export-draft', t.id)}` : ''}</div>`;
  else if (result && t.kind === 'fit') review = `<div class="task-result"><p>${e(result.assessment)}</p><ul>${result.strengths.map(renderCited).join('')}</ul><h3>Gaps</h3><ul>${result.gaps.map(g => `<li>${e(g)}</li>`).join('')}</ul></div>`;
  else if (result) review = `<pre class="pre">${e(JSON.stringify(result, null, 2))}</pre>`;
  modal(`<h2>${e(t.kind)} task</h2>${pill(t.status, t.status === 'approved' ? 'green' : 'amber')}<p class="path">${e(t.directory || `${state.workspace}/tasks/${t.id}`)}</p>${t.status === 'pending' ? `<p class="subtle">Give prompt.md to your agent. Ask it to write result.json in this task folder, then paste the response below.</p><div class="actions">${button('Copy full prompt', 'copy-prompt')}${button('Download prompt', 'download-prompt')}</div><details><summary>Preview what the agent will receive</summary><pre class="pre">${e(t.prompt)}</pre></details><form id="task-import-form"><input type="hidden" name="id" value="${e(t.id)}"><label for="task-result">Agent response (JSON)</label><textarea id="task-result" name="result" required rows="8" placeholder="Paste result.json here"></textarea><button class="primary">Import for review</button></form>` : review}${result && ['fit', 'resume'].includes(t.kind) ? `<details><summary>Approved qualifications used by this task</summary>${(t.input?.claims || []).map(c => `<div class="item"><strong>${e(c.id)}</strong><p>${e(c.text)}</p><p class="subtle">${e(c.scope)} · ${e(c.limitations)}</p></div>`).join('')}</details>${t.status === 'needs-review' ? `<form id="task-approve-form"><input type="hidden" name="id" value="${e(t.id)}"><label class="inline-label"><input type="checkbox" required>I checked every statement against the cited qualifications.</label><button class="primary">Approve ${e(t.kind)}</button></form>` : ''}${t.status === 'approved' && t.kind === 'resume' ? `<div class="actions">${button('Download resume (.md)', 'export-resume', t.id, 'primary')}</div>` : ''}` : ''}`);
}
function download(name, value, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function action(name, id) {
  if (name === 'intake-tab') { intakeTab = id; render(); }
  if (name === 'source-detail') { const s = state.sources.find(s => s.id === id); modal(`<h2>${e(s.title)}</h2><p class="subtle">${e(s.kind)} · ${e(s.id)}</p><pre class="pre">${e(s.text)}</pre>`); }
  if (name === 'question') { stopVoice(); questionId = id; render(); }
  if (name === 'create-task' || name === 'resume-task' || name === 'fit-task') {
    const kind = name === 'resume-task' ? (state.claims.some(c => c.status === 'approved') ? 'resume' : 'resume-preview') : name === 'fit-task' ? 'fit' : id;
    const task = await api('task', { kind, ...(['resume', 'resume-preview', 'fit'].includes(kind) ? { jobId: id } : {}) });
    await refresh(); await showTask(task.id, task);
  }
  if (name === 'task-detail') await showTask(id);
  if (name === 'claim-detail') showClaim(id);
  if (name === 'manual-claim') showManualClaim();
  if (name === 'reject-claim' || name === 'unapprove-claim') { await api('claim-review', { id, status: name === 'reject-claim' ? 'rejected' : 'proposed' }); closeModal(); await refresh(); notify('Qualification updated.'); }
  if (name === 'job-detail') showJob(id);
  if (name === 'copy-prompt') { await navigator.clipboard.writeText(activeTask.prompt); notify('Prompt copied.'); }
  if (name === 'download-prompt') download(`${activeTask.id}-prompt.md`, activeTask.prompt);
  if (name === 'export-resume') { const out = await api('resume-export', { id }); download(`${state.profile.name || 'Resume'}-${id}.md`, out.markdown); notify('Resume exported to your workspace and downloaded.'); }
  if (name === 'export-draft') { const out = await api('draft-export', { id }); download(`${state.profile.name || 'Resume'}-${id}-DRAFT.md`, out.markdown); notify('Review draft downloaded. Confirm qualifications before applying.'); }
  if (name === 'github-import') { const result = await api('github-import', { repository: id }); await refresh(); notify(result.warning || 'Repository imported. Review your contribution before approving claims.'); }
  if (name === 'scout') {
    if (!state.boards.length) { await action('board-dialog'); return; }
    const results = await api('scout', {}); await refresh();
    notify(results.map(r => r.error ? `${r.company}: ${r.error}` : `${r.company}: ${r.added} new roles`).join(' · '), results.some(r => r.error));
  }
  if (name === 'board-dialog') modal(`<h2>Add a company job board</h2><p class="subtle">Use the board slug from its careers URL. Example: jobs.lever.co/company-name → company-name.</p><form id="board-form"><label for="board-name">Company</label><input id="board-name" name="name" required><label for="board-type">Job board service</label><select id="board-type" name="type"><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option><option value="ashby">Ashby</option></select><label for="board-slug">Board slug</label><input id="board-slug" name="slug" required pattern="[a-zA-Z0-9_-]+" placeholder="company-name"><button class="primary">Add board</button></form>`);
  if (name === 'job-dialog') modal(`<h2>Add an opportunity</h2><form id="job-form">${[['company', 'Company'], ['title', 'Job title'], ['location', 'Location'], ['url', 'Posting URL']].map(([key, label]) => `<label for="job-${key}">${label}</label><input id="job-${key}" name="${key}" ${['company', 'title'].includes(key) ? 'required' : ''} ${key === 'url' ? 'type="url"' : ''}>`).join('')}<label for="job-description">Job description</label><textarea id="job-description" name="description" required rows="8"></textarea><button class="primary">Add to feed</button></form>`);
  if (name === 'voice') startVoice();
}
function stopVoice() { if (recognition) { recognition.stop(); recognition = null; } }
function startVoice() {
  if (recognition) { stopVoice(); return; }
  if (!$('#voice-consent').checked) throw new Error('Allow browser dictation above before starting, or use on-device dictation.');
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) throw new Error('This browser does not support speech recognition. Use your device’s dictation or type your answer.');
  const field = $('#answer-text'), status = $('#voice-status');
  const instance = new Recognition(); recognition = instance; instance.lang = navigator.language || 'en-US'; instance.continuous = true; instance.interimResults = false;
  instance.onresult = event => { for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) field.value = `${field.value} ${event.results[i][0].transcript}`.trim(); field.dataset.voice = 'true'; };
  instance.onerror = event => { status.textContent = `Dictation stopped: ${event.error}. Your text is still here.`; recognition = null; };
  instance.onend = () => { recognition = null; if (status.isConnected && !status.textContent.includes('stopped:')) status.textContent = 'Dictation stopped. Review the transcript before saving.'; };
  instance.start(); status.textContent = 'Listening… Click Dictate again to stop. Review the transcript before saving.';
}
document.addEventListener('click', async event => {
  const el = event.target.closest('[data-action]');
  if (!el) return;
  el.disabled = true;
  try { await action(el.dataset.action, el.dataset.id); } catch (err) { notify(err.message, true); } finally { el.disabled = false; }
});
document.addEventListener('submit', async event => {
  const form = event.target; if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault(); const data = Object.fromEntries(new FormData(form)); const submit = form.querySelector('button[type=submit],button:not([type])');
  if (submit) submit.disabled = true;
  try {
    let message = 'Saved.', stay = false;
    switch (form.id) {
      case 'source-form': await api('source', data); message = 'Source added. Create a qualifications task when you’re ready.'; break;
      case 'file-form': {
        const file = data.file;
        if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file of 10 MB or smaller.');
        const b64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
        await api('file', { name: file.name, kind: data.kind, data: b64 }); message = 'Document imported locally.'; break;
      }
      case 'github-form': {
        const result = await api('github-list', data);
        $('#github-results').innerHTML = `<p class="subtle">${result.repos.length} public repositories${result.truncated ? ' (first 1,000)' : ''}</p>${result.repos.map(r => `<article class="item"><h3>${e(r.name)} ${r.fork ? pill('Fork') : ''}</h3><p>${e(r.description)}</p>${button('Import this repository', 'github-import', r.name)}</article>`).join('')}`; stay = true; message = 'Choose the repositories to include.'; break;
      }
      case 'github-direct-form': { const result = await api('github-import', data); message = result.warning || 'Repository imported.'; break; }
      case 'project-form': {
        const preview = await api('project-preview', data);
        $('#project-results').innerHTML = `<p class="subtle">${e(preview.note)}</p><form id="project-import-form"><input type="hidden" name="directory" value="${e(preview.root)}"><div class="check-list">${preview.files.map(f => `<label><input type="checkbox" name="file" value="${e(f.path)}" checked>${e(f.path)} (${f.bytes} bytes)</label>`).join('')}</div><button class="primary" ${preview.files.length ? '' : 'disabled'}>Import selected files</button></form>`; stay = true; message = 'Review the file list before importing.'; break;
      }
      case 'project-import-form': await api('project-import', { directory: data.directory, files: new FormData(form).getAll('file') }); message = 'Selected project files imported.'; break;
      case 'profile-form': await api('profile', { ...data, roles: split(data.roles), keywords: split(data.keywords), locations: split(data.locations), exclude: split(data.exclude) }); message = 'Search preferences saved.'; break;
      case 'answer-form': {
        stopVoice(); await api('answer', { ...data, mode: $('#answer-text').dataset.voice ? 'voice' : 'typed' });
        const index = state.questions.findIndex(q => q.id === data.questionId); questionId = state.questions[(index + 1) % state.questions.length].id; message = 'Answer saved as evidence.'; break;
      }
      case 'manual-claim-form': await api('claim', { ...data, skills: split(data.skills), evidence: [{ sourceId: data.sourceId, quote: data.quote }] }); closeModal(); message = 'Claim proposed. Review it before approving.'; break;
      case 'claim-review-form': await api('claim-review', { id: data.id, status: 'approved', changes: { text: data.text, scope: data.scope, skills: split(data.skills), limitations: data.limitations } }); closeModal(); message = 'Qualification approved.'; break;
      case 'board-form': await api('board', data); closeModal(); message = 'Board added. Refresh your feed to load current openings.'; break;
      case 'job-form': await api('job', data); closeModal(); message = 'Opportunity added.'; break;
      case 'task-import-form': await api('task-import', data); await refresh(); await showTask(data.id); stay = true; message = 'Agent output validated and staged for review.'; break;
      case 'task-approve-form': await api('task-approve', data); await refresh(); await showTask(data.id); stay = true; message = 'Review recorded.'; break;
      default: throw new Error('Unknown form.');
    }
    if (!stay) await refresh(); notify(message);
  } catch (err) { notify(err.message, true); } finally { if (submit) submit.disabled = false; }
});
function filterJobs() {
  const query = $('#job-search').value.toLowerCase(), status = $('#job-filter').value;
  $('#jobs-list').innerHTML = jobCards(state.feed.filter(j => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(query) && (status === 'all' || status === j.status)));
}
document.addEventListener('input', event => { if (event.target.id === 'job-search') filterJobs(); });
document.addEventListener('change', async event => {
  const el = event.target;
  if (el.id === 'claim-filter') $('#claims-list').innerHTML = claimCards(state.claims.filter(c => el.value === 'all' || c.status === el.value));
  if (el.id === 'job-filter') filterJobs();
  if (el.dataset.jobStatus) { try { await api('job-status', { id: el.dataset.jobStatus, status: el.value }); const job = state.jobs.find(j => j.id === el.dataset.jobStatus); job.status = el.value; state.feed.find(j => j.id === job.id).status = el.value; notify('Application status saved.'); } catch (err) { notify(err.message, true); } }
});
$('.dialog-close').addEventListener('click', closeModal);
window.addEventListener('hashchange', () => { stopVoice(); closeModal(); if (state) render(); });
window.addEventListener('beforeunload', stopVoice);
refresh().catch(err => { app.innerHTML = `<div class="empty"><strong>Workspace unavailable</strong><p>${e(err.message)} Start the local server and reload this page.</p></div>`; });
