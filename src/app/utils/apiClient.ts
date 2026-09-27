import { API_URL } from '../config/api';

export const getAuthHeaders = () => {
  const token =
    localStorage.getItem('unavet_token') || localStorage.getItem('token');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  };
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  defaultError: string;
};

export const requestJson = async <T>(
  endpoint: string,
  { method = 'GET', body, defaultError }: RequestOptions
): Promise<T> => {
  const response = await fetch(`${API_URL}/${endpoint.replace(/^\/+/, '')}`, {
    method,
    headers: getAuthHeaders(),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(defaultError);
  }

  if (!response.ok) {
    const error = data as { message?: string; error?: string } | null;
    throw new Error(error?.message || error?.error || defaultError);
  }

  return data as T;
};
