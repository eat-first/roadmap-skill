# Claude Skill Verification

This repository includes `scripts/verify-claude-roadmap-skill.mjs` for end-to-end verification of the local roadmap MCP plus the project-installed roadmap skills when driven by a real local Claude Code instance.

The current flow is not just a smoke test. It exercises a broad CRUD-oriented scenario across the core roadmap capabilities.

## What it verifies

- Claude loads the project skills from `skills/` via an isolated workspace `.claude/skills`
- Claude actually invokes the expected project skills:
  - `roadmap`
  - `roadmap-task-flow`
  - `roadmap-planning-views`
  - `roadmap-web-visualization`
- Claude calls the local roadmap MCP tools for CRUD-oriented coverage:
  - projects: create, list, get, update, delete
  - tags: create, list, update, delete
  - tasks: create, list, get, update, delete
  - tag queries: `get_tasks_by_tag`
  - dependency views: create, list, get, update, delete
  - planning actions: add nodes, add edge, analyze dependency view
  - web tools: open and close the local web interface
- Claude also uses the local web API for backup verification:
  - `GET /api/backup`
  - `POST /api/backup`
- The roadmap MCP writes real project JSON into an isolated storage directory
- The stored JSON matches the structured report returned by Claude

## Run it

Two suites are available:

- `core` - skills + core CRUD + planning + web open/close
- `extended` - everything in `core` plus `get_tasks_by_tag` and backup export/import via the local web API

```bash
npm run verify:claude-skill:core -- --skip-build --keep-temp
npm run verify:claude-skill:extended -- --skip-build --keep-temp
```

The generic entry still exists and defaults to `extended`:

```bash
npm run verify:claude-skill -- --skip-build --keep-temp
```

Useful flags:

- `--skip-build` - reuse an existing `dist/` build
- `--keep-temp` - keep the temporary workspace, logs, MCP config, and isolated storage for inspection
- `--port <number>` - choose the port used for `open_web_interface`
- `--timeout-ms <number>` - override the Claude run timeout
- `--model <name>` - force a specific Claude model
- `--mode core|extended` - choose the verification suite when using the generic script entry

Example:

```bash
npm run verify:claude-skill:core -- --skip-build --keep-temp --port 7870
npm run verify:claude-skill:extended -- --skip-build --keep-temp --port 7871
```

## Artifacts

When the script runs, it prints an artifact root directory under the system temp folder. That directory contains:

- `artifacts/claude-stream.jsonl` - Claude event stream from `--verbose --output-format stream-json`
- `artifacts/claude-debug.log` - Claude debug log for skill-loading and MCP connection evidence
- `artifacts/prompt.txt` - exact verification prompt used for the run
- `artifacts/mcp-config.json` - isolated MCP configuration used for the Claude process
- `server-home/.roadmap-skill/projects/*.json` - the isolated roadmap data written by the MCP subprocess

The event stream should now show both roadmap MCP calls and two `Bash` invocations for the backup export/import round-trip.

## Isolation model

The script intentionally uses split isolation:

- Claude Code itself keeps the normal local login/session state
- The roadmap MCP subprocess gets its own isolated `HOME` / `USERPROFILE`
- The verification workspace gets its own `.claude/skills`

This design is necessary because fully isolating Claude's own home directory drops the local Claude login state on this machine.

## Pass / fail logic

The run only passes when all of the following are true:

- Claude returns structured output with `status: "passed"`
- The event stream shows real `Skill` tool invocations for the 4 roadmap skills
- The event stream shows the expected `mcp__roadmap__*` CRUD and planning tool calls
- The event stream shows `get_tasks_by_tag` coverage
- The event stream shows `Bash` usage for backup export/import through the local web API
- The Claude debug log shows the isolated project skills directory was loaded
- The Claude debug log shows the isolated roadmap MCP server connected
- The isolated storage directory contains a matching project JSON file with the expected updated project metadata, surviving tags, surviving tasks, and dependency views
- Deleted disposable entities are absent from the isolated storage snapshot
- The structured report confirms backup export/import counts with zero import errors

## Known limitations

- Claude Code must already be installed and logged in locally
- The script verifies Claude Code behavior, not just raw Anthropic API behavior
- This is not a browser-level UI test; it verifies the `open_web_interface` and `close_web_interface` tool path, not drag-and-drop UI interactions
- A failed run may still have partial artifacts in the temporary directory when `--keep-temp` is used
