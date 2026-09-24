import React from 'react';
import Card from '../components/ui/Card';

/**
 * Clean Module Placeholder Component
 *
 * Used for future business modules during Phase 4B.
 * Strictly adheres to the zero-fake-data rule.
 */
export const ModulePlaceholderPage = ({
  title,
  subtitle,
  icon = '📁',
  phaseNote = 'This module will be implemented in the upcoming phase.',
}) => {
  return (
    <div className="module-container" id={`module-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="module-header-row">
        <div>
          <h1 className="module-page-title">{title}</h1>
          {subtitle && <p className="module-page-subtitle">{subtitle}</p>}
        </div>
      </div>

      <Card className="placeholder-card">
        <div className="placeholder-icon-wrap" aria-hidden="true">
          {icon}
        </div>
        <h2 className="placeholder-heading">{title}</h2>
        <p className="placeholder-description">{phaseNote}</p>
        <div className="placeholder-badge">
          <span>Phase 4B Foundation • Ready for Integration</span>
        </div>
      </Card>
    </div>
  );
};

export default ModulePlaceholderPage;
