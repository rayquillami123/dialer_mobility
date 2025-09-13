#!/usr/bin/env node
/**
 * Bridge AMI mínimo:
 * - Conecta al AMI de Asterisk/Issabel
 * - Parsea eventos y los reenvía a tu backend (HTTP POST)
 * - Reintenta auto-reconexión
 */
import net from 'net';
import http from 'http';

const AMI_HOST = process.env.ASTERISK_AMI_HOST || '127.0.0.1';
const AMI_PORT = Number(process.env.ASTERISK_AMI_PORT || 5038);
const AMI_USER = process.env.ASTERISK_AMI_USER || 'amiuser';
const AMI_PASS = process.env.ASTERISK_AMI_PASS || 'amipass';
const POST_URL = new URL(process.env.AMI_BACKEND_POST || 'http://localhost:8080/api/integrations/ami/events');

let sock, buf = '';

function postEvent(ev) {
  const payload = JSON.stringify(ev);
  const opts = {
    method: 'POST',
    hostname: POST_URL.hostname,
    port: POST_URL.port || (POST_URL.protocol === 'https:' ? 443 : 80),
    path: POST_URL.pathname + (POST_URL.search || ''),
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
  };
  const req = http.request(opts, res => { res.resume(); });
  req.on('error', () => {});
  req.write(payload); req.end();
}

function parseBlock(block) {
  const lines = block.split(/\r?\n/).filter(Boolean);
  const ev = {};
  for (const l of lines) {
    const idx = l.indexOf(':');
    if (idx > 0) {
      const k = l.slice(0, idx).trim();
      const v = l.slice(idx+1).trim();
      ev[k] = v;
    }
  }
  if (ev['Event']) postEvent(ev);
}

function connect() {
  sock = net.createConnection({ host: AMI_HOST, port: AMI_PORT }, () => {
    buf = '';
    sock.write(`Action: Login\r\nUsername: ${AMI_USER}\r\nSecret: ${AMI_PASS}\r\nEvents: on\r\n\r\n`);
    console.log('AMI connected');
  });
  sock.on('data', (d) => {
    buf += d.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\r\n\r\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 4);
      parseBlock(block);
    }
  });
  sock.on('error', (e) => console.error('AMI error', e.message));
  sock.on('close', () => {
    console.log('AMI closed, retrying in 3s');
    setTimeout(connect, 3000);
  });
}
connect();
