import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import axios from 'axios';
import SystemInfoPage from '../../pages/SystemInfoPage';

jest.mock('axios');
const consoleError = console.error;

beforeAll(() => {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserver;
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    const [message] = args;
    if (typeof message === 'string' && message.includes('not wrapped in act')) {
      return;
    }
    consoleError(...args);
  });
});

afterAll(() => {
  console.error.mockRestore();
});

const buildMetricsResponse = (overrides = {}) => ({
  data: {
    success: true,
    metrics: {
      cpu: { usage: 15, cores: 4 },
      memory: { usagePercent: 30 },
      disk: { usagePercent: 10 },
      ...overrides
    }
  }
});

const buildHealthResponse = (overrides = {}) => ({
  data: {
    success: true,
    status: 'healthy',
    database: { status: 'healthy' },
    docker: { status: 'healthy' },
    ...overrides
  }
});

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('SystemInfoPage', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  it('renders metrics and health data when API calls succeed', async () => {
    axios.get
      .mockResolvedValueOnce(buildMetricsResponse())
      .mockResolvedValueOnce(buildHealthResponse());

    await act(async () => {
      render(<SystemInfoPage />);
      await flushPromises();
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading system info...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Service Health')).toBeInTheDocument();
    expect(screen.getByText(/CPU/i)).toBeInTheDocument();
    expect(screen.getByText(/15.0%/)).toBeInTheDocument();
  });

  it('shows partial errors while keeping available data', async () => {
    axios.get
      .mockResolvedValueOnce(buildMetricsResponse())
      .mockRejectedValueOnce({ response: { data: { error: { message: 'Health endpoint unavailable' } } } });

    await act(async () => {
      render(<SystemInfoPage />);
      await flushPromises();
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading system info...')).not.toBeInTheDocument();
      expect(screen.getByText(/Health: Health endpoint unavailable/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/15.0%/)).toBeInTheDocument();
  });
});
