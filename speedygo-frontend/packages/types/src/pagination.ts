export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

export interface ApiError {
  error: true;
  message: string;
}

export interface OkResponse {
  ok: boolean;
  message?: string;
}

