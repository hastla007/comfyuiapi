// jest-dom adds custom jest matchers for asserting on DOM nodes.
import '@testing-library/jest-dom';

// Mock API_URL
jest.mock('./config', () => ({
  API_URL: 'http://localhost:3000/api'
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => {
  const React = require('react');
  return new Proxy({}, {
    get: (target, prop) => {
      return React.forwardRef((props, ref) =>
        React.createElement('svg', { ...props, ref, 'data-icon': prop })
      );
    }
  });
});
