import React from 'react';
import { API_URL } from '../config';
import './ApiDocsPage.css';

function ApiDocsPage() {
  const swaggerUrl = `${API_URL}/api-docs`;

  return (
    <div className="api-docs-page">
      <div className="api-docs-header">
        <h2>API Documentation</h2>
        <a href={swaggerUrl} target="_blank" rel="noopener noreferrer" className="btn-external">
          Open in New Tab
        </a>
      </div>

      <div className="api-docs-container">
        <iframe
          src={swaggerUrl}
          title="API Documentation"
          className="swagger-iframe"
        />
      </div>
    </div>
  );
}

export default ApiDocsPage;
