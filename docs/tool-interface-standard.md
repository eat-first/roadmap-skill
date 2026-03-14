# Tool Interface Standard

This document describes the public MCP tool contract exposed by `roadmap-skill`.

Scope:

- public tools registered in `src/server.ts`
- shared input and output conventions
- category-level guidance for common tool calls

This document does not treat `src/tools/template-tools.ts` as public, because those utilities are not currently registered in the server's `allTools` list.

`roadmap-skill` also exposes MCP resources and prompts through `src/server.ts`, but this document focuses on the public tool surface only.

## Invocation Model

The MCP server exposes tools through the standard `list_tools` and `call_tool` request flow.

Relevant implementation:

- tool registration: `src/server.ts`
- tool definitions: `src/tools/`

At runtime:

1. `list_tools` returns each tool `name`, `description`, and `inputSchema`.
2. `call_tool` accepts a tool name and argument object.
3. The server executes the tool and serializes the result as JSON text.

## Schema Standard

Most tools define input with Zod `inputSchema`. The web tools use a plain `parameters` object, but the server normalizes both forms into JSON schema for MCP clients.

Common input rules:

- IDs are strings
- date-only values use `YYYY-MM-DD`
- nullable fields use `null`
- optional fields are omitted when not needed
- many read and mutation tools support `verbose: true` to return fuller data

## Result Standard

### Tool-Level Result Pattern

Most data-oriented tools return one of these shapes:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "error": "Human-readable message" }
```

Some failures also include a stable `code` field, such as `NOT_FOUND`.

### MCP Transport Pattern

The server wraps the tool result as text content:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"success\": true, \"data\": ...\n}"
    }
  ]
}
```

