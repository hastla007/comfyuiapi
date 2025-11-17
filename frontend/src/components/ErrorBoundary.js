import React from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error for debugging purposes without crashing the UI
    console.error('Unhandled UI error:', error, errorInfo);
  }

  handleReset = () => {
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__card">
            <h2>Something went wrong</h2>
            <p>
              The UI hit an unexpected error. Try reloading the page or using the button below.
            </p>
            {this.state.error?.message && (
              <div className="error-boundary__details" data-testid="error-message">
                {this.state.error.message}
              </div>
            )}
            <div className="error-boundary__actions">
              <button onClick={() => window.location.reload()} className="btn btn-primary">
                Reload page
              </button>
              <button onClick={this.handleReset} className="btn btn-secondary">
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
