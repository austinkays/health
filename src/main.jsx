import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initSentry } from './services/sentry.js'

initSentry()

// Pause expensive theme background animations while the window is being
// actively resized — fixes the choppy repaint on experimental themes whose
// fixed-position layers depend on viewport size. The .is-resizing class
// applies a global animation-play-state: paused (see index.css).
{
  let resizeTimer;
  window.addEventListener('resize', () => {
    document.documentElement.classList.add('is-resizing');
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      document.documentElement.classList.remove('is-resizing');
    }, 180);
  }, { passive: true });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
