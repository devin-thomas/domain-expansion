import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PrivacyView } from './components/PrivacyView.tsx';
import { ShowcaseView } from './components/ShowcaseView.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname === '/showcase'
      ? <ShowcaseView />
      : window.location.pathname === '/privacy'
        ? <PrivacyView />
        : <App />}
  </StrictMode>,
);
