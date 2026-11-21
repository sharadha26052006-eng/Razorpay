import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { StoreProvider } from './lib/store';
import Landing from './pages/Landing';
import AppShell from './components/AppShell';
import Dashboard from './pages/Dashboard';
import Analyzer from './pages/Analyzer';
import Results from './pages/Results';
import Copilot from './pages/Copilot';
import NotFound from './pages/NotFound';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="analyze" element={<Analyzer />} />
            <Route path="results" element={<Results />} />
            <Route path="copilot" element={<Copilot />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  </React.StrictMode>,
);
