import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { useStore } from './store/store';
import { useTransient, viewportApi } from './viewport/shared';

if (import.meta.env.DEV) {
  // Handles for debugging and end-to-end tests.
  Object.assign(window, { __store: useStore, __viewport: viewportApi, __transient: useTransient });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
