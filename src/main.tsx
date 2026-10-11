import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App.tsx'
import { PortalTheme } from './ui/portal/theme.tsx'
import './ui/app.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <PortalTheme>
      <App />
    </PortalTheme>
  </StrictMode>,
)
