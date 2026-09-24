import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * Enterprise Application Shell Component
 *
 * Provides persistent responsive Sidebar, Topbar, and dynamic view outlet.
 */
export const AppShell = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className="app-shell">
      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
      <div className="app-main-area">
        <Topbar onToggleSidebar={toggleSidebar} />
        <main className="app-page-content" id="app-content-region">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
