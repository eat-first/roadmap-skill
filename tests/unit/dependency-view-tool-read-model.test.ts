import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as path from 'path';

import type { DependencyView, ProjectData } from '../../src/models/index.js';
import {
  addDependencyViewEdgeTool,
  addTaskToDependencyViewTool,
  batchUpdateDependencyViewNodesTool,
  createDependencyViewTool,
  getDependencyViewTool,
  listDependencyViewsTool,
  removeDependencyViewEdgeTool,
  removeTaskFromDependencyViewTool,
  updateDependencyViewEdgeTool,
  updateDependencyViewNodeTool,
} from '../../src/tools/dependency-view-tools.js';
import { createTaskTool } from '../../src/tools/task-tools.js';
import { writeJsonFile, ensureDir } from '../../src/utils/file-helpers.js';

class TestableStorage {
  private storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
  }

  async ensureDirectory(): Promise<void> {
    await ensureDir(this.storageDir);
  }

  getFilePath(projectId: string): string {
    return path.join(this.storageDir, `${projectId}.json`);
  }

  async createProjectData(projectData: ProjectData): Promise<void> {
    await this.ensureDirectory();
    await writeJsonFile(this.getFilePath(projectData.project.id), projectData);
  }
}

function expectSuccess(result: { success: boolean; data?: unknown; error?: string }): unknown {
  if (!result.success) {
    throw new Error(result.error ?? 'Expected success result');
  }

  return result.data;
}

