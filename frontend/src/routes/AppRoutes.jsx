import React from 'react';
import { Routes, Route } from 'react-router-dom';
import RootLayout from '../layouts/RootLayout';
import HomePage from '../pages/HomePage';
import HealthPage from '../pages/HealthPage';
import NotFoundPage from '../pages/NotFoundPage';

/**
 * AppRoutes Component
 *
 * Defines client-side routing structure for NEXORA Phase 3.
 *
 * Route Hierarchy:
 * /          -> RootLayout
 *   ├── ""       -> HomePage (Overview / Welcome)
 *   ├── "health" -> HealthPage (Frontend to Laravel API Health Demonstration)
 *   └── "*"      -> NotFoundPage (404 Fallback)
 */
export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route index element={<HomePage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
