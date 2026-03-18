#!/usr/bin/env node

import { mkdtemp, mkdir, cp, writeFile, readFile, rm, readdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const distEntry = path.join(repoRoot, 'dist', 'index.js');
const skillsSourceDir = path.join(repoRoot, 'skills');

const nodeInstallDir = path.dirname(process.execPath);
const npmCliPath = path.join(nodeInstallDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');

const npmCommand = process.platform === 'win32' ? process.execPath : 'npm';
const claudeCommand = process.platform === 'win32' ? 'claude.exe' : 'claude';

const reportSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'skillsIntended', 'project', 'tags', 'tasks', 'planning', 'backup', 'web', 'issues'],
  properties: {
    status: { type: 'string', enum: ['passed', 'failed'] },
    summary: { type: 'string' },
    skillsIntended: {
      type: 'array',
      items: { type: 'string' },
    },
    project: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'created', 'listed', 'fetched', 'updated', 'temporaryDeleted'],
      properties: {
        id: { type: ['string', 'null'] },
        name: { type: 'string' },
        created: { type: 'boolean' },
        listed: { type: 'boolean' },
        fetched: { type: 'boolean' },
        updated: { type: 'boolean' },
        temporaryDeleted: { type: 'boolean' },
      },
    },
    tags: {
      type: 'object',
      additionalProperties: false,
      required: ['createdCount', 'listed', 'updatedName', 'deletedTemporary', 'names'],
      properties: {
        createdCount: { type: 'number' },
        listed: { type: 'boolean' },
        updatedName: { type: 'string' },
        deletedTemporary: { type: 'boolean' },
        names: { type: 'array', items: { type: 'string' } },
      },
    },
    tasks: {
      type: 'object',
      additionalProperties: false,
      required: ['createdCount', 'listed', 'fetchedTaskId', 'deletedTaskId', 'ids', 'statuses', 'taggedTaskCount'],
      properties: {
        createdCount: { type: 'number' },
        listed: { type: 'boolean' },
        fetchedTaskId: { type: ['string', 'null'] },
        deletedTaskId: { type: ['string', 'null'] },
        ids: { type: 'array', items: { type: 'string' } },
        statuses: { type: 'array', items: { type: 'string' } },
        taggedTaskCount: { type: 'number' },
      },
    },
    planning: {
      type: 'object',
      additionalProperties: false,
      required: ['viewId', 'viewCreated', 'listed', 'fetched', 'updated', 'temporaryDeleted', 'nodeCount', 'edgeCount', 'readyTaskIds', 'blockedTaskIds'],
      properties: {
        viewId: { type: ['string', 'null'] },
        viewCreated: { type: 'boolean' },
        listed: { type: 'boolean' },
        fetched: { type: 'boolean' },
        updated: { type: 'boolean' },
        temporaryDeleted: { type: 'boolean' },
        nodeCount: { type: 'number' },
        edgeCount: { type: 'number' },
        readyTaskIds: { type: 'array', items: { type: 'string' } },
        blockedTaskIds: { type: 'array', items: { type: 'string' } },
      },
    },
    backup: {
      type: 'object',
      additionalProperties: false,
      required: ['exported', 'imported', 'projectCount', 'importedCount', 'errorCount'],
      properties: {
        exported: { type: 'boolean' },
        imported: { type: 'boolean' },
        projectCount: { type: 'number' },
        importedCount: { type: 'number' },
        errorCount: { type: 'number' },
      },
    },
    web: {
      type: 'object',
      additionalProperties: false,
      required: ['opened', 'closed', 'url', 'port'],
      properties: {
        opened: { type: 'boolean' },
        closed: { type: 'boolean' },
        url: { type: ['string', 'null'] },
        port: { type: 'number' },
      },
    },
    issues: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};

function parseArgs(argv) {
  const options = {
    keepTemp: false,
    skipBuild: false,
    timeoutMs: 8 * 60 * 1000,
    model: null,
    port: 7868,
    mode: 'extended',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--keep-temp') {
      options.keepTemp = true;
    } else if (arg === '--skip-build') {
      options.skipBuild = true;
    } else if (arg === '--model') {
      options.model = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--port') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --port value: ${argv[index + 1] ?? ''}`);
      }
      options.port = value;
      index += 1;
    } else if (arg === '--timeout-ms') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --timeout-ms value: ${argv[index + 1] ?? ''}`);
      }
      options.timeoutMs = value;
      index += 1;
    } else if (arg === '--mode') {
      const value = argv[index + 1] ?? '';
      if (value !== 'core' && value !== 'extended') {
        throw new Error(`Invalid --mode value: ${value}`);
      }
      options.mode = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function createMarker() {
  return `verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function logStep(message) {
  process.stdout.write(`[verify] ${message}\n`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command, args, options = {}) {
  const {
    cwd = repoRoot,
    env = process.env,
    timeoutMs = 120000,
    stdinText = null,
  } = options;

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (settled) {
        return;
      }

      settled = true;
      resolve({ code: code ?? -1, stdout, stderr });
    });

    if (stdinText !== null) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}

