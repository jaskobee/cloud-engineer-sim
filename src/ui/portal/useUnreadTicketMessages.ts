import { useGame } from '../gameContext.ts'

/** Unread ticket messages: the strip and the narrow-screen header button show it. */
export function useUnreadTicketMessages(): number {
  const messages = useGame(s => s.world.mission?.messages.length ?? 0)
  const seen = useGame(s => s.session.ui.seenMessages)
  return Math.max(0, messages - seen)
}
