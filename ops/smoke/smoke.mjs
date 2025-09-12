import fetch from 'node-fetch';
import WebSocket from 'ws';

const API = process.env.API || 'https://api.tudominio.com';
const email = process.env.EMAIL;
const password = process.env.PASS;

if (!email || !password) {
  console.error('Set EMAIL and PASS env vars'); process.exit(2);
}

const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

async function main(){
  // login
  const lr = await fetch(`${API}/api/auth/login`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ email, password }),
  });
  if (!lr.ok) throw new Error(`login HTTP ${lr.status}`);
  const { access_token } = await lr.json();
  console.log('Login OK');

  // API check
  const rr = await fetch(`${API}/api/reports/abandonment?window=15m`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  if (!rr.ok) throw new Error(`report HTTP ${rr.status}`);
  console.log('API abandonment OK');

  // WS check
  const wsUrl = `${API.replace(/^http/i,'ws')}/ws?token=${encodeURIComponent(access_token)}`;
  await new Promise((resolve, reject)=>{
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(()=>reject(new Error('WS timeout')), 8000);
    ws.on('message', (buf)=> {
      try {
        const msg = JSON.parse(buf.toString());
        if (msg?.type === 'ws.hello') {
          clearTimeout(t); console.log('WS hello OK'); ws.close(); resolve(null);
        }
      } catch {}
    });
    ws.on('error', reject);
  });

  console.log('SMOKE OK');
}

main().catch(e=>{ console.error('SMOKE FAIL', e); process.exit(1); });
