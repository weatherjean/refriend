import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { FeedProvider } from './context/FeedContext'
import { ToastProvider } from './context/ToastContext'
import { NavigationProvider } from './context/NavigationContext'
import './styles.scss'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <NavigationProvider>
        <ToastProvider>
          <AuthProvider>
            <FeedProvider>
              <App />
            </FeedProvider>
          </AuthProvider>
        </ToastProvider>
      </NavigationProvider>
    </HashRouter>
  </React.StrictMode>,
)
