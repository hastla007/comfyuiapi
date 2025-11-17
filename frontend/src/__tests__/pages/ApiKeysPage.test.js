import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import ApiKeysPage from '../../pages/ApiKeysPage';

jest.mock('axios');

describe('ApiKeysPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an API key and shows the secret', async () => {
    axios.post.mockResolvedValue({
      data: {
        api_key: 'sk_test',
        key_id: 1,
        key_prefix: 'sk_',
        name: 'CLI',
        user_id: 5
      }
    });
    axios.get.mockResolvedValue({ data: { api_keys: [] } });

    render(<ApiKeysPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Key Label'), { target: { value: 'CLI' } });

    fireEvent.click(screen.getByRole('button', { name: /create key/i }));

    await waitFor(() => expect(screen.getByText(/copy this key/i)).toBeInTheDocument());
    expect(screen.getByText('sk_test')).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/admin/api-keys/5'));
  });

  it('shows an error when loading keys fails', async () => {
    axios.get.mockRejectedValue(new Error('boom'));

    render(<ApiKeysPage />);

    fireEvent.change(screen.getByPlaceholderText('User ID'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => expect(screen.getByText(/failed to load api keys/i)).toBeInTheDocument());
  });
});
