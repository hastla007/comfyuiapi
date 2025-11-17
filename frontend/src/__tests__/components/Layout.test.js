import { render, screen, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Layout from '../../components/Layout';
import axios from 'axios';

jest.mock('axios');

beforeEach(() => {
  axios.get.mockResolvedValue({ data: { success: true, gpus: [] } });
});

const MockLayout = ({ children }) => (
  <BrowserRouter>
    <Layout>{children}</Layout>
  </BrowserRouter>
);

describe('Layout Component', () => {
  it('renders header with title', () => {
    act(() => {
      render(<MockLayout><div>Test</div></MockLayout>);
    });
    expect(screen.getByText('ComfyUI Manager')).toBeInTheDocument();
  });

  it('renders all navigation items', () => {
    act(() => {
      render(<MockLayout><div>Test</div></MockLayout>);
    });

    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Playground')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('Queue')).toBeInTheDocument();
    expect(screen.getByText('API Docs')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
  });

  it('renders children content', () => {
    act(() => {
      render(<MockLayout><div data-testid="child-content">Child Content</div></MockLayout>);
    });
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });
});
