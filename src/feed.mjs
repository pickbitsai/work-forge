import { id, now, requireText, safeUrl, mutate } from './store.mjs';
import { getJson, stripHtml } from './intake.mjs';

export const STATUSES = ['saved', 'preparing', 'applied', 'interviewing', 'offer', 'rejected', 'skipped', 'closed'];
export function addBoard(root, input) {
  if (!['greenhouse', 'lever', 'ashby'].includes(input.type)) throw new Error('Choose Greenhouse, Lever, or Ashby.');
  const slug = requireText(input.slug, 'Board slug', 100);
  if (!/^[a-z0-9_-]+$/i.test(slug)) throw new Error('Enter the board name, not a full URL.');
  const name = requireText(input.name, 'Company', 200);
  return mutate(root, state => {
    const existing = state.boards.find(b => b.type === input.type && b.slug === slug);
    if (existing) return existing;
    const board = { id: id('board'), name, type: input.type, slug };
    state.boards.push(board);
    return board;
  });
}
export function normalizeJobs(board, payload) {
  let rows;
  if (board.type === 'greenhouse') {
    if (!Array.isArray(payload.jobs)) throw new Error('Invalid Greenhouse response.');
    rows = payload.jobs.map(p => ({ externalId: String(p.id), title: p.title, location: p.location?.name || '', url: p.absolute_url, description: stripHtml(p.content), postedAt: p.updated_at || '' }));
  } else if (board.type === 'lever') {
    if (!Array.isArray(payload)) throw new Error('Invalid Lever response.');
    rows = payload.map(p => ({ externalId: String(p.id), title: p.text, location: p.categories?.location || '', url: p.hostedUrl, description: stripHtml([p.descriptionPlain || p.description, ...(p.lists || []).map(l => `${l.text}\n${l.content}`), p.additionalPlain || p.additional].join('\n')), postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : '' }));
  } else {
    if (!Array.isArray(payload.jobs)) throw new Error('Invalid Ashby response.');
    rows = payload.jobs.filter(p => p.isListed !== false).map(p => ({ externalId: p.id || p.jobUrl, title: p.title, location: [p.location, p.isRemote ? 'Remote' : ''].filter(Boolean).join(' · '), url: p.jobUrl, description: p.descriptionPlain || stripHtml(p.descriptionHtml), postedAt: p.publishedAt || '' }));
  }
  return rows.map(p => ({ ...p, title: requireText(p.title, 'Job title', 500), url: safeUrl(p.url), description: String(p.description || '').slice(0, 80000), key: `${board.type}:${board.slug}:${p.externalId}`, company: board.name, boardId: board.id }));
}
export async function fetchBoard(board, options) {
  const slug = encodeURIComponent(board.slug);
  const urls = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
    lever: `https://api.lever.co/v0/postings/${slug}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${slug}`
  };
  return normalizeJobs(board, await getJson(urls[board.type], options));
}
export async function scout(root, boards, options) {
  const results = [];
  for (const board of boards) {
    try {
      const jobs = await fetchBoard(board, options);
      const summary = mutate(root, state => {
        let added = 0;
        for (const job of jobs) {
          const old = state.jobs.find(j => j.key === job.key);
          if (old) {
            if (old.description !== job.description || old.title !== job.title) delete old.fit;
            Object.assign(old, job, { checkedAt: now(), available: true });
          } else { state.jobs.push({ ...job, id: id('job'), status: 'saved', available: true, createdAt: now(), checkedAt: now() }); added++; }
        }
        const current = new Set(jobs.map(j => j.key));
        for (const job of state.jobs.filter(j => j.boardId === board.id)) if (!current.has(job.key)) job.available = false;
        const savedBoard = state.boards.find(b => b.id === board.id);
        if (savedBoard) { savedBoard.checkedAt = now(); delete savedBoard.error; }
        return { company: board.name, fetched: jobs.length, added };
      });
      results.push(summary);
    } catch (e) {
      mutate(root, state => { const saved = state.boards.find(b => b.id === board.id); if (saved) saved.error = e.message; });
      results.push({ company: board.name, error: e.message });
    }
  }
  return results;
}
function contains(text, phrase) {
  const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
}
export function rankJobs(state) {
  const skills = [...new Set(state.claims.filter(c => c.status === 'approved').flatMap(c => c.skills))];
  return state.jobs.map(job => {
    const text = `${job.title}\n${job.description}`;
    const matchedSkills = skills.filter(s => contains(text, s));
    const matchedRoles = state.profile.roles.filter(s => contains(job.title, s));
    const matchedKeywords = state.profile.keywords.filter(s => contains(text, s));
    const locationMatch = !state.profile.locations.length || state.profile.locations.some(s => contains(job.location, s));
    const excluded = state.profile.exclude.some(s => contains(job.title, s));
    return { ...job, matchedSkills, matchedRoles, matchedKeywords, locationMatch, excluded, relevance: matchedSkills.length * 2 + matchedRoles.length * 5 + matchedKeywords.length * 2 };
  }).sort((a, b) => Number(a.excluded) - Number(b.excluded) || Number(b.locationMatch) - Number(a.locationMatch) || b.relevance - a.relevance || b.createdAt.localeCompare(a.createdAt));
}
export function addJob(root, input) {
  const job = { company: requireText(input.company, 'Company', 200), title: requireText(input.title, 'Role', 500), location: String(input.location || '').slice(0, 500), url: safeUrl(input.url), description: requireText(input.description, 'Job description', 80000) };
  return mutate(root, state => {
    if (job.url && state.jobs.some(j => j.url === job.url)) throw new Error('That posting is already in your feed.');
    const entry = { ...job, id: id('job'), status: 'saved', available: true, createdAt: now() };
    state.jobs.push(entry);
    return entry;
  });
}
export function setJobStatus(root, jobId, status) {
  if (!STATUSES.includes(status)) throw new Error('Invalid application status.');
  return mutate(root, state => {
    const job = state.jobs.find(j => j.id === jobId);
    if (!job) throw new Error('Job not found.');
    job.status = status; job.updatedAt = now();
    return job;
  });
}