If a tool throws instead of returning a failure envelope, the server returns `isError: true` and text like:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Tool execution failed: <message>"
    }
  ],
  "isError": true
}
```

### Exception: Web Tools

`open_web_interface` and `close_web_interface` return direct objects like:

```json
{ "message": "Web interface started successfully and opened in browser", "url": "http://localhost:7860" }
```

They do not use the `{ success, data }` envelope on success. Clients should treat them as operational tools rather than data-model CRUD tools.

## Shared Conventions

### IDs and References

- `projectId` identifies a project
- `taskId` identifies a task
- `tagId` identifies a tag
- `viewId` identifies a dependency view
- `edgeId` identifies a dependency edge
- task tags are referenced by tag ID, not by tag name

### Enum Values

Project types:

- `roadmap`
- `skill-tree`
- `kanban`

Project status:

- `active`
- `completed`
- `archived`

Task status:

- `todo`
- `in-progress`
- `review`
- `done`

Task priority:

- `low`
- `medium`
- `high`
- `critical`

Batch task tag operations:

- `add`
- `remove`
- `replace`

### Summary vs Verbose

Many tools default to compact, agent-friendly summary objects. When `verbose: true` is provided, the tool usually returns the full stored structure.

Use summary mode when:

- deciding what to do next
- reviewing lists
- minimizing context size

Use verbose mode when:

- editing the full object
- inspecting raw node or edge layout data
- debugging storage-level details

## Public Tool Categories

The public MCP surface currently exposes 30 tools.

### Project Tools

Defined in `src/tools/project-tools.ts`.

| Tool | Key Input | Default Output |
| --- | --- | --- |
| `create_project` | `name`, `description`, `projectType`, `startDate`, `targetDate` | project summary |
| `list_projects` | `verbose?` | project summaries |
| `get_project` | `projectId`, `verbose?` | project with summarized tasks |
| `update_project` | `projectId` plus changed fields | updated project summary |
| `delete_project` | `projectId` | `{ deleted: true }` |

### Task Tools

Defined in `src/tools/task-tools.ts`.

| Tool | Key Input | Default Output |
| --- | --- | --- |
| `create_task` | `projectId`, `title`, `description`, `priority`, `tags` | task summary |
| `list_tasks` | optional project/status/priority/tag filters | task summaries |
| `get_task` | `projectId`, `taskId` | full task |
| `update_task` | `projectId`, `taskId` plus changed fields | task summary |
| `delete_task` | `projectId`, `taskId` | `{ deleted: true }` |
| `batch_update_tasks` | `projectId`, `taskIds`, batch fields | `{ updatedTasks, updatedCount, notFoundIds }` |

Notes:

- `list_tasks` excludes `done` tasks by default unless `includeCompleted: true` is passed.
- `dueDate` uses `YYYY-MM-DD`.
- `assignee` and `dueDate` may be set to `null` in updates.

### Tag Tools

Defined in `src/tools/tag-tools.ts`.

| Tool | Key Input | Default Output |
| --- | --- | --- |
| `create_tag` | `projectId`, `name`, `color?`, `description` | tag |
| `list_tags` | `projectId` | tags |
| `update_tag` | `projectId`, `tagId` plus changed fields | updated tag |
| `delete_tag` | `projectId`, `tagId` | `{ deleted, tag, tasksUpdated }` |
| `get_tasks_by_tag` | `projectId`, `tagName` | `{ tag, tasks, count }` |

Notes:

- `create_tag` can generate color deterministically when `color` is omitted.
- `get_tasks_by_tag` uses a tag name lookup, not a tag ID input.

### Dependency View Tools

Defined in `src/tools/dependency-view-tools.ts`.

| Tool | Key Input | Default Output |
| --- | --- | --- |
| `create_dependency_view` | `projectId`, `name`, `description?`, `dimension?` | dependency view summary |
| `list_dependency_views` | `projectId`, `includeTasks?`, `verbose?` | summaries, or hydrated snapshots when `includeTasks` is true |
| `get_dependency_view` | `projectId`, `viewId`, `verbose?` | hydrated agent view by default |
| `update_dependency_view` | `projectId`, `viewId` plus changed fields | updated summary |
| `delete_dependency_view` | `projectId`, `viewId` | `{ deleted: true }` |
| `add_task_to_dependency_view` | `projectId`, `viewId`, `taskId`, optional node fields | mutation summary with `changes` |
| `update_dependency_view_node` | `projectId`, `viewId`, `taskId`, optional node fields | mutation summary with `changes` |
| `batch_update_dependency_view_nodes` | `projectId`, `viewId`, `nodes[]` | mutation summary with `changes` |
| `remove_task_from_dependency_view` | `projectId`, `viewId`, `taskId` | mutation summary with `changes` |
| `add_dependency_view_edge` | `projectId`, `viewId`, `fromTaskId`, `toTaskId` | mutation summary with `changes` |
| `update_dependency_view_edge` | `projectId`, `viewId`, `edgeId`, optional task endpoints | mutation summary with `changes` |
| `remove_dependency_view_edge` | `projectId`, `viewId`, `edgeId` | mutation summary with `changes` |
| `analyze_dependency_view` | `projectId`, `viewId` | dependency analysis |

Important behavior:

- `get_dependency_view` returns an agent-friendly hydrated view by default, not raw internal node coordinates.
- `list_dependency_views` returns compact summaries by default.
- `verbose: true` returns raw dependency view structures with node layout and edge internals.
- mutation tools return a compact summary with `changes` unless `verbose: true` is requested.

### Web Workspace Tools

Defined in `src/tools/web-tools.ts`.

| Tool | Key Input | Default Output |
| --- | --- | --- |
| `open_web_interface` | `port?` | `{ message, url }` |
| `close_web_interface` | none | `{ message }` |

Use these tools when a human or agent wants to inspect the local workspace visually.

## Practical Calling Guidance

- prefer list tools first, then get details only for the selected entity
- use summary mode by default to reduce context size
- switch to `verbose: true` only when raw fields are necessary
- use IDs returned by earlier calls instead of reconstructing them manually
- do not assume template tools are publicly callable unless they are added to `src/server.ts`

## Canonical References

- public registration: `src/server.ts`
- tool exports: `src/tools/index.ts`
- data model: `src/models/index.ts`
- architecture overview: `docs/architecture.md`