describe('dependency view tool read model', () => {
  let tempDir: string;
  let testStorage: TestableStorage;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roadmap-skill-dependency-view-read-model-'));
    testStorage = new TestableStorage(tempDir);

    const { storage } = await import('../../src/storage/index.js');
    Object.defineProperty(storage, 'storageDir', {
      value: tempDir,
      writable: true,
      configurable: true,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createTestProject(name: string = 'Dependency Project'): Promise<ProjectData> {
    const now = new Date().toISOString();
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const projectData: ProjectData = {
      version: 1,
      project: {
        id: projectId,
        name,
        description: 'Test description',
        projectType: 'roadmap',
        status: 'active',
        startDate: '2026-01-01',
        targetDate: '2026-12-31',
        createdAt: now,
        updatedAt: now,
      },
      milestones: [],
      tasks: [],
      tags: [],
      dependencyViews: [],
    };

    await testStorage.createProjectData(projectData);
    return projectData;
  }

  async function createTask(projectId: string, title: string): Promise<{ id: string }> {
    return expectSuccess(await createTaskTool.execute({
      projectId,
      title,
      description: 'Task description',
      priority: 'medium',
      tags: [],
    })) as { id: string };
  }

  it('returns hydrated task snapshots by default without internal node or edge fields', async () => {
    const project = await createTestProject();
    const taskA = await createTask(project.project.id, 'Design API');
    const taskB = await createTask(project.project.id, 'Ship UI');

    const view = expectSuccess(await createDependencyViewTool.execute({
      projectId: project.project.id,
      name: 'Delivery Plan',
      description: 'Tracks delivery order',
      verbose: true,
    })) as DependencyView;

    expectSuccess(await addTaskToDependencyViewTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      taskId: taskA.id,
      x: 120,
      y: 240,
      collapsed: true,
      note: 'Hidden from Agent by default',
    }));
    expectSuccess(await addTaskToDependencyViewTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      taskId: taskB.id,
    }));

    expectSuccess(await addDependencyViewEdgeTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      fromTaskId: taskA.id,
      toTaskId: taskB.id,
      verbose: true,
    }));

    const agentView = expectSuccess(await getDependencyViewTool.execute({
      projectId: project.project.id,
      viewId: view.id,
    })) as {
      id: string;
      projectId: string;
      name: string;
      description: string;
      revision: number;
      nodeCount: number;
      edgeCount: number;
      nodes: Array<{
        taskId: string;
        task: {
          id: string;
          title: string;
          status: string;
          priority: string;
          dueDate: string | null;
          assignee: string | null;
          tags: string[];
        };
      }>;
      edges: Array<{
        id: string;
        fromTaskId: string;
        toTaskId: string;
      }>;
    };

    expect(agentView).toMatchObject({
      id: view.id,
      projectId: project.project.id,
      name: 'Delivery Plan',
      description: 'Tracks delivery order',
      revision: 4,
      nodeCount: 2,
      edgeCount: 1,
    });
    expect(agentView.nodes).toEqual([
      {
        taskId: taskA.id,
        task: {
          id: taskA.id,
          title: 'Design API',
          status: 'todo',
          priority: 'medium',
          dueDate: null,
          assignee: null,
          tags: [],
        },
      },
      {
        taskId: taskB.id,
        task: {
          id: taskB.id,
          title: 'Ship UI',
          status: 'todo',
          priority: 'medium',
          dueDate: null,
          assignee: null,
          tags: [],
        },
      },
    ]);
    expect(agentView.nodes[0]).not.toHaveProperty('x');
    expect(agentView.nodes[0]).not.toHaveProperty('y');
    expect(agentView.nodes[0]).not.toHaveProperty('collapsed');
    expect(agentView.nodes[0]).not.toHaveProperty('note');
    expect(agentView.edges).toEqual([
      {
        id: expect.any(String),
        fromTaskId: taskA.id,
        toTaskId: taskB.id,
      },
    ]);
    expect(agentView.edges[0]).not.toHaveProperty('kind');
  });

  it('keeps raw node and edge fields when verbose is true', async () => {
    const project = await createTestProject();
    const task = await createTask(project.project.id, 'Design API');

    const view = expectSuccess(await createDependencyViewTool.execute({
      projectId: project.project.id,
      name: 'Raw View',
      description: '',
      verbose: true,
    })) as DependencyView;

    expectSuccess(await addTaskToDependencyViewTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      taskId: task.id,
      x: 120,
      y: 240,
      collapsed: true,
      note: 'Visible only in verbose mode',
    }));

    const rawView = expectSuccess(await getDependencyViewTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      verbose: true,
    })) as DependencyView;

    expect(rawView.nodes[0]).toMatchObject({
      taskId: task.id,
      x: 120,
      y: 240,
      collapsed: true,
      note: 'Visible only in verbose mode',
    });
  });

  it('keeps list_dependency_views summary by default and hydrates only when requested', async () => {
    const project = await createTestProject();
    const task = await createTask(project.project.id, 'Ship UI');

    const view = expectSuccess(await createDependencyViewTool.execute({
      projectId: project.project.id,
      name: 'List View',
      description: 'Used for list hydration',
      verbose: true,
    })) as DependencyView;

    expectSuccess(await addTaskToDependencyViewTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      taskId: task.id,
      x: 88,
      y: 144,
      collapsed: true,
      note: 'Not part of hydrated list view',
    }));

    const summaryList = expectSuccess(await listDependencyViewsTool.execute({
      projectId: project.project.id,
    })) as Array<{
      id: string;
      nodeCount: number;
      edgeCount: number;
    }>;

    expect(summaryList).toEqual([
      {
        id: view.id,
        projectId: project.project.id,
        name: 'List View',
        description: 'Used for list hydration',
        dimension: null,
        revision: 2,
        nodeCount: 1,
        edgeCount: 0,
      },
    ]);

    const hydratedList = expectSuccess(await listDependencyViewsTool.execute({
      projectId: project.project.id,
      includeTasks: true,
    })) as Array<{
      id: string;
      nodes: Array<{
        taskId: string;
        task: {
          id: string;
          title: string;
        };
      }>;
      edges: Array<unknown>;
    }>;

    expect(hydratedList[0].nodes).toEqual([
      {
        taskId: task.id,
        task: {
          id: task.id,
          title: 'Ship UI',
          status: 'todo',
          priority: 'medium',
          dueDate: null,
          assignee: null,
          tags: [],
        },
      },
    ]);
    expect(hydratedList[0].nodes[0]).not.toHaveProperty('x');
    expect(hydratedList[0].nodes[0]).not.toHaveProperty('note');
    expect(hydratedList[0].edges).toEqual([]);

    const rawList = expectSuccess(await listDependencyViewsTool.execute({
      projectId: project.project.id,
      verbose: true,
    })) as DependencyView[];

    expect(rawList[0].nodes[0]).toMatchObject({
      taskId: task.id,
      x: 88,
      y: 144,
      collapsed: true,
      note: 'Not part of hydrated list view',
    });
  });

  it('returns change metadata for node and edge mutations by default', async () => {
    const project = await createTestProject();
    const taskA = await createTask(project.project.id, 'Task A');
    const taskB = await createTask(project.project.id, 'Task B');

    const view = expectSuccess(await createDependencyViewTool.execute({
      projectId: project.project.id,
      name: 'Mutation View',
      description: '',
      verbose: true,
    })) as DependencyView;

    const addNodeResult = expectSuccess(await addTaskToDependencyViewTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      taskId: taskA.id,
    })) as {
      revision: number;
      changes: { addedNodeIds: string[] };
    };
    expect(addNodeResult.revision).toBe(2);
    expect(addNodeResult.changes.addedNodeIds).toEqual([taskA.id]);

    const batchNodeResult = expectSuccess(await batchUpdateDependencyViewNodesTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      nodes: [{ taskId: taskA.id, x: 32, y: 64 }],
    })) as {
      changes: { updatedNodeIds: string[] };
    };
    expect(batchNodeResult.changes.updatedNodeIds).toEqual([taskA.id]);

    expectSuccess(await addTaskToDependencyViewTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      taskId: taskB.id,
    }));

    const addEdgeResult = expectSuccess(await addDependencyViewEdgeTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      fromTaskId: taskA.id,
      toTaskId: taskB.id,
    })) as {
      changes: { addedEdgeIds: string[] };
    };
    expect(addEdgeResult.changes.addedEdgeIds).toHaveLength(1);
    const edgeId = addEdgeResult.changes.addedEdgeIds[0];

    const updateNodeResult = expectSuccess(await updateDependencyViewNodeTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      taskId: taskA.id,
      note: 'Updated note',
    })) as {
      changes: { updatedNodeIds: string[] };
    };
    expect(updateNodeResult.changes.updatedNodeIds).toEqual([taskA.id]);

    const updateEdgeResult = expectSuccess(await updateDependencyViewEdgeTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      edgeId,
      fromTaskId: taskB.id,
      toTaskId: taskA.id,
    })) as {
      changes: { updatedEdgeIds: string[] };
    };
    expect(updateEdgeResult.changes.updatedEdgeIds).toEqual([edgeId]);

    const removeEdgeResult = expectSuccess(await removeDependencyViewEdgeTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      edgeId,
    })) as {
      changes: { removedEdgeIds: string[] };
      edges?: unknown[];
    };
    expect(removeEdgeResult.changes.removedEdgeIds).toEqual([edgeId]);
    expect(removeEdgeResult).not.toHaveProperty('edges');

    const addSecondEdgeResult = expectSuccess(await addDependencyViewEdgeTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      fromTaskId: taskA.id,
      toTaskId: taskB.id,
    })) as {
      changes: { addedEdgeIds: string[] };
    };

    const removeNodeResult = expectSuccess(await removeTaskFromDependencyViewTool.execute({
      projectId: project.project.id,
      viewId: view.id,
      taskId: taskA.id,
    })) as {
      changes: { removedNodeIds: string[]; removedEdgeIds: string[] };
    };
    expect(removeNodeResult.changes.removedNodeIds).toEqual([taskA.id]);
    expect(removeNodeResult.changes.removedEdgeIds).toEqual(addSecondEdgeResult.changes.addedEdgeIds);
  });
});
