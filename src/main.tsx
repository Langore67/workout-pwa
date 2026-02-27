import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import "./styles.css?v=3";
import { registerSW } from 'virtual:pwa-register';

import { seedForE2E } from "./testSeed";

if ((import.meta as any).env?.VITE_E2E === "1") {
  seedForE2E();
}


registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

