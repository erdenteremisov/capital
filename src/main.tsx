import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';
createRoot(document.getElementById('root')!).render(<App />);
// Service Worker кэширует только статические файлы приложения; финансовые данные в него не попадают.
if ('serviceWorker' in navigator && import.meta.env.PROD) addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => undefined); });
