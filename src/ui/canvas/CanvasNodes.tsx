import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { MouseEvent } from 'react'
import { useGame } from '../gameContext.ts'
import type { CanvasBox, CanvasNode, Chip, Status } from './graph.ts'

/**
 * How canvas boxes and cards look (visual-infrastructure skill: status always has text as well as
 * colour; chips select their own resource). Lines attach to hidden handles on all four sides.
 */

export type BoxFlowNode = Node<{ box: CanvasBox }, 'box'>
export type CardFlowNode = Node<{ node: CanvasNode }, 'card'>

const SIDES = [
  ['l', Position.Left],
  ['r', Position.Right],
  ['t', Position.Top],
  ['b', Position.Bottom],
] as const

function Handles() {
  return (
    <>
      {SIDES.map(([id, position]) => (
        <span key={id}>
          <Handle type="target" id={`${id}-t`} position={position} isConnectable={false} className="cv-handle" />
          <Handle type="source" id={`${id}-s`} position={position} isConnectable={false} className="cv-handle" />
        </span>
      ))}
    </>
  )
}

function StatusLine({ status }: { status: Status }) {
  if (!status.text) return null
  return <span className={`cv-status tone-${status.tone}`} title={status.detail}>{status.text}</span>
}

function Chips({ chips }: { chips: Chip[] }) {
  const select = useGame(s => s.select)
  if (chips.length === 0) return null
  const open = (e: MouseEvent, id: string) => {
    e.stopPropagation()
    select(id)
  }
  return (
    <div className="cv-chips">
      {chips.map(c => (
        <button key={c.resourceId} type="button" className={`cv-chip cv-chip-${c.kind} nodrag`} onClick={e => open(e, c.resourceId)}>
          {c.label}
        </button>
      ))}
    </div>
  )
}

const BOX_LABEL: Record<CanvasBox['kind'], string> = { resourceGroup: 'Resource group', virtualNetwork: 'Virtual network', subnet: 'Subnet' }

export function BoxNode({ data, selected }: NodeProps<BoxFlowNode>) {
  const { box } = data
  return (
    <div className={`cv-box cv-${box.kind} tone-${box.status.tone}${selected ? ' is-selected' : ''}`} style={{ width: box.width, height: box.height }}>
      <Handles />
      <div className="cv-box-head">
        <span className="cv-type">{box.kind === 'resourceGroup' ? '' : BOX_LABEL[box.kind]}</span>
        <span className="cv-title">{box.title}</span>
        <span className="cv-detail mono">{box.detail}</span>
        {box.status.tone !== 'ok' && <StatusLine status={box.status} />}
        <Chips chips={box.chips} />
      </div>
    </div>
  )
}

export function CardNode({ data, selected }: NodeProps<CardFlowNode>) {
  const { node } = data
  return (
    <div className={`cv-card cv-${node.kind} tone-${node.status.tone}${selected ? ' is-selected' : ''}`} style={{ width: node.width, height: node.height }}>
      <Handles />
      <span className="cv-type">{node.typeLabel}</span>
      <span className="cv-title">{node.title}</span>
      {node.facts.length > 0 && <span className="cv-detail mono">{node.facts.join(' · ')}</span>}
      <StatusLine status={node.status} />
      <Chips chips={node.chips} />
    </div>
  )
}
