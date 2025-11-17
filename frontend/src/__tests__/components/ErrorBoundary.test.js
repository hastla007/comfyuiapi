import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../components/ErrorBoundary';

function Bomb({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Boom!');
  }
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('renders a fallback when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByTestId('error-message')).toHaveTextContent('Boom!');
  });

  it('can reset and render children again', () => {
    const onReset = jest.fn();
    const Wrapper = ({ shouldThrow }) => (
      <ErrorBoundary onReset={onReset}>
        <Bomb shouldThrow={shouldThrow} />
      </ErrorBoundary>
    );

    const { rerender } = render(<Wrapper shouldThrow />);

    // Switch to a safe render and reset the boundary
    rerender(<Wrapper shouldThrow={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(onReset).toHaveBeenCalled();
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});
