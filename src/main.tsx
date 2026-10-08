import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { loadFonts } from './ui/fonts';
import { GAME_TITLE } from './ui/strings';
import './ui/theme.css';

loadFonts();
document.title = GAME_TITLE;

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
