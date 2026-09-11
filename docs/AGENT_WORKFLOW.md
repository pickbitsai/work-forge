# Use your CLI or VS Code agent

Work Forge uses files as the integration boundary. Any agent that can read text
and produce JSON can participate. No provider SDK, paid API plan, extension,
particular model, or proprietary agent session is required by Work Forge.

## Interactive workflow

1. Start the app (`npm start`) and import your resume, LinkedIn text, selected
   GitHub repositories, or local project files. Answer a few interview questions.
2. Choose **Build qualifications**. Open the resulting task's `prompt.md` in your
   existing CLI or editor agent. It includes the instructions, full input, and an
   example output. You can also copy or download the prompt from the app.
3. Ask: **“Follow this Work Forge task. Read only this packet. Write result.json
   alongside prompt.md. Leave approvals to me.”** This also works by attaching or
   pasting the prompt into an agent without filesystem access.
4. Paste the JSON response into the task's import form, or run:

   ```sh
   node bin/forge.mjs import-task TASK_ID workspace/tasks/TASK_ID/result.json
   ```

5. Review each proposed qualification. Check the exact quote and what it proves.
   Adjust the wording and scope; approve only statements you can substantiate.
6. Add target companies and refresh the feed. Select a role to create a fit or
   resume task. Import and review its result before downloading the resume.

Names such as Claude Code, Copilot, Codex, Gemini CLI, Cline, Roo, and other editor
agents describe possible hosts for this text workflow, not tested native integrations.
Do not assume an editor automatically reads this repo's AGENTS.md: explicitly give
it the task's prompt.md. Agent approval policies and provider data handling remain
those of the tool you choose.

## Optional command adapter

For CLIs with a noninteractive mode, configure an executable that reads the task
prompt from stdin and writes only the response JSON to stdout. The file adapter
does not depend on provider-specific flags. Use your CLI's own documentation to
choose its noninteractive arguments and restrictions.

Create `agent.local.json` (ignored by Git):

```json
{
  "command": "/absolute/path/to/agent-executable",
  "args": ["your-cli-specific-json-output-argument"],
  "timeoutMs": 600000
}
```

Then:

```sh
node bin/forge.mjs run TASK_ID --config agent.local.json
```

The command runs in the task folder with no shell interpolation. Arguments must be
a string array. The runner inherits the environment so your existing CLI login
works; it does not remove authentication variables or override agent permissions.
On Windows, use a native `.exe` or `node` with the CLI's JavaScript entry point.
`.cmd` and `.bat` shell wrappers are deliberately unsupported. Adapter output is
limited to 1 MB, and failed or timed-out runs leave the task pending.

The runner sends an adapter-mode preface requesting JSON on stdout. If stdout is
not valid JSON and the agent writes a fresh `result.json` instead, the runner
imports that file. For Claude Code, arguments `["-p","--output-format","text","--tools",""]`
keep it on stdout. An `ANTHROPIC_API_KEY` environment variable (even an empty one)
overrides subscription login for `claude -p`.

The runner is an integration convenience, not a security sandbox. Configure your
agent's own file/network permissions. A cloud-backed agent can transmit every byte
in the packet to its provider. Private sources stay local until you choose to hand
them to an agent; local-only inference requires a local agent/model and its own
network controls.

## Task contract

| Task | Inputs | Validated output | Owner review |
|---|---|---|---|
| Qualifications | Source text, existing claims, interview answers | Proposed claims with exact source quotes | Required per claim |
| Interview | Sources, answers, existing questions | Up to 12 follow-up questions | Answer or skip |
| Fit | Approved claims, preferences, selected job | Assessment, cited strengths, evidence gaps | Required |
| Resume | Approved claims, identity, selected job | Headline, cited summary, cited section bullets, gaps | Required before export |
| Resume preview | Proposed or approved cited claims, identity, selected job | Same structured resume, explicitly provisional | Draft-only; cannot be approved as final |

The importer checks structure, exact quote membership, claim IDs, and whether the
input changed since the task was created. Citations establish traceability; they
cannot prove that a paraphrase is logically supported. The owner must review that.
Results cannot approve themselves. Regenerate a packet if its inputs become stale.

No applications are submitted and no messages are sent by this application.
