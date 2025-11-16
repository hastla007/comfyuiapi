export function extractErrorMessage(error, fallback = 'An unexpected error occurred') {
  const responseError = error?.response?.data?.error;

  if (typeof responseError === 'string') {
    return responseError;
  }

  if (responseError && typeof responseError === 'object') {
    if (typeof responseError.message === 'string') {
      return responseError.message;
    }

    if (typeof responseError.code === 'string') {
      return responseError.code;
    }
  }

  if (typeof error?.message === 'string') {
    return error.message;
  }

  return fallback;
}

export default extractErrorMessage;
