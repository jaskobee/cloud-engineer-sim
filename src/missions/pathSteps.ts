import type { PathStep } from './types.ts'

/** Builders for Guided portal path steps (D-7). Every step cites the PORTAL rule behind its label. */
export const svc = (id: string, label: string): PathStep => ({ label, rule: id === 'createResource' ? 'PORTAL-2' : 'PORTAL-5', target: { kind: 'service', id } })
export const res = (role: string, label: string): PathStep => ({ label, rule: 'PORTAL-5', target: { kind: 'resource', role } })
export const sec = (section: string, label: string, rule: string): PathStep => ({ label, rule, target: { kind: 'section', section } })
export const anchorStep = (id: string, label: string, rule: string): PathStep => ({ label, rule, target: { kind: 'anchor', id } })
