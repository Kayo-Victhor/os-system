import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './app.css'
import App from './App.tsx'
import { installChunkLoadRecovery } from './chunkRecovery.ts'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'

installChunkLoadRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
