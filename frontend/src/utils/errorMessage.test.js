import { extractErrorMessage } from './errorMessage';

describe('extractErrorMessage', () => {
  it('returns string error responses as-is', () => {
    const message = extractErrorMessage({ response: { data: { error: 'Bad thing' } } }, 'fallback');
    expect(message).toBe('Bad thing');
  });

  it('prefers response error message property', () => {
    const message = extractErrorMessage({ response: { data: { error: { message: 'Not found' } } } }, 'fallback');
    expect(message).toBe('Not found');
  });

  it('uses response error code when message missing', () => {
    const message = extractErrorMessage({ response: { data: { error: { code: 'unauthorized' } } } }, 'fallback');
    expect(message).toBe('unauthorized');
  });

  it('falls back to error.message when response missing', () => {
    const message = extractErrorMessage({ message: 'Network error' }, 'fallback');
    expect(message).toBe('Network error');
  });

  it('returns fallback when nothing available', () => {
    const message = extractErrorMessage(null, 'fallback');
    expect(message).toBe('fallback');
  });
});
