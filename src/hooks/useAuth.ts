
'use client';

import { useAuthStore } from '@/store/auth';
import { decodeJwt } from '@/lib/jwt';

let refreshTimer: any = null;

export function useAuth() {
  const { user, accessToken, setSession, clear } = useAuthStore();

  const API = process.env.NEXT_PUBLIC_API || '';
  const TOKEN = accessToken;

  function scheduleRefresh(token: string | null) {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (!token) return;
    const payload: any = decodeJwt(token);
    if (!payload?.exp) return;
    const msLeft = payload.exp * 1000 - Date.now();
    const when = Math.max(0, msLeft - 60000); // 60s antes
    refreshTimer = setTimeout(() => {
      refresh().catch(() => {/* se reintentará en 401 por authedFetch */});
    }, when);
  }

  async function login(email:string, password:string) {
    const r = await fetch(`${API}/api/auth/login`, {
      method:'POST',
      headers: { 'content-type':'application/json' },
      credentials: 'include', // para cookie refresh
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) throw new Error('Credenciales inválidas');
    const data = await r.json();
    const token = data.accessToken ?? data.access_token;
    if (!token) throw new Error('No access token in response');
    setSession(data.user, token);
    scheduleRefresh(token);
  }

  async function refresh() {
    const r = await fetch(`${API}/api/auth/refresh`, {
      method:'POST',
      credentials: 'include',
    });
    if (!r.ok) throw new Error('No refresh');
    const data = await r.json();
    const token = data.accessToken ?? data.access_token;
    if (!token) throw new Error('No access token in response');
    setSession(data.user, token);
    scheduleRefresh(token);
  }

  function clearTimers(){ if (refreshTimer) clearTimeout(refreshTimer); refreshTimer=null; }
  async function logout() {
    try {
      await fetch(`${API}/api/auth/logout`, { method:'POST', credentials:'include' });
    } finally {
      clear();
      clearTimers();
    }
  }

  async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = new Headers(init.headers || {});
    if (TOKEN) headers.set('Authorization', `Bearer ${TOKEN}`);
    const resp = await fetch(input, { ...init, headers, credentials:'include' });
    if (resp.status === 401) {
      // intenta refresh una vez
      await refresh();
      const headers2 = new Headers(init.headers || {});
      const at = useAuthStore.getState().accessToken;
      if (at) headers2.set('Authorization', `Bearer ${at}`);
      return fetch(input, { ...init, headers: headers2, credentials:'include' });
    }
    return resp;
  }

  function hasRole(...roles:string[]) {
    const r = user?.roles || [];
    return roles.some(x => r.includes(x));
  }
  
  if (accessToken) scheduleRefresh(accessToken);

  return { user, accessToken: TOKEN, login, refresh, logout, authedFetch, hasRole };
}
