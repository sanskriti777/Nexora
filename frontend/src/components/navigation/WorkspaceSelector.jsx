import React, { useState, useRef, useEffect } from 'react';

/**
 * Workspace Selector Component
 *
 * Provides a clean workspace selector dropdown trigger matching Image 1.
 */
export const WorkspaceSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="workspace-selector-container" ref={containerRef}>
      <button
        type="button"
        className="workspace-selector-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div className="workspace-selector-left">
          <span className="workspace-avatar">N</span>
          <span className="workspace-name">Nexora Workspace</span>
        </div>
        <span className="workspace-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="workspace-dropdown card">
          <div className="workspace-dropdown-header">Workspaces</div>
          <button
            type="button"
            className="workspace-option active"
            onClick={() => setIsOpen(false)}
          >
            <span className="workspace-avatar">N</span>
            <div className="workspace-option-info">
              <span className="workspace-option-name">Nexora Workspace</span>
              <span className="workspace-option-role">Default Workspace</span>
            </div>
            <span className="workspace-check">✓</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default WorkspaceSelector;
