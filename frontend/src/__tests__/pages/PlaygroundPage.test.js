import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import PlaygroundPage from '../../pages/PlaygroundPage';
import { API_URL } from '../../config';

jest.mock('axios');

describe('PlaygroundPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    axios.get.mockResolvedValueOnce({
      data: {
        success: true,
        workflows: [
          { id: 1, name: 'Running Workflow' },
          { id: 2, name: 'Stopped Workflow' }
        ]
      }
    });

    axios.get.mockResolvedValueOnce({
      data: {
        success: true,
        containers: [
          { id: 10, name: 'Container A', status: 'running', workflow_id: 1 },
          { id: 11, name: 'Container B', status: 'stopped', workflow_id: 2 }
        ]
      }
    });
  });

  it('disables workflows without running containers and submits to a running one', async () => {
    axios.post.mockResolvedValue({ data: { success: true, job: { id: 99 } } });

    render(<PlaygroundPage />);

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(`${API_URL}/workflows`);
      expect(axios.get).toHaveBeenCalledWith(`${API_URL}/containers`);
    });

    const workflowSelect = screen.getAllByLabelText(/workflow/i)[0];

    const stoppedOption = await screen.findAllByRole('option', { name: /Stopped Workflow.*not running/i });
    expect(stoppedOption[0]).toBeDisabled();

    fireEvent.change(workflowSelect, { target: { value: '1' } });

    const promptInput = screen.getAllByLabelText(/prompt/i)[0];
    fireEvent.change(promptInput, { target: { value: 'test prompt' } });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /send job/i })[0]).not.toBeDisabled();
    });

    const sendButton = screen.getAllByRole('button', { name: /send job/i })[0];
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        `${API_URL}/jobs`,
        expect.objectContaining({ workflow_id: 1, container_id: 10 }),
        expect.any(Object)
      );
    });
  });
});
