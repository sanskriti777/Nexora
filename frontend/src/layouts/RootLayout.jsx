import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

/**
 * RootLayout Component
 *
 * Provides persistent page shell (Navbar + Footer) and dynamic child route rendering via Outlet.
 */
export const RootLayout = () => {
  return (
    <div className="app-container">
      <Navbar />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default RootLayout;
