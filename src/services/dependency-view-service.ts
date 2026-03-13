import type { ProjectStorage } from '../storage/index.js';
import type {
  DependencyView,
  DependencyViewAnalysis,
  DependencyViewEdge,
  DependencyViewNode,
  ProjectData,
} from '../models/index.js';
import { writeJsonFile } from '../utils/file-helpers.js';
import type {
  AddDependencyViewEdgeData,
  AddDependencyViewNodeData,
  CreateDependencyViewData,
  ServiceResult,
  UpdateDependencyViewData,
  UpdateDependencyViewNodeData,
} from './types.js';

function generateDependencyViewId(): string {
  return `depview_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateDependencyViewEdgeId(): string {
  return `depedge_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function getDependencyViews(projectData: ProjectData): DependencyView[] {
  if (!projectData.dependencyViews) {
    projectData.dependencyViews = [];
  }
  return projectData.dependencyViews;
}

function findView(projectData: ProjectData, viewId: string): DependencyView | undefined {
  return getDependencyViews(projectData).find((view) => view.id === viewId);
}

function cloneView(view: DependencyView): DependencyView {
  return {
    ...view,
    nodes: view.nodes.map((node) => ({ ...node })),
    edges: view.edges.map((edge) => ({ ...edge })),
  };
}

function buildAdjacency(view: DependencyView): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  for (const node of view.nodes) {
    adjacency.set(node.taskId, []);
  }

  for (const edge of view.edges) {
    const neighbors = adjacency.get(edge.fromTaskId);
    if (neighbors) {
      neighbors.push(edge.toTaskId);
    }
  }

  return adjacency;
}

