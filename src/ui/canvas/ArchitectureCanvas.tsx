import {
  Background, BackgroundVariant, Controls, MarkerType, ReactFlow, type Edge, type EdgeChange, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useContext, useMemo } from 'react'
import { FLOW_SELECTION_PREFIX, type CanvasLayer } from '../../store/gameStore.ts'
import { GameStoreContext, useGame } from '../gameContext.ts'
import { TrafficEdge } from './CanvasEdges.tsx'
import { BoxNode, CardNode, type BoxFlowNode, type CardFlowNode } from './CanvasNodes.tsx'
import { buildCanvasGraph, type CanvasGraph } from './graph.ts'

/**
 * The architecture canvas (step 7). It only renders `buildCanvasGraph`: every box, card and line is
 * derived from the world, and traffic lines come from the flow evaluator. The canvas itself keeps
 * nothing but the active layer and the watched flows (visual-infrastructure skill, D-5).
 */

const NODE_TYPES = { box: BoxNode, card: CardNode }
const EDGE_TYPES = { traffic: TrafficEdge }
const BOX_Z: Record<string, number> = { resourceGroup: 0, virtualNetwork: 1, subnet: 2 }
const EDGE_Z = 3
const CARD_Z = 4

const LAYERS: { id: CanvasLayer; label: string }[] = [
  { id: 'network', label: 'Network' },
  { id: 'security', label: 'Security' },
  { id: 'health', label: 'Health' },
]

/** The graph, rebuilt when the tenant, runtime or watched flows change — never on clock ticks. */
function useCanvasGraph(): CanvasGraph {
  const tenant = useGame(s => s.world.tenant)
  const runtime = useGame(s => s.world.runtime)
  const watched = useGame(s => s.session.ui.canvas.watched)
  const store = useContext(GameStoreContext)
  return useMemo(() => {
    if (!store) throw new Error('No game store')
    return buildCanvasGraph(store.getState().world, watched)
    // tenant and runtime are the parts of the world the graph reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, runtime, watched, store])
}

type Rect = { x: number; y: number; width: number; height: number }

/** Attach a line to the sides that face each other. */
function handlesFor(a: Rect, b: Rect): { sourceHandle: string; targetHandle: string } {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2)
  const dy = b.y + b.height / 2 - (a.y + a.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { sourceHandle: 'r-s', targetHandle: 'l-t' } : { sourceHandle: 'l-s', targetHandle: 'r-t' }
  return dy >= 0 ? { sourceHandle: 'b-s', targetHandle: 't-t' } : { sourceHandle: 't-s', targetHandle: 'b-t' }
}

export function ArchitectureCanvas() {
  const graph = useCanvasGraph()
  const layer = useGame(s => s.session.ui.canvas.layer)
  const setLayer = useGame(s => s.setCanvasLayer)
  const selectedId = useGame(s => s.session.ui.selectedId)
  const select = useGame(s => s.select)
  const startCreate = useGame(s => s.startCreate)
  const watchedCount = useGame(s => s.session.ui.canvas.watched.length)
  const selectedKey = selectedId?.toLowerCase() ?? null

  const { nodes, edges, resourceOf } = useMemo(() => {
    const rects = new Map<string, Rect>()
    const resourceOf = new Map<string, string | null>()
    const boxes: BoxFlowNode[] = graph.boxes.map(box => {
      rects.set(box.id, box)
      resourceOf.set(box.id, box.resourceId)
      return {
        id: box.id, type: 'box', position: { x: box.x, y: box.y }, width: box.width, height: box.height,
        data: { box }, zIndex: BOX_Z[box.kind] ?? 0, draggable: false, connectable: false,
        selected: box.resourceId.toLowerCase() === selectedKey,
        ariaLabel: `${box.kind === 'subnet' ? 'Subnet' : box.kind === 'virtualNetwork' ? 'Virtual network' : 'Resource group'} ${box.title}`,
      }
    })
    const cards: CardFlowNode[] = graph.nodes.map(node => {
      rects.set(node.id, node)
      resourceOf.set(node.id, node.resourceId)
      return {
        id: node.id, type: 'card', position: { x: node.x, y: node.y }, width: node.width, height: node.height,
        data: { node }, zIndex: CARD_Z, draggable: false, connectable: false, selectable: node.resourceId !== null,
        selected: node.resourceId?.toLowerCase() === selectedKey,
        ariaLabel: `${node.typeLabel} ${node.title}${node.status.text ? `, ${node.status.text}` : ''}`,
      }
    })
    const edges: Edge[] = graph.edges.flatMap(e => {
      const a = rects.get(e.source)
      const b = rects.get(e.target)
      if (!a || !b) return []
      const traffic = e.kind === 'traffic'
      return [{
        id: e.id, source: e.source, target: e.target, ...handlesFor(a, b), zIndex: EDGE_Z, type: traffic ? 'traffic' : 'straight',
        ...(traffic ? {} : { label: e.label }),
        className: traffic ? `cv-edge cv-traffic verdict-${e.verdict}` : `cv-edge cv-assoc dep-${e.dependency}`,
        ...(traffic ? { markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 } } : {}),
        selectable: traffic,
        selected: traffic && selectedId === `${FLOW_SELECTION_PREFIX}${e.flowId}`,
        ariaLabel: traffic ? `Connection ${e.label}: ${e.reason ?? ''}` : `${e.label}`,
        data: traffic ? { label: e.label, summary: e.summary ?? '', verdict: e.verdict ?? 'unavailable' } : {},
      } satisfies Edge]
    })
    return { nodes: [...boxes, ...cards], edges, resourceOf }
  }, [graph, selectedKey, selectedId])

  // Mouse and keyboard selection both arrive as React Flow "select" changes.
  const onNodesChange = (changes: NodeChange[]) => {
    const picked = changes.find(c => c.type === 'select' && c.selected)
    if (picked && 'id' in picked) {
      const id = resourceOf.get(picked.id) ?? null
      if (id && id.toLowerCase() !== selectedKey) select(id)
    }
  }
  const onEdgesChange = (changes: EdgeChange[]) => {
    const picked = changes.find(c => c.type === 'select' && c.selected)
    if (picked && 'id' in picked && picked.id.startsWith('flow:')) {
      const id = `${FLOW_SELECTION_PREFIX}${picked.id.slice('flow:'.length)}`
      if (id !== selectedId) select(id)
    }
  }

  return (
    <div className={`canvas layer-${layer}`}>
      <div className="canvas-overlay">
        <div className="seg" role="group" aria-label="Canvas layer">
          {LAYERS.map(l => (
            <button key={l.id} type="button" className="seg-btn" aria-pressed={layer === l.id} onClick={() => setLayer(l.id)}>{l.label}</button>
          ))}
        </div>
        <button type="button" className="button button-primary" onClick={() => startCreate({ kind: null })}>Create a resource</button>
      </div>
      {watchedCount === 0 && (
        <p className="canvas-hint">To watch a connection here, check it with IP flow verify and choose <strong>Watch on canvas</strong>.</p>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={() => select(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable
        nodesFocusable
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.2}
        maxZoom={1.6}
        colorMode="system"
        proOptions={{ hideAttribution: false }}
        aria-label="Architecture canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  )
}
