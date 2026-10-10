import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, type Edge, type EdgeProps } from '@xyflow/react'
import type { Verdict } from './graph.ts'

export type TrafficFlowEdge = Edge<{ label: string; summary: string; verdict: Verdict; lane?: number }, 'traffic'>

/** Space between parallel connections that share both ends (e.g. players and office → the game VM). */
const LANE_GAP = 34

/**
 * A watched connection. The label is HTML in React Flow's label layer, above every box, so the
 * verdict and the deciding rule are never clipped (visual-infrastructure skill: name the rule).
 */
export function TrafficEdge(props: EdgeProps<TrafficFlowEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected } = props
  // Parallel connections between the same two ends get their own lane, so lines and labels don't overlap.
  const lane = data?.lane ?? 0
  const offset = lane === 0 ? 0 : (lane % 2 === 1 ? 1 : -1) * Math.ceil(lane / 2) * LANE_GAP
  // Shift across the line: vertically for lines leaving a side, horizontally for lines leaving the top or bottom.
  const sideways = sourcePosition === Position.Left || sourcePosition === Position.Right
  const [dx, dy] = sideways ? [0, offset] : [offset, 0]
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sourceX + dx, sourceY: sourceY + dy, targetX: targetX + dx, targetY: targetY + dy, sourcePosition, targetPosition,
  })
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
