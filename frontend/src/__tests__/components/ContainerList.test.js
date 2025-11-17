import React from 'react';
import { render, screen } from '@testing-library/react';
import ContainerList from '../../components/ContainerList';

describe('ContainerList', () => {
  const baseProps = {
    workflows: [],
    loading: false,
    onStart: jest.fn(),
    onStop: jest.fn(),
    onRestart: jest.fn(),
    onDelete: jest.fn(),
    onAssignWorkflow: jest.fn(),
  };

  it('safely renders numeric container ids without crashing', () => {
    const containers = [
      {
        id: 1234567890123456,
        name: 'comfy-1',
        status: 'running',
        port: 3001,
      },
    ];

    render(<ContainerList {...baseProps} containers={containers} />);

    expect(screen.getByText('123456789012')).toBeInTheDocument();
  });
});
