/**
 * Standard API response envelope returned by the Go backend.
 *
 * All backend endpoints wrap their payload in this structure so the frontend
 * can uniformly check `success`, surface `message` toasts, and unwrap `data`.
 */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: string;
}

/**
 * Standard error payload used for validation / business rule failures
 * where the backend wants to communicate field-level errors.
 */
export interface ApiErrorPayload {
  success: false;
  message: string;
  errors?: string;
}
