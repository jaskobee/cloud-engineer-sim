import type { ReactNode } from 'react'
import { Toolbar } from '@fluentui/react-components'

/**
 * A page in the working pane (PORTAL-3): title ("name | Section"), the type below it, the command bar, then
 * the content. The title is the page's h1, so screen readers land on it.
 */
export function PageFrame({ title, section, subtitle, icon, commands, children, className }: {
  title: string
  section?: string | null
  subtitle?: ReactNode
  icon?: ReactNode
  commands?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`page ${className ?? ''}`}>
      <div className="page-head">
        {icon && <span className="page-icon">{icon}</span>}
        <div>
          <h1 className="page-title">{title}{section ? <span className="page-section"> | {section}</span> : null}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {commands && <Toolbar className="command-bar" aria-label="Commands" size="small">{commands}</Toolbar>}
      <div className="page-body">{children}</div>
    </div>
  )
}
