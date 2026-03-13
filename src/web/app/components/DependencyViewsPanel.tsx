import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, type Node, type Edge, type Connection, Position } from '@xyflow/react';

interface Task { id: string; title: string; status: string; priority: 'low'|'medium'|'high'|'critical'; description?: string; }
interface Graph { id: string; name: string; description: string; dimension: string|null; revision: number; nodes: {taskId: string; x: number; y: number; collapsed: boolean; note: string|null;}[]; edges: {id: string; fromTaskId: string; toTaskId: string; kind: 'hard'; createdAt: string;}[]; }
interface Props { projectId: string|null; projectName?: string; tasks: Task[]; onGraphsChange: (g: Array<{id: string; name: string; description: string; dimension: string|null; revision: number;}>) => void; }

const colors: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#3b82f6', low: '#10b981' };

export default function DependencyViewsPanel({ projectId, tasks, projectName, onGraphsChange }: Props): React.JSX.Element {
  const [graphs, setGraphs] = useState<Graph[]>([]);
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [selected, setSelected] = useState<Graph|null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isCreate, setIsCreate] = useState(false);
  const [isAdd, setIsAdd] = useState(false);
  const [search, setSearch] = useState('');

  const taskMap = useMemo(() => { const m = new Map<string, Task>(); tasks.forEach(t => m.set(t.id, t)); return m; }, [tasks]);
  const available = useMemo(() => { if (!selected) return []; const ex = new Set(selected.nodes.map(n => n.taskId)); return tasks.filter(t => !ex.has(t.id) && t.title.toLowerCase().includes(search.toLowerCase())); }, [tasks, selected, search]);

  const fetchGraphs = useCallback(async () => {
    if (!projectId) return;
    const r = await fetch(`/api/projects/${projectId}/dependency-views`);
    const p = await r.json();
    if (p.success) { setGraphs(p.data); onGraphsChange(p.data.map((g: Graph) => ({id: g.id, name: g.name, description: g.description, dimension: g.dimension, revision: g.revision}))); }
  }, [projectId, onGraphsChange]);

  const fetchGraph = useCallback(async (id: string) => {
    if (!projectId) return;
    const r = await fetch(`/api/projects/${projectId}/dependency-views/${id}`);
    const p = await r.json();
    if (p.success) setSelected(p.data);
  }, [projectId]);

  useEffect(() => { void fetchGraphs(); }, [fetchGraphs]);
  useEffect(() => { if (selectedId) void fetchGraph(selectedId); else setSelected(null); }, [selectedId, fetchGraph]);

  useEffect(() => {
    if (!selected) { setNodes([]); setEdges([]); return; }
    const ns: Node[] = selected.nodes.map(n => {
      const t = taskMap.get(n.taskId);
      if (!t) return null;
      const c = colors[t.priority] || colors.medium;
      return { id: t.id, position: {x: n.x, y: n.y}, sourcePosition: Position.Right, targetPosition: Position.Left, draggable: true, data: { label: (<div className="w-60 rounded-xl border-2 border-slate-200 bg-white p-3 shadow-lg"><div className="flex items-center justify-between mb-2"><span className="rounded px-2 py-1 text-xs font-bold" style={{backgroundColor: c+'20', color: c}}>{t.status}</span></div><div className="font-bold text-sm">{t.title}</div>{t.description && <div className="text-xs text-slate-600 mt-1">{t.description}</div>}</div>) } };
    }).filter(Boolean) as Node[];
    const es: Edge[] = selected.edges.map(e => ({ id: e.id, source: e.fromTaskId, target: e.toTaskId, deletable: true, animated: true, style: {stroke: '#10b981', strokeWidth: 2.5}, markerEnd: {type: 'arrowclosed', color: '#10b981'} }));
    setNodes(ns);
    setEdges(es);
  }, [selected, taskMap, setNodes, setEdges]);

  const handleCreate = async () => {
    if (!projectId || !newName.trim()) return;
    const r = await fetch(`/api/projects/${projectId}/dependency-views`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: newName.trim(), description: newDesc.trim()}) });
    const p = await r.json();
    if (p.success) { await fetchGraphs(); setSelectedId(p.data.id); setNewName(''); setNewDesc(''); setIsCreate(false); }
  };

  const handleAdd = async (taskId: string) => {
    if (!projectId || !selectedId) return;
    await fetch(`/api/projects/${projectId}/dependency-views/${selectedId}/nodes`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({taskId}) });
    await fetchGraph(selectedId);
    setIsAdd(false);
  };

  const handleDelete = async () => {
    if (!projectId || !selectedId || !confirm('Delete?')) return;
    await fetch(`/api/projects/${projectId}/dependency-views/${selectedId}`, {method: 'DELETE'});
    await fetchGraphs();
    setSelectedId(null);
  };

  const onConnect = async (conn: Connection) => {
    if (!projectId || !selectedId || !conn.source || !conn.target) return;
    await fetch(`/api/projects/${projectId}/dependency-views/${selectedId}/edges`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fromTaskId: conn.source, toTaskId: conn.target}) });
    await fetchGraph(selectedId);
  };

  const onEdgesDelete = async (eds: Edge[]) => {
    if (!projectId || !selectedId) return;
    await Promise.all(eds.map(e => fetch(`/api/projects/${projectId}/dependency-views/${selectedId}/edges/${e.id}`, {method: 'DELETE'})));
    await fetchGraph(selectedId);
  };

  const onNodeDragStop = async (_: React.MouseEvent, node: Node) => {
    if (!projectId || !selectedId) return;
    await fetch(`/api/projects/${projectId}/dependency-views/${selectedId}/nodes/${node.id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({x: node.position.x, y: node.position.y}) });
  };

  if (!projectId) return (<div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50 p-16 text-center"><div className="text-sm font-bold text-emerald-600">Graph</div><div className="mt-2 text-2xl font-bold">Select a project</div></div>);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border bg-white p-4 shadow">
        <div className="flex items-center justify-between mb-4">
          <div><div className="text-xs font-bold text-emerald-600">GRAPH</div><h2 className="text-lg font-bold">{projectName || 'Project'}</h2></div>
          <button onClick={handleDelete} disabled={!selectedId} className="rounded bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 disabled:opacity-40">Delete</button>
        </div>
        <div className="space-y-2">
          <button onClick={() => setIsCreate(true)} className="w-full rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold hover:bg-emerald-100">New Graph</button>
          <button onClick={() => setIsAdd(true)} disabled={!selectedId} className="w-full rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold hover:bg-emerald-100 disabled:opacity-40">Add Tasks</button>
        </div>
        <div className="mt-4 space-y-2">
          {graphs.map(g => (<button key={g.id} onClick={() => setSelectedId(g.id)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedId === g.id ? 'border-emerald-300 bg-emerald-50 font-bold' : 'border-slate-200 hover:border-slate-300'}`}><div className="flex items-center justify-between"><span className="truncate">{g.name}</span><span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white">{g.nodes.length}</span></div></button>))}
          {graphs.length === 0 && <div className="rounded border border-dashed p-4 text-center text-xs text-slate-500">No graphs</div>}
        </div>
      </aside>
      <section className="rounded-2xl border bg-white p-4 shadow">
        {selected ? (
          <>
            <div className="mb-4"><div className="text-xs font-bold text-emerald-600">ACTIVE</div><h3 className="text-xl font-bold">{selected.name}</h3><p className="text-sm text-slate-600">{selected.description || 'No description'}</p></div>
            <div className="h-[600px] rounded-xl border bg-slate-50">
              <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeDragStop={onNodeDragStop} onEdgesDelete={onEdgesDelete} fitView fitViewOptions={{padding: 0.2}}>
                <MiniMap pannable zoomable nodeColor="#10b981" />
                <Controls />
                <Background color="#d1fae5" gap={16} />
              </ReactFlow>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed p-12 text-center"><div className="text-sm font-bold text-emerald-600">GRAPH</div><div className="mt-2 text-xl font-bold">Select a graph</div></div>
        )}

        {isCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <button className="absolute inset-0" onClick={() => setIsCreate(false)} />
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
              <div className="text-xs font-bold text-emerald-600">NEW GRAPH</div>
              <div className="mt-2 text-2xl font-bold">Create a graph</div>
              <div className="mt-4 space-y-3">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Graph name" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description" rows={3} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setIsCreate(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                <button onClick={handleCreate} disabled={!newName.trim()} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:bg-slate-300">Create</button>
              </div>
            </div>
          </div>
        )}
        {isAdd && selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <button className="absolute inset-0" onClick={() => setIsAdd(false)} />
            <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
              <div className="text-xs font-bold text-emerald-600">ADD TASKS</div>
              <div className="mt-2 text-2xl font-bold">Add to {selected.name}</div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search" className="mt-4 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-400" />
              <div className="mt-3 grid max-h-96 gap-2 overflow-auto sm:grid-cols-2">
                {available.map(t => (<button key={t.id} onClick={() => handleAdd(t.id)} className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-left text-sm hover:bg-emerald-50"><span className="truncate">{t.title}</span><span className="ml-2 text-xs text-slate-500">{t.status}</span></button>))}
                {available.length === 0 && <div className="col-span-2 rounded border border-dashed p-4 text-center text-sm text-slate-500">No tasks</div>}
              </div>
              <div className="mt-5 flex justify-end"><button onClick={() => setIsAdd(false)} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100">Close</button></div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
