import { mutate, requireText, texts, now, id } from './store.mjs';

export function saveProfile(root, input) {
  const profile = {
    name: typeof input.name === 'string' ? input.name.trim().slice(0, 200) : '',
    headline: typeof input.headline === 'string' ? input.headline.trim().slice(0, 300) : '',
    roles: texts(input.roles || [], 'Roles'), locations: texts(input.locations || [], 'Locations'),
    keywords: texts(input.keywords || [], 'Keywords'), exclude: texts(input.exclude || [], 'Exclusions')
  };
  return mutate(root, state => { state.profile = profile; return profile; });
}
export function validateClaim(input, sources) {
  const text = requireText(input.text, 'Qualification', 3000);
  const categories = ['experience', 'project', 'skill', 'education', 'certification', 'achievement'];
  if (!categories.includes(input.category)) throw new Error(`Category must be one of: ${categories.join(', ')}.`);
  if (!Array.isArray(input.evidence) || !input.evidence.length || input.evidence.length > 20) throw new Error('Each claim needs 1–20 source citations.');
  const evidence = input.evidence.map(e => {
    const source = sources.find(s => s.id === e.sourceId);
    const quote = requireText(e.quote, 'Evidence quote', 5000);
    if (!source || !source.text.includes(quote)) throw new Error('Evidence quotes must exactly match a known source.');
    return { sourceId: source.id, quote };
  });
  return { text, category: input.category, skills: texts(input.skills || [], 'Skills'), scope: requireText(input.scope || 'Not specified', 'Scope', 1000), limitations: typeof input.limitations === 'string' ? input.limitations.slice(0, 2000) : '', evidence };
}
export function propose(root, input) {
  return mutate(root, state => {
    const claim = { ...validateClaim(input, state.sources), id: id('claim'), status: 'proposed', createdAt: now() };
    state.claims.push(claim);
    return claim;
  });
}
export function reviewClaim(root, claimId, status, changes) {
  if (!['approved', 'rejected', 'proposed'].includes(status)) throw new Error('Invalid review status.');
  return mutate(root, state => {
    const claim = state.claims.find(c => c.id === claimId);
    if (!claim) throw new Error('Qualification not found.');
    if (changes) Object.assign(claim, validateClaim({ ...claim, ...changes }, state.sources));
    claim.status = status;
    claim.reviewedAt = now();
    // Any approved evidence change invalidates prior fit and resume approvals.
    for (const job of state.jobs) { delete job.fit; }
    for (const task of state.tasks) {
      if (['resume', 'fit'].includes(task.kind) && task.status === 'approved') task.status = 'needs-review';
    }
    return claim;
  });
}
export function answer(root, questionId, text, mode = 'typed') {
  if (!['typed', 'voice'].includes(mode)) throw new Error('Invalid answer mode.');
  text = requireText(text, 'Answer', 15000);
  // A single transaction keeps the answer and its immutable source snapshot together.
  return mutate(root, state => {
    const question = state.questions.find(q => q.id === questionId);
    if (!question) throw new Error('Question not found.');
    const source = { id: id('src'), title: `Interview: ${questionId}`, kind: 'interview', text: `Question: ${question.question}\nAnswer: ${text}`, url: '', createdAt: now() };
    state.sources.push(source);
    const entry = { questionId, text, mode, sourceId: source.id, updatedAt: now() };
    state.answers = state.answers.filter(a => a.questionId !== questionId);
    state.answers.push(entry);
    return entry;
  });
}