async function ensureBuild(skipBuild) {
  if (skipBuild && await exists(distEntry)) {
    return;
  }

  if (!skipBuild && await exists(distEntry)) {
    logStep('Using existing build in dist/. Pass --skip-build to avoid this check only.');
    return;
  }

  logStep('Building project so Claude can launch the local MCP server...');
  const buildArgs = process.platform === 'win32'
    ? [npmCliPath, 'run', 'build']
    : ['run', 'build'];
  const result = await runCommand(npmCommand, buildArgs, { timeoutMs: 10 * 60 * 1000 });
  if (result.code !== 0) {
    throw new Error(`Build failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
}

function createPrompt({ marker, projectName, viewName, port, mode }) {
  const temporaryProjectName = `${projectName} Disposable`;
  const updatedProjectName = `${projectName} Updated`;
  const updatedTagName = 'ui-frontend';
  const temporaryTagName = 'obsolete';
  const temporaryViewName = `${viewName} Disposable`;

  const workflowLines = [
    '1. Explicitly load the `roadmap` skill, then orient yourself and start the verification workflow.',
    `2. Create one roadmap project named "${projectName}" with description "${marker}" and a 2026 date range.`,
    `3. Create one extra disposable roadmap project named "${temporaryProjectName}" for delete testing.`,
    '4. List projects and confirm the main created project is visible.',
    '5. Get the main project by ID.',
    `6. Update the main project name to "${updatedProjectName}".`,
    '7. Delete the disposable project.',
    '8. Explicitly load the `roadmap-task-flow` skill before doing backlog work.',
    `9. Create exactly 3 tags named frontend, security, and ${temporaryTagName}.`,
    '10. List tags.',
    `11. Update the frontend tag name to "${updatedTagName}".`,
    `12. Delete the ${temporaryTagName} tag.`,
    '13. Create exactly 4 tasks named "Design workflow", "Harden storage", "Verify workspace", and "Disposable cleanup" with mixed priorities.',
    '14. List tasks for the project with includeCompleted=true.',
    '15. Get the "Design workflow" task by ID.',
    '16. Update one task to in-progress and another to done.',
    '17. Delete the disposable cleanup task.',
    '18. Batch add tags so at least 2 remaining tasks have tags.',
    '19. Explicitly load the `roadmap-planning-views` skill before planning-view work.',
    `20. Create one dependency view named "${viewName}" and one disposable dependency view named "${temporaryViewName}".`,
    '21. List dependency views.',
    '22. Get the main dependency view by ID.',
    '23. Update the main dependency view metadata.',
    '24. Add at least 2 tasks into the main dependency view, create 1 dependency edge, and analyze the view.',
    '25. Delete the disposable dependency view.',
    '26. Explicitly load the `roadmap-web-visualization` skill before the web check.',
  ];

  if (mode === 'extended') {
    workflowLines.splice(18, 0, '19. Run get_tasks_by_tag for the updated frontend tag name and confirm it returns tagged tasks.');
    workflowLines.push(`27. Open the local web interface on port ${port}, note the URL, then keep it running for backup testing.`);
    workflowLines.push(`28. Using Bash, request http://localhost:${port}/api/backup, parse the JSON, and then POST the same JSON back to http://localhost:${port}/api/backup.`);
    workflowLines.push('29. Close the local web interface.');
    workflowLines.push('30. Return the final structured output only. If anything fails, mark status as failed and explain it in issues.');
  } else {
    workflowLines.push(`27. Open the local web interface on port ${port}, note the URL, then close it.`);
    workflowLines.push('28. Return the final structured output only. If anything fails, mark status as failed and explain it in issues.');
  }

  return [
    'You are validating the project-installed roadmap skills and the configured roadmap MCP server in an isolated workspace.',
    'You must explicitly load these project skills during the run because the verification checks for real skill invocations: roadmap, roadmap-task-flow, roadmap-planning-views, roadmap-web-visualization.',
    'Complete the whole workflow without asking follow-up questions.',
    `Verification mode: ${mode}. In core mode, skip advanced tag-query and backup checks. In extended mode, include them.`,
    'Use the configured roadmap MCP server for roadmap operations.',
    '',
    'Workflow:',
    ...workflowLines,
    '',
    'Important reporting rules:',
    '- project.id must be the real project ID you created.',
    '- project.name must be the final updated main project name.',
    '- tasks.ids must contain the real created task IDs.',
    '- tasks.deletedTaskId must be the real deleted disposable task ID.',
    '- tags.names must contain the real created tag names.',
    '- tags.updatedName must be the final updated tag name.',
    '- planning.viewId must be the real dependency view ID.',
    '- In extended mode only: backup.projectCount must equal the number of projects in the exported backup JSON.',
    '- In extended mode only: backup.importedCount and backup.errorCount must come from the import response.',
    '- web.url must be the actual URL returned by open_web_interface or null if it failed.',
  ].join('\n');
}

function parseJsonLines(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => JSON.parse(line));
}

