# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-14

### Added
- **Graph View**: Added a full dependency graph workspace powered by React Flow for sequencing work, visualizing blockers, and reviewing execution order
- **Dependency Editing**: Added atomic dependency edge updates, inline dependency actions, and richer graph-side editing flows
- **Graph Export**: Added image export support for dependency views in the web workspace
- **Workspace Metadata**: Added repository and version metadata for the web workspace header and API responses
- **Agent Tooling**: Added agent-friendly dependency view read models, mutation change metadata, and dedicated dependency view tool coverage
- **Planning Skills**: Added the initial roadmap skill pack for roadmap routing, task flow, planning views, and web visualization guidance

### Changed
- **Dependency Planning UX**: Improved dependency view layout, controls, inline actions, ready/done presentation, and detailed task rendering
- **Workspace State**: Improved dependency view selection, persisted workspace state, graph layout stability, and general interaction polish
- **Graph Layout Engine**: Bundled `elkjs` support for graph layout improvements in the web client
- **Task Creation Flow**: Added an active-only status filter to the Add Tasks modal so large graphs are easier to extend
- **Prompt Behavior**: Normalized optional argument handling in project prompts to reduce branching friction for Agents
- **Documentation**: Expanded README messaging around Graph View, refreshed screenshots, and added Chinese README updates for the new planning experience

### Fixed
- **Mutation Responses**: Stabilized dependency view mutation responses and moved dependency change metadata generation into the service layer
- **Graph Persistence**: Fixed dependency view persistence and layout stability across workspace sessions
- **Metadata Detection**: Improved fallback behavior for app metadata resolution in the web server
- **Repository Cleanup**: Removed temporary root screenshots from the repository

## [0.2.11] - 2026-03-09

### Fixed
- **MCP Prompts**: Added non-intrusive task hints to `open-web-ui` and `quick-capture` prompts
- **Port Display**: Fixed NaN display when port parameter is not provided in `open-web-ui` prompt
- **Prompt Wording**: Removed command-like phrasing that could be misidentified as injection attempts


## [0.2.10] - 2026-02-27

### Added
- **Contributing Section**: Added Contributing section to README (en/zh)

### Changed
- **README**: Revamped copy for both en/zh versions, improved clarity and tone
- **Tag ID Workflow**: Unified tag-id handling with deterministic color fallback


## [0.2.9] - 2026-02-26

### Added
- **Development Scripts**: Added `dev:web`, `dev:server`, `dev:full`, and `inspector` npm scripts
- **Vite Proxy**: Frontend dev server now proxies API requests to backend automatically
- **Verbose Parameter**: Tools now support `verbose` parameter for compact vs full data responses
- **Summary Types**: Added `TaskSummary` and `ProjectSummary` types for lightweight responses
- **MCP Inspector**: Added `npm run inspector` command for debugging MCP server

### Changed
- **UI Layout**: Moved filter bar to header alongside title for better space usage
- **Compact Mode**: Optimized spacing, removed tags, reduced margins and padding
- **Hover Animation**: Reduced card hover displacement from `-translate-y-1` to `-translate-y-0.5`
- **Create Button**: Changed task creation button color to project theme green

### Fixed
- **Completed Tasks**: Fixed "All" filter to properly include completed tasks via `includeCompleted` parameter

## [0.2.8] - 2026-02-26

### Fixed
- **MCP Transport**: Resolved stdio transport issues for better CLI compatibility
- **Tag System**: Improved tag management and display in task cards

### Changed
- Updated README with latest features and improvements

## [0.2.7] - 2026-02-26

### Fixed
- **Static Files Path**: Corrected bundled static files path for npx environment execution

### Added
- **Release Documentation**: Added release workflow documentation to AGENTS.md

## [0.2.6] - 2026-02-26

### Fixed
- **Static Files Path**: Resolved static files path resolution for npx execution environment

## [0.2.5] - 2026-02-26

### Added
- **NovaBoard UI**: Integrated tag system with NovaBoard-style dashboard design
- **Tag System**: Full tag management with color coding and filtering

### Fixed
- **Server Path**: Use `__dirname` instead of `process.cwd()` for reliable static files path resolution

## [0.2.0] - 2026-02-10

### Added
- **Kanban Priority Sorting**: Tasks are now sorted by priority (Critical > High > Medium > Low) within each column
- **Task Creation Modal**: Added a dedicated modal for creating tasks with priority selection
- **Smooth Animations**: Added CSS animations for modal transitions, task card hover effects, and drag interactions
- **Agent Progress Sync Reminder**: Enhanced prompts to remind agents to update task status using `update_task` tool

### Changed
- Converted prompt text from Chinese to English for consistency

### Fixed
- Task priority is now properly utilized in the UI

## [0.1.0] - 2026-02-10

### Added
- Initial release with Web UI and Kanban board
- MCP server with full tool support (projects, tasks, tags)
- Local JSON file storage
- Auto browser open functionality
- Bilingual README (English/Chinese)
