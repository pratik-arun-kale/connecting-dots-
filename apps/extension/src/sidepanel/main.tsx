import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../popup/globals.css'
import { SidePanelApp } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <SidePanelApp />
  </StrictMode>,
)