function collectToolUses(events) {
  const toolUses = [];

  for (const event of events) {
    if (event.type !== 'assistant') {
      continue;
    }

    const content = event.message?.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const block of content) {
      if (block?.type === 'tool_use') {
        toolUses.push({ name: block.name, input: block.input ?? null });
      }
    }
  }

  return toolUses;
}

function extractStructuredOutput(events) {
  const resultEvent = [...events].reverse().find((event) => event.type === 'result');
  if (!resultEvent || typeof resultEvent.structured_output !== 'object' || resultEvent.structured_output === null) {
    throw new Error('Claude did not return structured_output in the final result event.');
  }

  return resultEvent.structured_output;
}

async function loadProjectStorage(tempStorageHome) {
  const storageDir = path.join(tempStorageHome, '.roadmap-skill', 'projects');
  if (!await exists(storageDir)) {
    return { storageDir, projects: [] };
  }

  const fileNames = (await readdir(storageDir)).filter((name) => name.endsWith('.json'));
  const projects = [];

  for (const fileName of fileNames) {
    const filePath = path.join(storageDir, fileName);
    const raw = await readFile(filePath, 'utf-8');
    projects.push({ filePath, data: JSON.parse(raw) });
  }

  return { storageDir, projects };
}

function evaluateRun({ report, toolUses, debugLog, storageSnapshot, workspaceSkillsDir, promptPort, marker, mode }) {
  const failures = [];
  const toolNames = toolUses.map((toolUse) => toolUse.name);
  const skillUseInputs = toolUses
    .filter((toolUse) => toolUse.name === 'Skill')
    .map((toolUse) => JSON.stringify(toolUse.input ?? {}));

  const expectedSkills = ['roadmap', 'roadmap-task-flow', 'roadmap-planning-views', 'roadmap-web-visualization'];
  for (const skillName of expectedSkills) {
    const matched = skillUseInputs.some((input) => input.includes(skillName));
    if (!matched) {
      failures.push(`Claude did not invoke the expected skill: ${skillName}`);
    }
  }

  const expectedToolNames = [
    'mcp__roadmap__create_project',
    'mcp__roadmap__list_projects',
    'mcp__roadmap__get_project',
    'mcp__roadmap__update_project',
    'mcp__roadmap__delete_project',
    'mcp__roadmap__create_tag',
    'mcp__roadmap__list_tags',
    'mcp__roadmap__update_tag',
    'mcp__roadmap__delete_tag',
    'mcp__roadmap__create_task',
    'mcp__roadmap__list_tasks',
    'mcp__roadmap__get_task',
    'mcp__roadmap__delete_task',
    'mcp__roadmap__batch_update_tasks',
    'mcp__roadmap__create_dependency_view',
    'mcp__roadmap__list_dependency_views',
    'mcp__roadmap__get_dependency_view',
    'mcp__roadmap__update_dependency_view',
    'mcp__roadmap__delete_dependency_view',
    'mcp__roadmap__add_task_to_dependency_view',
    'mcp__roadmap__add_dependency_view_edge',
    'mcp__roadmap__analyze_dependency_view',
    'mcp__roadmap__open_web_interface',
    'mcp__roadmap__close_web_interface',
  ];

  if (mode === 'extended') {
    expectedToolNames.push('mcp__roadmap__get_tasks_by_tag', 'Bash');
  }
  for (const toolName of expectedToolNames) {
    if (!toolNames.includes(toolName)) {
      failures.push(`Claude did not call the expected roadmap MCP tool: ${toolName}`);
    }
  }

  if (!debugLog.includes(`project=[${workspaceSkillsDir}]`)) {
    failures.push('Claude debug log did not show the isolated project skills directory.');
  }

  if (!/project:\s*4/.test(debugLog)) {
    failures.push('Claude debug log did not report 4 project skills loaded.');
  }

  if (!debugLog.includes('MCP server "roadmap": Connection established')) {
    failures.push('Claude debug log did not confirm the isolated roadmap MCP server connected.');
  }

  const matchingProject = storageSnapshot.projects.find((project) => project.data?.project?.description === marker);
  if (!matchingProject) {
    failures.push('No project JSON file matching the verification marker was written to isolated storage.');
  }

  if (storageSnapshot.projects.some((project) => typeof project.data?.project?.name === 'string' && project.data.project.name.includes('Disposable'))) {
    failures.push('Isolated storage still contains a disposable project that should have been deleted.');
  }

  if (matchingProject) {
    const projectData = matchingProject.data;
    if (projectData.project.name !== report.project.name) {
      failures.push('Stored project name does not match Claude report.');
    }
    if (projectData.project.id !== report.project.id) {
      failures.push('Stored project ID does not match Claude report.');
    }
    if (!Array.isArray(projectData.tags) || projectData.tags.length < 2) {
      failures.push('Stored project does not contain at least 2 tags.');
    }
    if (!Array.isArray(projectData.tasks) || projectData.tasks.length < 3) {
      failures.push('Stored project does not contain at least 3 tasks.');
    }

    const tagNames = new Set(projectData.tags.map((tag) => tag.name));
    if (!tagNames.has(report.tags.updatedName) || !tagNames.has('security')) {
      failures.push('Stored project tags do not reflect the expected updated names.');
    }
    if (tagNames.has('obsolete')) {
      failures.push('Stored project still contains the disposable tag.');
    }

    const taggedTaskCount = projectData.tasks.filter((task) => Array.isArray(task.tags) && task.tags.length > 0).length;
    if (taggedTaskCount < 2) {
      failures.push('Stored project does not show tags on at least 2 tasks.');
    }

    const taskIds = new Set(projectData.tasks.map((task) => task.id));
    if (report.tasks.deletedTaskId && taskIds.has(report.tasks.deletedTaskId)) {
      failures.push('Stored project still contains the deleted disposable task.');
    }

    if (!Array.isArray(projectData.dependencyViews) || projectData.dependencyViews.length < 1) {
      failures.push('Stored project does not contain a dependency view.');
    } else {
      const dependencyView = projectData.dependencyViews[0];
      if (!Array.isArray(dependencyView.nodes) || dependencyView.nodes.length < 2) {
        failures.push('Dependency view does not contain at least 2 nodes.');
      }
      if (!Array.isArray(dependencyView.edges) || dependencyView.edges.length < 1) {
        failures.push('Dependency view does not contain at least 1 edge.');
      }
    }

    if (projectData.dependencyViews.some((view) => view.id !== report.planning.viewId && view.name.includes('Disposable'))) {
      failures.push('Stored project still contains the disposable dependency view.');
    }
  }

  if (report.status !== 'passed') {
    failures.push(`Claude reported overall status=${report.status}.`);
  }

  if (!report.project.fetched || !report.project.updated) {
    failures.push('Claude report did not confirm full project CRUD coverage.');
  }

  if (!report.tags.listed || !report.tags.deletedTemporary) {
    failures.push('Claude report did not confirm full tag CRUD coverage.');
  }

  if (!report.tasks.listed || !report.tasks.fetchedTaskId || !report.tasks.deletedTaskId) {
    failures.push('Claude report did not confirm full task CRUD coverage.');
  }

  if (!report.planning.listed || !report.planning.fetched || !report.planning.updated) {
    failures.push('Claude report did not confirm full planning-view CRUD coverage.');
  }

  if (mode === 'extended') {
    if (!report.backup.exported || !report.backup.imported) {
      failures.push('Claude report did not confirm backup export/import coverage.');
    }

    if (report.backup.projectCount < 1 || report.backup.importedCount < 1 || report.backup.errorCount !== 0) {
      failures.push('Claude report shows unexpected backup/import counts.');
    }
  }

  const reportStatuses = new Set(report.tasks.statuses);
  if (!reportStatuses.has('in-progress') || !reportStatuses.has('done')) {
    failures.push('Claude report did not capture both in-progress and done task states.');
  }

  if (!report.web.opened || !report.web.closed) {
    failures.push('Claude report did not confirm both open and close web interface operations.');
  }
  if (report.web.port !== promptPort) {
    failures.push(`Claude report used unexpected web port ${report.web.port}; expected ${promptPort}.`);
  }

  return {
    passed: failures.length === 0,
    failures,
    toolNames,
    skillUseInputs,
    storageDir: storageSnapshot.storageDir,
    storedProjectFile: matchingProject?.filePath ?? null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const marker = createMarker();
  const projectName = `Roadmap Skill Verification ${marker}`;
  const viewName = `Verification View ${marker}`;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'roadmap-claude-verify-'));
  const workspaceDir = path.join(tempRoot, 'workspace');
  const workspaceClaudeDir = path.join(workspaceDir, '.claude');
  const workspaceSkillsDir = path.join(workspaceClaudeDir, 'skills');
  const tempStorageHome = path.join(tempRoot, 'server-home');
  const artifactsDir = path.join(tempRoot, 'artifacts');
  const mcpConfigPath = path.join(artifactsDir, 'mcp-config.json');
  const streamPath = path.join(artifactsDir, 'claude-stream.jsonl');
  const debugPath = path.join(artifactsDir, 'claude-debug.log');
  const promptPath = path.join(artifactsDir, 'prompt.txt');
  const evaluationPath = path.join(artifactsDir, 'evaluation.json');

  try {
    logStep(`Artifacts will be written to ${tempRoot}`);
    await ensureBuild(options.skipBuild);
    await mkdir(workspaceSkillsDir, { recursive: true });
    await mkdir(tempStorageHome, { recursive: true });
    await mkdir(artifactsDir, { recursive: true });
    await cp(skillsSourceDir, workspaceSkillsDir, { recursive: true });
    await writeFile(path.join(workspaceClaudeDir, 'settings.json'), '{}\n', 'utf-8');

    const mcpConfig = {
      mcpServers: {
        roadmap: {
          command: process.execPath,
          args: [distEntry],
          env: {
            HOME: tempStorageHome,
            USERPROFILE: tempStorageHome,
          },
        },
      },
    };
    await writeFile(mcpConfigPath, `${JSON.stringify(mcpConfig, null, 2)}\n`, 'utf-8');

    const prompt = createPrompt({
      marker,
      projectName,
      viewName,
      port: options.port,
      mode: options.mode,
    });
    await writeFile(promptPath, `${prompt}\n`, 'utf-8');

    logStep('Checking Claude Code availability...');
    const versionResult = await runCommand(claudeCommand, ['--version'], { timeoutMs: 30000 });
    if (versionResult.code !== 0) {
      throw new Error(`Claude CLI is not available.\nSTDERR:\n${versionResult.stderr}`);
    }

    const claudeArgs = [
      '-p',
      '--verbose',
      '--output-format',
      'stream-json',
      '--json-schema',
      JSON.stringify(reportSchema),
      '--mcp-config',
      mcpConfigPath,
      '--strict-mcp-config',
      '--setting-sources',
      'user,project',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
      '--debug-file',
      debugPath,
      '--permission-mode',
      'bypassPermissions',
    ];

    if (options.model) {
      claudeArgs.push('--model', options.model);
    }

    claudeArgs.push(prompt);

    logStep('Running Claude Code verification flow...');
    const claudeResult = await runCommand(claudeCommand, claudeArgs, {
      cwd: workspaceDir,
      timeoutMs: options.timeoutMs,
    });

    await writeFile(streamPath, claudeResult.stdout, 'utf-8');

    if (claudeResult.code !== 0) {
      throw new Error(`Claude run failed with exit code ${claudeResult.code}.\nSTDOUT saved to ${streamPath}\nSTDERR:\n${claudeResult.stderr}`);
    }

    const events = parseJsonLines(claudeResult.stdout);
    const toolUses = collectToolUses(events);
    const report = extractStructuredOutput(events);
    const debugLog = await readFile(debugPath, 'utf-8');
    const storageSnapshot = await loadProjectStorage(tempStorageHome);
    const evaluation = evaluateRun({
      report,
      toolUses,
      debugLog,
      storageSnapshot,
      workspaceSkillsDir,
      promptPort: options.port,
      marker,
      mode: options.mode,
    });

    const output = {
      passed: evaluation.passed,
      mode: options.mode,
      marker,
      artifacts: {
        root: tempRoot,
        streamPath,
        debugPath,
        promptPath,
        mcpConfigPath,
        storageDir: evaluation.storageDir,
      },
      report,
      toolNames: evaluation.toolNames,
      skillInvocations: evaluation.skillUseInputs,
      failures: evaluation.failures,
      storedProjectFile: evaluation.storedProjectFile,
    };

    await writeFile(evaluationPath, `${JSON.stringify(output, null, 2)}\n`, 'utf-8');

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

    if (!evaluation.passed) {
      process.exitCode = 1;
    }
  } finally {
    if (!options.keepTemp && process.exitCode !== 1) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
