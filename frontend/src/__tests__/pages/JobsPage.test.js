import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import JobsPage from '../../pages/JobsPage';

jest.mock('axios');

describe('JobsPage', () => {
  const mockJobsResponse = {
    data: {
      success: true,
      jobs: [
        {
          id: 1,
          workflow_name: 'Test Workflow',
          container_name: 'Container A',
          status: 'queued',
          created_at: '2024-01-01T00:00:00Z',
          duration: '10s',
          progress: 25
        }
      ],
      stats: {}
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue(mockJobsResponse);
    axios.post.mockResolvedValue({
      data: {
        success: true,
        cancelled: [1],
        skipped: { missing: [], notCancellable: [] }
      }
    });
  });

  const renderPage = async () => {
    await act(async () => {
      render(
        <BrowserRouter>
          <JobsPage />
        </BrowserRouter>
      );
    });
  };

  it('cancels selected jobs through the bulk endpoint', async () => {
    await renderPage();

    await waitFor(() => expect(axios.get).toHaveBeenCalled());

    const jobCheckbox = await screen.findByLabelText('Select job 1');
    fireEvent.click(jobCheckbox);

    const cancelButton = screen.getByRole('button', { name: /cancel selected jobs/i });
    await act(async () => {
      fireEvent.click(cancelButton);
    });

    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/jobs/cancel/bulk'),
        { ids: [1] }
      )
    );

    // Refresh after cancellation
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
  });
});
