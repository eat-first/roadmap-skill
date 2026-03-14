# Architecture

`roadmap-skill` is a local-first roadmap workspace built around three public surfaces:

- an MCP server for structured roadmap operations
- a local web workspace for visual planning
- a skill pack for agent-oriented workflows

This document is the canonical high-level architecture reference for agents and contributors.

## System Overview

The repository is organized around a local planning loop:

1. An MCP client calls a public tool exposed by the server.
2. The server validates input and dispatches the request to a tool implementation.
3. Services and storage mutate or read JSON-backed project data.
4. The web workspace reads the same local state through HTTP endpoints.
5. Skills document higher-level workflows that compose the MCP surface.

Because the MCP server and the web workspace share the same local data model, a change made in chat can be reviewed visually, and a change made in the UI can be reused by an agent in later calls.

## Main Components

### MCP Server

- Entry point: `src/server.ts`
- Tool exports: `src/tools/index.ts`
- Resources: `src/resources/`
- Prompts: `src/prompts/`

The MCP server registers the public tool list in `src/server.ts` and exposes:

- tools for project, task, tag, dependency view, and web workspace operations
- resources for reading structured roadmap data
- prompts for common roadmap workflows

The server converts each tool schema into MCP-compatible JSON schema and serializes each tool result as JSON text in the MCP response.

### Tool Layer

Public MCP tools live under `src/tools/`.

Current public categories are:

- project tools
- task tools
- tag tools
- dependency view tools
- web workspace tools

Important note: `src/tools/template-tools.ts` exists in the codebase, but those template utilities are not currently registered in `src/server.ts`. They should be treated as internal utilities unless the server registration changes.

### Service Layer

- Services: `src/services/`

The service layer contains domain logic for tasks, tags, and dependency views. It is responsible for validation beyond schema shape, mutation semantics, and agent-friendly read models for dependency views.

### Storage Layer

- Storage implementation: `src/storage/index.ts`
- Path helpers: `src/utils/path-helpers.ts`

Roadmap data is stored as local JSON files in the user's home directory.

Default storage locations:

- Windows: `%USERPROFILE%\\.roadmap-skill`
- macOS: `~/.roadmap-skill/`
- Linux: `~/.roadmap-skill/`

This local-first storage model is a core product constraint. The project does not require accounts, hosted sync, or a remote database.

### Web Workspace

- Web server: `src/web/server.ts`
- App entry: `src/web/app/App.tsx`

The web workspace exposes the same roadmap state through a browser interface. The main user-facing modes are:

- Kanban view for task status
- Graph View for dependency planning and sequencing

The MCP tool `open_web_interface` starts the local web server and opens the workspace in a browser. The workspace is intended for visual inspection and editing, not as a separate hosted SaaS deployment.

### Skill Pack

- Skills root: `skills/`

The repository also ships installable skills that help agent frameworks use the MCP surface more effectively. These skill docs are workflow-oriented, while the MCP tools remain the canonical execution surface.

The skills are distributed through the Git repository under `skills/`. As noted in `README.md`, they are not part of the published npm package.

## Public Surface vs Internal Implementation

Stable public surfaces are:

- MCP tools registered in `src/server.ts`
- MCP resources registered in `src/server.ts`
- MCP prompts registered in `src/server.ts`
- the local web workspace opened through `open_web_interface`

Internal implementation details include:

- storage internals under `src/storage/`
- domain logic under `src/services/`
- unregistered utilities such as `src/tools/template-tools.ts`

Agents and external integrators should treat the public surface as the stable contract, and the internal modules as implementation details that may evolve.

## Public Data Model

Core entities live in `src/models/index.ts`.

Main public entities:

- `Project`
- `Task`
- `Tag`
- `DependencyView`

Relationship summary:

- a project owns tasks, tags, milestones, and dependency views
- a task belongs to exactly one project
- a task stores tag references by tag ID
- a dependency view belongs to one project and references tasks by task ID
- dependency edges connect two task IDs inside a dependency view

## Interaction Model

The recommended interaction model is:

1. discover projects and tasks through MCP tools
2. mutate roadmap state through MCP tools
3. inspect Kanban or Graph View in the web workspace when visual confirmation helps
4. use skills and prompts to accelerate recurring workflows

This is why the project is described as a shared workspace for humans and agents, rather than as a standalone task board.

## Tool Contract Reference

For concrete tool input and output rules, see `docs/tool-interface-standard.md`.

## Canonical Entry Points

Agents should prioritize these files when grounding on the repository:

- `README.md`
- `llms.txt`
- `docs/architecture.md`
- `docs/tool-interface-standard.md`
- `AGENTS.md`
