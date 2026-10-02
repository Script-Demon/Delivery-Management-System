import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [socket, setSocket] = useState(null);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      toast('Your session has expired. Please sign in again.', 'warn');
    });
    if (!getToken()) { setReady(true); return; }
    api('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, [logout, toast]);

  // One socket per signed-in session.
  useEffect(() => {
    if (!user) return;
    const s = io({ auth: { token: getToken() }, transports: ['websocket', 'polling'] });
    setSocket(s);
    return () => { s.disconnect(); setSocket(null); };
  }, [user?.id]);

  // Surface server notifications as toasts, but not for changes this user just made.
  const lastOwnAction = useRef(0);
  useEffect(() => {
    if (!socket) return;
    const onChange = (e) => {
      if (Date.now() - lastOwnAction.current < 1500) return;
      if (e.message) toast(e.message);
    };
    socket.on('order:changed', onChange);
    return () => socket.off('order:changed', onChange);
  }, [socket, toast]);

  const signIn = useCallback(({ token, user }) => {
    setToken(token);
    setUser(user);
  }, []);

  const value = useMemo(
    () => ({
      user, setUser, ready, socket, signIn, logout, toast, toasts, dismissToast,
      markOwnAction: () => { lastOwnAction.current = Date.now(); },
    }),
    [user, ready, socket, signIn, logout, toast, toasts, dismissToast]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent(event, handler) {
  const { socket } = useSession();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (...args) => ref.current(...args);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}

export const homePath = (role) => ({ admin: '/dashboard', agent: '/jobs', customer: '/home' })[role] || '/login';
