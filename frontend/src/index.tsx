import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import AppShell from './components/AppShell';
import { initializeDiagnostics, loadEnvConfig } from './utilities';

import { BrowserRouter } from 'react-router-dom';

import { store } from './redux/store';

window.React = React;

initializeDiagnostics();

loadEnvConfig().then(() => {
  console.log('index.tsx, serverUrl:', (window as any).__ENV__?.BACKEND_URL);
  createRoot(document.getElementById('content')!).render(
    <StrictMode>
      <Provider store={store}>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </Provider>
    </StrictMode>
  )
});

