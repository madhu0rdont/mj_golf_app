import { api } from './api';

export const fetcher = <T>(url: string): Promise<T> => api.get<T>(url);
