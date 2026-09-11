# Architecture

Node ES modules provide one core implementation for the CLI and local HTTP UI.
The frontend uses browser APIs and no build step. PDF.js and Mammoth are the only
runtime parsing dependencies.

| Module | Responsibility |
|---|---|
| store.mjs | Versioned state, atomic writes, lock, generated Markdown views |
| intake.mjs | Text/document extraction, local project selection, public GitHub reads |
| qualifications.mjs | Profile, interview answers, cited claims, owner review |
| feed.mjs | ATS adapters, deduplication, relevance, application statuses |
| tasks.mjs | Portable packets, output validation, stale-input detection, CLI adapter |
| server.mjs | Loopback HTTP routes, request validation, UI assets |

State changes use a short exclusive filesystem lock. External fetches finish before
the lock is acquired, and mutations reload state at commit time. A failed operation
does not partially update canonical JSON. Human-readable views are regenerated
after successful changes. A crash can leave a `.write-lock`; stop all instances
before manually removing that file to recover. Use a workspace on a local disk.

Source records are immutable snapshots. Claims carry exact substrings from their
sources, status, scope, skill labels, and limitations. Re-answering an interview
keeps previous sources so citations remain explainable. Multiple versions can
conflict: the owner must resolve those conflicts before approving claims.

Task input fingerprints prevent results being imported or resumes exported against
changed qualifications, identity, or job descriptions. Every rendered resume
sentence and bullet is associated with approved claim IDs; headings remain subject
to owner review. Validation proves shape and references, not truth or entailment.

Job discovery fetches the boards the user configures. All listings are retained;
relevance is recomputed from preferences and approved skill labels. There is no
machine-learned fit percentage. A separate agent fit task identifies supported
requirements and gaps. A successful refresh marks disappeared listings unavailable
without deleting application history; failed boards retain their previous state.

## Current boundaries

Version 0.1 is a local single-user tool. There is no hosted multi-user deployment,
account authentication, automatic LinkedIn session access, project execution,
automatic model selection, scheduled refresh daemon, email, or application
submission. Source and job imports are manual actions. Refresh can be scheduled
outside the app by running `scout`. Final resume export is Markdown; a document
editor or your agent can produce PDF/Word after reviewing the content.

## Upstream references

- [GitHub repositories REST API](https://docs.github.com/en/rest/repos/repos)
- [GitHub repository contents and README API](https://docs.github.com/en/rest/repos/contents)
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Ashby public posting API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [PDF.js examples](https://mozilla.github.io/pdf.js/examples/)
- [Mammoth text extraction](https://github.com/mwilliamson/mammoth.js)
- [Browser SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
