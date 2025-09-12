// hooks/useDialerWS.ts
import { useEffect } from "react";
import { useDialerStore } from "@/store/dialer";
export function useDialerWS(url: string) {
  const { onKpi, onCall, onAgent, onQueue } = useDialerStore();
  useEffect(() => {
    if (!url) return;
    const ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "kpi.tick") onKpi(m);
        else if (m.type === "call.update") onCall(m);
        else if (m.type === "agent.update") onAgent(m);
        else if (m.type === "queue.update") onQueue(m);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };
    ws.onopen = () => console.log("WebSocket connected");
    ws.onerror = (event) => {
      console.error("WebSocket error:", "Connection failed. Check the browser's Network tab for more details.", event);
    };
    ws.onclose = () => console.log("WebSocket disconnected");
    
    return () => ws.close();
  }, [url, onKpi, onCall, onAgent, onQueue]);
}
