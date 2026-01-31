import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ModalStackProvider } from './context/ModalStackContext'
import { ScrollLockProvider } from './context/ScrollLockContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.scss'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <ScrollLockProvider>
          <ModalStackProvider>
            <ToastProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ToastProvider>
          </ModalStackProvider>
        </ScrollLockProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)
