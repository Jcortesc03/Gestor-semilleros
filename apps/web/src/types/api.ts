export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export type ApiRequest = (path: string, options?: ApiOptions) => Promise<unknown>;
