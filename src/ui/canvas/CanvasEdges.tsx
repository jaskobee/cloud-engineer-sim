import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import type { Verdict } from './graph.ts'

export type TrafficFlowEdge = Edge<{ label: string; summary: string; verdict: Verdict }, 'traffic'>

/**
 * A watched connection. The label is HTML in React Flow's label layer, above every box, so the
 * verdict and the deciding rule are never clipped (visual-infrastructure skill: name the rule).
 */
export function TrafficEdge(props: EdgeProps<TrafficFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected } = props
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  return (
    <>
      <BaseEdge id={id} path={path} {...(markerEnd ? { markerEnd } : {})} />
      {data && (
        <EdgeLabelRenderer>
          <div
            className={`cv-edge-label verdict-${data.verdict}${selected ? ' is-selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <span className="mono">{data.label}</span> · {data.summary}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
