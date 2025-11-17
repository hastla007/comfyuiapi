import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import WorkflowsPage from '../../pages/WorkflowsPage';

jest.mock('axios');

const mockWorkflows = [
  { id: 1, name: 'Sample Workflow', description: 'Test', created_at: '2024-01-01T00:00:00Z' }
];

describe('WorkflowsPage', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  it('renders workflows when API succeeds', async () => {
    axios.get.mockResolvedValue({ data: { success: true, workflows: mockWorkflows } });

    render(<WorkflowsPage />);

    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    expect(await screen.findByText('Sample Workflow')).toBeInTheDocument();
    expect(screen.queryByText(/Unable to load workflows/)).not.toBeInTheDocument();
  });

  it('shows helpful error when API fails', async () => {
    axios.get.mockRejectedValue(new Error('CORS failure'));

    render(<WorkflowsPage />);

    expect(await screen.findByText(/CORS failure/i)).toBeInTheDocument();
  });
});
