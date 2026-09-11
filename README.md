# Work Forge

Build a reusable qualifications repository from your actual work, then use it to
find opportunities and prepare tailored resumes with the CLI or editor agent you
already use. Everything starts on your computer in plain JSON and Markdown files.

## Start locally

Requires **Node.js 22.13 or newer**. Windows, macOS, and Linux use the same commands.

```sh
npm install
npm start
```

Open **http://127.0.0.1:4660**. Start by adding a source; no model login is needed
for imports, the interview, manual claims, or job scouting.

To use the terminal instead:

```sh
node bin/forge.mjs init
node bin/forge.mjs add /path/to/resume.pdf --kind resume
node bin/forge.mjs interview
node bin/forge.mjs task qualifications
```

Use `node bin/forge.mjs --help` for every command. `npm link` optionally installs
the `work-forge` command. A different data location can be supplied with
`--workspace /path/to/private-workspace` on any command, or `WORK_FORGE_WORKSPACE`.

## What it does

- **Collect evidence:** PDF/DOCX resumes, pasted text, Markdown, HTML, CSV, and
  JSON. LinkedIn uses profile text or an extracted export file. GitHub discovery
  lists public repositories for a username; import only those you select.
- **Inspect local projects:** preview a bounded selection of source files and
  documentation. Git ignores are respected; hidden files, credentials, generated
  output, dependencies, and symlinks are excluded. Review selected text for sensitive
  details. Imports do not execute project code.
- **Interview in text or voice:** eight starting questions, resumable answers,
  and agent-generated follow-ups. Browser dictation requires your consent and a
  supported speech service. OS dictation or typed answers work as a fallback.
- **Build qualifications:** an agent proposes cited claims. You edit the scope,
  check the evidence, and approve or reject each claim. You can also add cited
  claims manually.
- **Create a work feed:** add Greenhouse, Lever, or Ashby company boards, or paste
  a job description. Refresh listings, see keyword relevance against your approved
  skills and preferences, and track applications. Unmatched jobs remain available
  when your interests change.
- **Prepare resumes:** give a task packet to any text-capable CLI or VS Code
  agent. Import a structured result with citations, review it, and export Markdown.
  Fit assessments explain evidence gaps separately from keyword relevance.

If you want an early review copy before approving claims, create a `resume-preview`
task. It can use proposed cited qualifications and exports only a clearly marked
draft. It cannot be approved or exported as a final resume. Review the qualifications
and create a fresh normal resume task when ready.

[Agent workflow and adapter setup](docs/AGENT_WORKFLOW.md) ·
[Data and privacy](docs/DATA_AND_PRIVACY.md) ·
[Architecture and current boundaries](docs/ARCHITECTURE.md)

## Private workspace, public software

The public source contains no user's qualifications, contact details, job history,
or resumes. A fresh installation has an empty profile and empty job boards.

```text
workspace/                 # private; excluded from Git and release bundles
  state.json               # canonical profile, sources, claims, jobs, and tasks
  qualifications.md        # generated owner-approved inventory
  interview.md             # generated interview transcript
  feed.md                  # generated application board
  tasks/<id>/              # prompt, input, example, and validated output
  outputs/                 # approved resume exports
```

Source imports and GitHub/ATS reads do not send your qualifications to those sites.
Agent task packets contain your evidence: sharing one with a cloud agent sends it
to that provider under your agent settings. Browser dictation may use a remote
speech service. This is a single-user localhost app, not a hosted multi-user service.

## Share the software

```sh
npm run check
npm test
npm run bundle
```

The bundle command builds `dist/work-forge-local-0.1.0.tgz` and a release manifest
from the public source allowlist. It excludes the workspace, local adapter settings,
logs, and credentials. Extract the bundle, enter the `package` folder, run
`npm install`, then `npm start`. To publish a GitHub template, use this project
folder as a **new repository**; never publish a parent directory containing
personal work. Review the bundle manifest before publishing.

MIT licensed. This release supplies a working file-based agent handoff and a generic
stdin/stdout runner. It does not promise native automation for every CLI's changing
flags, automatic LinkedIn scraping, OCR, a hosted account system, automatic
applications, or voice recognition in every browser.
