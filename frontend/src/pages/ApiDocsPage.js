import React, { useEffect, useState } from 'react';
import './ApiDocsPage.css';

function ApiDocsPage() {
  const [docText, setDocText] = useState('');
  const [loadError, setLoadError] = useState('');
  // Swagger UI is served at /api-docs, not /api/api-docs
  const swaggerUrl = '/api-docs';

  useEffect(() => {
    const loadDocs = async () => {
      try {
        const response = await fetch(`${process.env.PUBLIC_URL || ''}/api_documentation.md`);
        if (!response.ok) {
          throw new Error(`Failed to fetch documentation: ${response.status}`);
        }
        const text = await response.text();
        setDocText(text);
      } catch (error) {
        setLoadError(error.message || 'Unable to load documentation');
      }
    };

    loadDocs();
  }, []);

  return (
    <div className="api-docs-page">
      <div className="api-docs-header">
        <h2>API Documentation</h2>
        <a href={swaggerUrl} target="_blank" rel="noopener noreferrer" className="btn-external">
          Open in New Tab
        </a>
      </div>

      <div className="api-docs-layout">
        <div className="api-docs-container">
          <iframe
            src={swaggerUrl}
            title="API Documentation"
            className="swagger-iframe"
          />
        </div>

        <div className="api-docs-reference">
          <div className="reference-header">
            <h3>Reference Guide</h3>
            <p>Full content from API_DOCUMENTATION.md</p>
          </div>
          {loadError ? (
            <div className="doc-error">{loadError}</div>
          ) : (
            <pre className="api-docs-markdown">{docText}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default ApiDocsPage;
