import { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = 'dms_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable: session only lasts this tab */ }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.details);
  }
  return data;
}

/** Fetch `path` on mount and whenever it changes. `reload()` refetches without flashing a spinner. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const latest = useRef(path);
  latest.current = path;

  const load = useCallback(async (quiet) => {
    if (!path) return;
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api(path);
      if (latest.current === path) setState({ data, error: null, loading: false });
    } catch (error) {
      if (latest.current === path) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [path]);

  useEffect(() => { load(false); }, [load]);
  const reload = useCallback(() => load(true), [load]);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

/** Human-readable message for a failed request, including field errors. */
export function errorText(err) {
  if (!err) return '';
  if (err.details && typeof err.details === 'object') {
    return Object.entries(err.details).map(([f, m]) => `${humanize(f)} ${m}`).join('. ');
  }
  return err.message;
}

const humanize = (field) =>
  field.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
