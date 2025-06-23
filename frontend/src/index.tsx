import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import thunkMiddleware from 'redux-thunk';
import { createStore, applyMiddleware } from 'redux';
import { composeWithDevTools } from 'redux-devtools-extension';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { rootReducer } from './models';
import AppShell from './components/AppShell';
import { initializeDiagnostics, loadEnvConfig } from './utilities';

import { store } from './redux/store';

{/* <Provider store={store}>
  <AppShell />
</Provider> */}

window.React = React;

initializeDiagnostics();

// export const store = createStore(
//   rootReducer,
//   composeWithDevTools(applyMiddleware(thunkMiddleware))
// );

const container = document.getElementById('content');
const root = createRoot(container!);

loadEnvConfig().then(() => {
  console.log('index.tsx, serverUrl:', (window as any).__ENV__?.BACKEND_URL);
  root.render(
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<AppShell />} />
        </Routes>
      </BrowserRouter>
    </Provider>
  );
});
