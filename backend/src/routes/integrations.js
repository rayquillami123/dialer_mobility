
import express from 'express';
const router = express.Router();

// Permite POST desde el bridge AMI (agrega auth si lo prefieres)
router.post('/ami/events', async (req, res) => {
  try {
    const ev = req.body || {};
    // TODO: Normaliza eventos y publícalos por WS al tenant: ws.broadcastToTenant(...)
    // p.ej. mapear AgentLogin/AgentLogoff/QueueMemberStatus a tu modelo
    console.log('[AMI]', ev.Event, ev.Queue || '', ev.MemberName || ev.CallerIDNum || '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'failed' });
  }
});

export default router;
