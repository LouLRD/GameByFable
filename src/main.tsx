import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Les styles globaux sont importés AVANT l'application : les feuilles des composants
// (importées par les modules de features) s'injectent ensuite et peuvent les spécialiser.
import '@/styles/index.css';
import { App } from '@/app/App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
