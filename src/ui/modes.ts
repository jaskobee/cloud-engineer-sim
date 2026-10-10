import type { AssistanceMode } from '../engine/index.ts'

/** How each assistance mode helps (BOOTSTRAP_REPORT §G). */
export const MODE_TEXT: Record<AssistanceMode, { label: string; blurb: string }> = {
  guided: { label: 'Guided', blurb: 'Technical requirements shown, the next step highlighted, free hints.' },
  standard: { label: 'Standard', blurb: 'Business requirements and acceptance criteria, hints on request.' },
  expert: { label: 'Expert', blurb: 'The ticket only. Hints are counted.' },
}

