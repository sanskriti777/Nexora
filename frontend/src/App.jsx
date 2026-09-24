import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';

/**
 * App Root Component
 *
 * Provides BrowserRouter context to enable client-side navigation.
 * All route matching and layouts are handled cleanly by AppRoutes.
 */
function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
