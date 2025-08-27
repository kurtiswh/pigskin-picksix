import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/index.css'
// Import auth test utilities to make them globally available
import './utils/authTestUtils'

console.log('🚀 [STARTUP] JavaScript is loading - main.tsx executed')
console.log('🚀 [STARTUP] React version:', React.version)
console.log('🚀 [STARTUP] Environment:', import.meta.env.MODE)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)