/**
 * Native Fetch API client wrapper.
 *
 * Responsibilities:
 *   1. Compose the full URL from PUBLIC_API_BASE_URL (loaded via Vite's
 *      import.meta.env inside Astro).
 *   2. Inject `Authorization: Bearer <token>` automatically when a token
 *      is present in localStorage (key: "spotsync_token").
 *   3. Parse the unified `ApiResponse<T>` envelope and unwrap its `data`.
 *   4. Translate non-2xx responses into typed `ApiError` instances so the
 *      UI can switch on HTTP status (401 -> redirect, 409 -> zone full,
 *      500 -> generic error toast).
 *
 * This file deliberately has zero third-party dependencies — we use the
 * native `fetch` API so the bundle stays minimal and the cogs of the
 * request lifecycle are explicit and easy to debug.
 */

import { DEFAULT_API_BASE_URL, STORAGE_KEYS } from "../lib/constants";
import type { ApiResponse } from "../types/api";

// Base URL must be provided via the `PUBLIC_API_BASE_URL` env var at build
// time (see frontend/.env.example). The localhost fallback exists only so
// `astro dev` without a configured .env still runs against a local server;
// production builds are expected to set the variable explicitly.
const API_BASE_URL: string =
  import.meta.env.PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

/** LocalStorage key holding the JWT Bearer token written by authStore. */
export const TOKEN_STORAGE_KEY = STORAGE_KEYS.TOKEN;

/**
 * Custom error class carrying the HTTP status code and the backend's
 * human-readable message so callers can show useful toasts.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly errors?: string;

  constructor(status: number, message: string, errors?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

/**
 * Read the current JWT token from localStorage. Returns `null` when the
 * user is not authenticated. Kept as a function (not a constant) so each
 * request reads the latest value at call time, which matters when the
 * user logs in or out in another tab / via the auth store.
 */
function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    // Defensive: this module is only called from client-side scripts,
    // but guard against SSR contexts just in case.
    return null;
  }
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  return token && token.length > 0 ? token : null;
}

/**
 * Normalize `RequestInit.headers` into a plain `Record<string, string>`.
 * The `HeadersInit` union accepts arrays, `Headers` instances, or
 * plain records; this helper produces a uniform record we can merge
 * without runtime guards at every call site.
 */
function normalizeHeaders(
  init: RequestInit["headers"],
): Record<string, string> | undefined {
  if (init === undefined || init === null) return undefined;
  if (Array.isArray(init)) {
    const out: Record<string, string> = {};
    for (const [key, value] of init) {
      out[key] = String(value);
    }
    return out;
  }
  if (typeof Headers !== "undefined" && init instanceof Headers) {
    const out: Record<string, string> = {};
    init.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (typeof init === "object") {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(init)) {
      out[key] = String(value);
    }
    return out;
  }
  return undefined;
}

/**
 * Build the final headers for a request. JSON is the default content type
 * for any non-GET request that has a body. The Authorization header is
 * added opportunistically when a token is present.
 */
function buildHeaders(
  extraHeaders: Record<string, string> | undefined,
  hasBody: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers[key] = value;
    }
  }

  return headers;
}

/**
 * Narrow a parsed JSON value into our `ApiResponse<T>` envelope shape
 * without trusting the runtime. Returns `null` if any required field
 * is missing or of an unexpected type so the caller can fall back to
 * a default error message instead of throwing on a malformed payload.
 */
function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as { success?: unknown; message?: unknown; data?: unknown };
  return (
    typeof candidate.success === "boolean" &&
    typeof candidate.message === "string"
  );
}

/**
 * Core wrapper around the native `fetch` API. Always returns the parsed
 * `data` payload on success; throws an `ApiError` on any non-2xx response.
 *
 * @typeParam T - The shape of the `data` field inside `ApiResponse`.
 * @param endpoint - Path appended to the API base URL (e.g. `/auth/login`).
 * @param options - Standard `RequestInit` overrides (method, body, headers…).
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const method = (options.method ?? "GET").toUpperCase();
  const hasBody = options.body !== undefined && options.body !== null;

  const headers = buildHeaders(normalizeHeaders(options.headers), hasBody);

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      method,
      headers,
      // We never want to short-circuit on HTTP errors — we want to read
      // the body ourselves so we can surface the backend's message.
    });
  } catch (networkError) {
    // Truly unreachable server, DNS failure, CORS preflight rejected, etc.
    const message =
      networkError instanceof Error
        ? networkError.message
        : "Network error: unable to reach the SpotSync API.";
    throw new ApiError(0, message);
  }

  // Some endpoints (e.g. DELETE) may return an empty body. Guard accordingly.
  const contentType = response.headers.get("Content-Type") ?? "";
  const isJson = contentType.includes("application/json");

  let raw: unknown = null;
  if (isJson) {
    try {
      raw = await response.json();
    } catch {
      raw = null;
    }
  }

  // Narrow the raw payload to our `ApiResponse<T>` envelope shape. When
  // the envelope is missing we treat the body as the raw `data` value.
  const envelope = isApiResponse(raw) ? (raw as ApiResponse<T>) : null;
  const rawData =
    !envelope && raw !== null && typeof raw === "object" && "data" in raw
      ? (raw as { data: T }).data
      : null;

  if (!response.ok) {
    const status = response.status;
    const message =
      envelope?.message ??
      defaultMessageForStatus(status) ??
      `Request failed with status ${status}.`;
    const errors = envelope?.errors;
    throw new ApiError(status, message, errors);
  }

  // Success path: unwrap the envelope. If the backend forgot to send a
  // `data` field we still return an empty fallback so callers don't crash.
  if (envelope) {
    return envelope.data;
  }
  if (rawData !== null) {
    return rawData;
  }

  // Fallback for endpoints that respond with raw JSON (no envelope).
  return (raw ?? null) as T;
}

/**
 * Convenience: default human-readable message for common HTTP statuses
 * when the backend hasn't provided one. Keeps the UX friendly even if
 * the server returns an empty body.
 */
function defaultMessageForStatus(status: number): string | null {
  switch (status) {
    case 400:
      return "The request was invalid. Please check your input and try again.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested resource was not found.";
    case 409:
      return "This action conflicts with the current state of the resource.";
    case 422:
      return "Validation failed for the submitted data.";
    case 500:
      return "The server encountered an error. Please try again later.";
    case 503:
      return "The service is temporarily unavailable. Please try again later.";
    default:
      return null;
  }
}

/**
 * Shared internal helper for service-layer write operations that all
 * follow the same shape:
 *
 *     apiFetch<T>(ENDPOINT, {
 *       method: "POST" | "PATCH" | "PUT",
 *       body: JSON.stringify(payload),
 *     });
 *
 * Centralizing the JSON serialization keeps every write call site in
 * the service layer symmetric with `apiFetch`'s read-only defaults
 * and removes the repeated `JSON.stringify(payload)` boilerplate.
 *
 * Behavior is identical to the inline call sites — the request still
 * goes through `apiFetch` so Bearer-token injection, envelope
 * unwrapping, and error translation are unchanged.
 */
export async function apiSendJson<T>(
  endpoint: string,
  method: "POST" | "PATCH" | "PUT",
  body: unknown,
): Promise<T> {
  return apiFetch<T>(endpoint, {
    method,
    body: JSON.stringify(body),
  });
}
