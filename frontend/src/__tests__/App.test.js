import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App Component', () => {
  it('renders without crashing', () => {
    render(<App />);
  });

  it('contains navigation elements', () => {
    render(<App />);
    expect(document.querySelector('.layout-nav')).toBeInTheDocument();
  });

  it('redirects to containers page by default', () => {
    render(<App />);
    // Since we redirect to /containers, we should not see the root path
    expect(window.location.pathname).not.toBe('/');
  });
});
