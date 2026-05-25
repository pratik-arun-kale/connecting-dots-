import axios, { AxiosError } from 'axios';
import { API_BASE_URL } from '@/lib/constants';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding Authorization headers (future integration)
apiClient.interceptors.request.use(
  (config) => {
    // Placeholder for fetching token from local storage/auth provider
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for centralized error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) {
      // Handle unauthorized access (redirect to login, clear storage)
      console.warn('Unauthorized request. Redirecting or clearing session...');
    }
    return Promise.reject(error);
  }
);

export default apiClient;
