
// src/services/esl.js
import net from 'net';
import 'dotenv/config';

const { FS_ESL_HOST, FS_ESL_PORT, FS_ESL_PASSWORD } = process.env;

let eslSocket = null;
let reconnectTimer = null;
const eventHandlers = [];

function connect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  
  console.log(`Connecting to FreeSWITCH ESL at ${FS_ESL_HOST}:${FS_ESL_PORT}...`);
  eslSocket = net.createConnection({ host: FS_ESL_HOST, port: FS_ESL_PORT });

  eslSocket.on('data', (data) => {
    const s = data.toString();
    if (s.includes('auth/request')) {
      console.log('ESL authentication requested.');
      eslSocket.write(`auth ${FS_ESL_PASSWORD}\n\n`);
      eslSocket.write('event json ALL\n\n'); // O suscríbete a eventos específicos
    } else if (s.includes('Content-Type: text/event-json')) {
      try {
        const jsonBody = s.substring(s.indexOf('{'));
        const event = JSON.parse(jsonBody);
        eventHandlers.forEach(handler => handler(event));
      } catch (e) {
        console.error('Failed to parse ESL event JSON:', e);
      }
    }
  });

  eslSocket.on('connect', () => {
    console.log('Successfully connected to FreeSWITCH ESL.');
  });

  eslSocket.on('error', (err) => {
    console.error('ESL Connection Error:', err.message);
  });

  eslSocket.on('close', () => {
    console.log('ESL connection closed. Reconnecting in 5 seconds...');
    eslSocket = null;
    reconnectTimer = setTimeout(connect, 5000);
  });
}

export function eslInit({ onEvent }) {
  if (onEvent) {
    eventHandlers.push(onEvent);
  }
  if (!eslSocket) {
    connect();
  }
}

export function getEslSocket() {
  return eslSocket;
}
