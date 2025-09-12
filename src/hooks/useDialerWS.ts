
'use client';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function useDialerWS(onMsg: (data:any)=>void) {
  const { accessToken } = useAuth();
  const ref = useRef<WebSocket|null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const base = process.env.NEXT_PUBLIC_WS || (process.env.NEXT_PUBLIC_API||'').replace(/^http/i,'ws').replace(/\/$/,'') + '/ws';
    const url = `${base}?token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(url);
    ref.current = ws;
    ws.onmessage = (ev) => { try { onMsg(JSON.parse(ev.data)); } catch {} };
    ws.onclose = () => { /* opcional: reconexión con backoff */ };
    return () => { try { ws.close(); } catch {} };
  }, [accessToken, onMsg]);

  return ref;
}
