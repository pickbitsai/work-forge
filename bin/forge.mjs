#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { init, load } from '../src/store.mjs';
import { addSource, extractFile, previewProject, importProject, listGithub, importGithub } from '../src/intake.mjs';
import { answer, propose, reviewClaim, saveProfile } from '../src/qualifications.mjs';
import { createTask, importTask, runAdapter, approveTask, exportResume, exportDraft } from '../src/tasks.mjs';
import { addBoard, addJob, scout, rankJobs, setJobStatus } from '../src/feed.mjs';
import { serve } from '../src/server.mjs';

const args = process.argv.slice(2), positional = [], options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    if (['help', 'confirm', 'import'].includes(key)) options[key] = true;
    else { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for --${key}`); options[key] = args[++i]; }
  } else positional.push(args[i]);
}
const [command = 'help', subject, extra] = positional;
const root = path.resolve(options.workspace || process.env.WORK_FORGE_WORKSPACE || 'workspace');
const print = value => console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const help = `Work Forge — a local qualifications repository and job feed

Start:
  work-forge init [--workspace path]
  work-forge serve [--port 4660]

Evidence:
  work-forge add <file> [--kind resume|linkedin|project|other]
  work-forge project <directory>                 Preview eligible files
  work-forge project <directory> --import        Import the previewed selection
  work-forge github <username>                  List public repositories
  work-forge github <owner/repo> --import        Import a selected repo + README
  work-forge interview                          Guided terminal interview
  work-forge answer <question-id> --file answer.txt
  work-forge profile profile.json
  work-forge propose claim.json                 Stage a cited claim
  work-forge review <claim-id> --status approved|rejected --confirm

Bring your agent:
  work-forge task qualifications|interview
  work-forge task fit|resume|resume-preview --job <job-id>
  work-forge import-task <task-id> result.json
  work-forge run <task-id> --config agent.local.json
  work-forge approve-task <task-id> --confirm
  work-forge export-resume <task-id>
  work-forge export-draft <task-id>              Clearly marked review copy

Job feed:
  work-forge board --type greenhouse|lever|ashby --slug company --name Company
  work-forge scout
  work-forge job job.json
  work-forge status <job-id> --status applied
  work-forge feed
  work-forge inspect                            Full local state as JSON

All commands accept --workspace. No provider account is required for intake,
review, or scouting. See docs/AGENT_WORKFLOW.md for CLI and VS Code handoff.`;
try {
  if (command === 'help' || options.help) print(help);
  else {
    init(root);
    switch (command) {
      case 'init': print({ workspace: root, message: 'Ready. Run work-forge serve, or add your first resume.' }); break;
      case 'serve': await serve(root, Number(options.port || 4660)); break;
      case 'inspect': print(load(root)); break;
      case 'add': print(addSource(root, { title: path.basename(subject), kind: options.kind || 'resume', text: await extractFile(subject, fs.readFileSync(subject)) })); break;
      case 'project': print(options.import ? importProject(root, subject) : previewProject(subject)); break;
      case 'github': print(options.import ? await importGithub(root, subject) : await listGithub(subject)); break;
      case 'profile': print(saveProfile(root, readJson(subject))); break;
      case 'propose': print(propose(root, readJson(subject))); break;
      case 'review':
        if (!options.confirm) throw new Error('Inspect the claim and its evidence, then repeat with --confirm to record your review.');
        print(reviewClaim(root, subject, options.status)); break;
      case 'answer': print(answer(root, subject, fs.readFileSync(options.file, 'utf8'))); break;
      case 'interview': {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          print('Answer in your own words. Enter /skip to move on or /done to finish. Answers save after each question.');
          for (const q of load(root).questions) {
            if (load(root).answers.some(a => a.questionId === q.id)) continue;
            const response = await rl.question(`\n${q.question}\n> `);
            if (response === '/done') break;
            if (response === '/skip' || !response.trim()) continue;
            answer(root, q.id, response);
          }
        } finally { rl.close(); }
        print('Answers saved. Create a qualifications task to extract proposed claims.'); break;
      }
      case 'task': { const task = createTask(root, subject, options.job); print({ ...task, prompt: undefined, next: `Read ${task.directory}/prompt.md in your agent; write result.json, then import-task ${task.id} <result-file>.` }); break; }
      case 'import-task': print(importTask(root, subject, fs.readFileSync(extra, 'utf8'))); break;
      case 'run': print(await runAdapter(root, subject, readJson(options.config))); break;
      case 'approve-task':
        if (!options.confirm) throw new Error('Review the cited output, then repeat with --confirm to approve.');
        print(approveTask(root, subject)); break;
      case 'export-resume': print(exportResume(root, subject)); break;
      case 'export-draft': print(exportDraft(root, subject)); break;
      case 'board': print(addBoard(root, { type: options.type, slug: options.slug, name: options.name })); break;
      case 'scout': print(await scout(root, load(root).boards)); break;
      case 'job': print(addJob(root, readJson(subject))); break;
      case 'status': print(setJobStatus(root, subject, options.status)); break;
      case 'feed': print(rankJobs(load(root))); break;
      default: throw new Error(`Unknown command: ${command}. Run --help.`);
    }
  }
} catch (error) { console.error(`Work Forge: ${error.message}`); process.exitCode = 1; }