function canReach(adjacency: Map<string, string[]>, startId: string, targetId: string): boolean {
  if (startId === targetId) {
    return true;
  }

  const visited = new Set<string>();
  const stack = [startId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (neighbor === targetId) {
        return true;
      }
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return false;
}

function analyzeDependencyView(view: DependencyView): DependencyViewAnalysis {
  const nodeIds = view.nodes.map((node) => node.taskId);
  const adjacency = buildAdjacency(view);
  const indegree = new Map<string, number>(nodeIds.map((nodeId) => [nodeId, 0]));
  const outgoing = new Map<string, number>(nodeIds.map((nodeId) => [nodeId, 0]));

  for (const edge of view.edges) {
    indegree.set(edge.toTaskId, (indegree.get(edge.toTaskId) ?? 0) + 1);
    outgoing.set(edge.fromTaskId, (outgoing.get(edge.fromTaskId) ?? 0) + 1);
  }

  const queue = nodeIds.filter((nodeId) => (indegree.get(nodeId) ?? 0) === 0);
  const indegreeCopy = new Map(indegree);
  const topologicalOrder: string[] = [];
  const layerByTask = new Map<string, number>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    topologicalOrder.push(current);
    const currentLayer = layerByTask.get(current) ?? 0;
    const neighbors = adjacency.get(current) ?? [];

    for (const neighbor of neighbors) {
      layerByTask.set(neighbor, Math.max(layerByTask.get(neighbor) ?? 0, currentLayer + 1));
      const nextIndegree = (indegreeCopy.get(neighbor) ?? 0) - 1;
      indegreeCopy.set(neighbor, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  const layers: string[][] = [];
  for (const nodeId of topologicalOrder) {
    const layerIndex = layerByTask.get(nodeId) ?? 0;
    if (!layers[layerIndex]) {
      layers[layerIndex] = [];
    }
    layers[layerIndex].push(nodeId);
  }

  return {
    viewId: view.id,
    revision: view.revision,
    topologicalOrder,
    layers,
    readyTaskIds: nodeIds.filter((nodeId) => (indegree.get(nodeId) ?? 0) === 0),
    blockedTaskIds: nodeIds.filter((nodeId) => (indegree.get(nodeId) ?? 0) > 0),
    roots: nodeIds.filter((nodeId) => (indegree.get(nodeId) ?? 0) === 0),
    leaves: nodeIds.filter((nodeId) => (outgoing.get(nodeId) ?? 0) === 0),
    isolatedTaskIds: nodeIds.filter(
      (nodeId) => (indegree.get(nodeId) ?? 0) === 0 && (outgoing.get(nodeId) ?? 0) === 0
    ),
  };
}

export class DependencyViewService {
  private storage: ProjectStorage;

  constructor(storage: ProjectStorage) {
    this.storage = storage;
  }

  async create(projectId: string, data: CreateDependencyViewData): Promise<ServiceResult<DependencyView>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      const views = getDependencyViews(projectData);
      const name = data.name.trim();
      if (!name) {
        return {
          success: false,
          error: 'Dependency view name is required',
          code: 'VALIDATION_ERROR',
        };
      }

      const now = new Date().toISOString();
      const view: DependencyView = {
        id: generateDependencyViewId(),
        projectId,
        name,
        description: data.description,
        dimension: data.dimension ?? null,
        createdAt: now,
        updatedAt: now,
        revision: 1,
        nodes: [],
        edges: [],
      };

      views.push(view);
      projectData.project.updatedAt = now;
      await this.saveProject(projectId, projectData);

      return { success: true, data: view };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create dependency view',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async list(projectId: string): Promise<ServiceResult<DependencyView[]>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      return { success: true, data: getDependencyViews(projectData).map(cloneView) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list dependency views',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async get(projectId: string, viewId: string): Promise<ServiceResult<DependencyView>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      const view = findView(projectData, viewId);
      if (!view) {
        return {
          success: false,
          error: `Dependency view with ID '${viewId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      return { success: true, data: cloneView(view) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get dependency view',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async update(
    projectId: string,
    viewId: string,
    data: UpdateDependencyViewData
  ): Promise<ServiceResult<DependencyView>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      if (Object.keys(data).length === 0) {
        return {
          success: false,
          error: 'At least one field to update is required',
          code: 'VALIDATION_ERROR',
        };
      }

      const view = findView(projectData, viewId);
      if (!view) {
        return {
          success: false,
          error: `Dependency view with ID '${viewId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      if (data.name !== undefined && !data.name.trim()) {
        return {
          success: false,
          error: 'Dependency view name cannot be empty',
          code: 'VALIDATION_ERROR',
        };
      }

      const now = new Date().toISOString();
      view.name = data.name?.trim() ?? view.name;
      if (data.description !== undefined) {
        view.description = data.description;
      }
      if (data.dimension !== undefined) {
        view.dimension = data.dimension;
      }
      view.updatedAt = now;
      view.revision += 1;
      projectData.project.updatedAt = now;

      await this.saveProject(projectId, projectData);
      return { success: true, data: cloneView(view) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update dependency view',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async delete(projectId: string, viewId: string): Promise<ServiceResult<void>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      const views = getDependencyViews(projectData);
      const viewIndex = views.findIndex((view) => view.id === viewId);
      if (viewIndex === -1) {
        return {
          success: false,
          error: `Dependency view with ID '${viewId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      views.splice(viewIndex, 1);
      projectData.project.updatedAt = new Date().toISOString();
      await this.saveProject(projectId, projectData);
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete dependency view',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async addNode(
    projectId: string,
    viewId: string,
    data: AddDependencyViewNodeData
  ): Promise<ServiceResult<DependencyView>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      const view = findView(projectData, viewId);
      if (!view) {
        return {
          success: false,
          error: `Dependency view with ID '${viewId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      const task = projectData.tasks.find((item) => item.id === data.taskId);
      if (!task) {
        return {
          success: false,
          error: `Task with ID '${data.taskId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      if (view.nodes.some((node) => node.taskId === data.taskId)) {
        return {
          success: false,
          error: `Task '${data.taskId}' is already in dependency view '${viewId}'`,
          code: 'DUPLICATE_ERROR',
        };
      }

      const node: DependencyViewNode = {
        taskId: data.taskId,
        x: data.x ?? 120,
        y: data.y ?? 120,
        collapsed: data.collapsed ?? false,
        note: data.note ?? null,
      };

      const now = new Date().toISOString();
      view.nodes.push(node);
      view.updatedAt = now;
      view.revision += 1;
      projectData.project.updatedAt = now;

      await this.saveProject(projectId, projectData);
      return { success: true, data: cloneView(view) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add task to dependency view',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async updateNode(
    projectId: string,
    viewId: string,
    taskId: string,
    data: UpdateDependencyViewNodeData
  ): Promise<ServiceResult<DependencyView>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      if (Object.keys(data).length === 0) {
        return {
          success: false,
          error: 'At least one node field to update is required',
          code: 'VALIDATION_ERROR',
        };
      }

      const view = findView(projectData, viewId);
      if (!view) {
        return {
          success: false,
          error: `Dependency view with ID '${viewId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      const node = view.nodes.find((item) => item.taskId === taskId);
      if (!node) {
        return {
          success: false,
          error: `Task '${taskId}' is not present in dependency view '${viewId}'`,
          code: 'NOT_FOUND',
        };
      }

      if (data.x !== undefined) {
        node.x = data.x;
      }
      if (data.y !== undefined) {
        node.y = data.y;
      }
      if (data.collapsed !== undefined) {
        node.collapsed = data.collapsed;
      }
      if (data.note !== undefined) {
        node.note = data.note;
      }

      const now = new Date().toISOString();
      view.updatedAt = now;
      view.revision += 1;
      projectData.project.updatedAt = now;

      await this.saveProject(projectId, projectData);
      return { success: true, data: cloneView(view) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update dependency view node',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async removeNode(projectId: string, viewId: string, taskId: string): Promise<ServiceResult<DependencyView>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      const view = findView(projectData, viewId);
      if (!view) {
        return {
          success: false,
          error: `Dependency view with ID '${viewId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      const nodeIndex = view.nodes.findIndex((node) => node.taskId === taskId);
      if (nodeIndex === -1) {
        return {
          success: false,
          error: `Task '${taskId}' is not present in dependency view '${viewId}'`,
          code: 'NOT_FOUND',
        };
      }

      view.nodes.splice(nodeIndex, 1);
      view.edges = view.edges.filter((edge) => edge.fromTaskId !== taskId && edge.toTaskId !== taskId);

      const now = new Date().toISOString();
      view.updatedAt = now;
      view.revision += 1;
      projectData.project.updatedAt = now;

      await this.saveProject(projectId, projectData);
      return { success: true, data: cloneView(view) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove task from dependency view',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async addEdge(
    projectId: string,
    viewId: string,
    data: AddDependencyViewEdgeData
  ): Promise<ServiceResult<DependencyView>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      const view = findView(projectData, viewId);
      if (!view) {
        return {
          success: false,
          error: `Dependency view with ID '${viewId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      if (data.fromTaskId === data.toTaskId) {
        return {
          success: false,
          error: 'A task cannot depend on itself',
          code: 'VALIDATION_ERROR',
        };
      }

      const nodeIds = new Set(view.nodes.map((node) => node.taskId));
      if (!nodeIds.has(data.fromTaskId) || !nodeIds.has(data.toTaskId)) {
        return {
          success: false,
          error: 'Both tasks must be present in the dependency view before connecting them',
          code: 'VALIDATION_ERROR',
        };
      }

      const duplicateEdge = view.edges.find(
        (edge) => edge.fromTaskId === data.fromTaskId && edge.toTaskId === data.toTaskId
      );
      if (duplicateEdge) {
        return {
          success: false,
          error: 'That dependency already exists in the view',
          code: 'DUPLICATE_ERROR',
        };
      }

      const adjacency = buildAdjacency(view);
      if (canReach(adjacency, data.toTaskId, data.fromTaskId)) {
        return {
          success: false,
          error: 'Adding this dependency would create a cycle',
          code: 'VALIDATION_ERROR',
        };
      }

      const now = new Date().toISOString();
      const edge: DependencyViewEdge = {
        id: generateDependencyViewEdgeId(),
        fromTaskId: data.fromTaskId,
        toTaskId: data.toTaskId,
        kind: 'hard',
        createdAt: now,
      };

      view.edges.push(edge);
      view.updatedAt = now;
      view.revision += 1;
      projectData.project.updatedAt = now;

      await this.saveProject(projectId, projectData);
      return { success: true, data: cloneView(view) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add dependency edge',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async removeEdge(projectId: string, viewId: string, edgeId: string): Promise<ServiceResult<DependencyView>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      const view = findView(projectData, viewId);
      if (!view) {
        return {
          success: false,
          error: `Dependency view with ID '${viewId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      const edgeIndex = view.edges.findIndex((edge) => edge.id === edgeId);
      if (edgeIndex === -1) {
        return {
          success: false,
          error: `Dependency edge with ID '${edgeId}' not found in view '${viewId}'`,
          code: 'NOT_FOUND',
        };
      }

      view.edges.splice(edgeIndex, 1);
      const now = new Date().toISOString();
      view.updatedAt = now;
      view.revision += 1;
      projectData.project.updatedAt = now;

      await this.saveProject(projectId, projectData);
      return { success: true, data: cloneView(view) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove dependency edge',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  async analyze(projectId: string, viewId: string): Promise<ServiceResult<DependencyViewAnalysis>> {
    try {
      const projectData = await this.storage.readProject(projectId);
      if (!projectData) {
        return {
          success: false,
          error: `Project with ID '${projectId}' not found`,
          code: 'NOT_FOUND',
        };
      }

      const view = findView(projectData, viewId);
      if (!view) {
        return {
          success: false,
          error: `Dependency view with ID '${viewId}' not found in project '${projectId}'`,
          code: 'NOT_FOUND',
        };
      }

      return {
        success: true,
        data: analyzeDependencyView(view),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze dependency view',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  private async saveProject(projectId: string, projectData: ProjectData): Promise<void> {
    const filePath = this.storage.getFilePath(projectId);
    await writeJsonFile(filePath, projectData);
  }
}
