'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

type WSStatus = 'idle' | 'connecting' | 'open' | 'closed';

export function useDialerWS(onMessage: (data: any) => void) {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<WSStatus>('idle');
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef(1000); // 1s → máx 30s

  const base = process.env.NEXT_PUBLIC_WS ||
    (process.env.NEXT_PUBLIC_API || '').replace(/^http/i, 'ws').replace(/\/$/, '') + '/ws';

  function cleanup() {
    if (pingRef.current) clearInterval(pingRef.current);
    pingRef.current = null;
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    reconnectRef.current = null;
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
  }

  function scheduleReconnect() {
    const delay = Math.min(backoffRef.current, 30000);
    reconnectRef.current = setTimeout(connect, delay);
    backoffRef.current = Math.min(delay * 2, 30000);
  }

  function connect() {
    if (!accessToken || !base) return;
    cleanup();
    setStatus('connecting');
    const url = `${base}?token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    let lastPong = Date.now();
    ws.onopen = () => {
      setStatus('open');
      backoffRef.current = 1000;
      // Heartbeat
      pingRef.current = setInterval(() => {
        try {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          // Si no hay PONG en 40s, forzar cierre para reconectar
          if (Date.now() - lastPong > 40000) {
            try { wsRef.current.close(); } catch {}
            return;
          }
          wsRef.current.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        } catch {}
      }, 25000);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === 'pong') { lastPong = Date.now(); return; }
        onMessage(data);
      } catch {}
    };

    ws.onclose = () => {
      setStatus('closed');
      cleanup();
      scheduleReconnect();
    };
    ws.onerror = () => {
      setStatus('closed');
      try { ws.close(); } catch {}
    };
  }

  useEffect(() => {
    if (!accessToken) return;
    connect();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, base]);

  return { status };
}
