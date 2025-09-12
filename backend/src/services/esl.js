import net from 'net';

let eslSocket = null;
let reconnectTimer = null;
const eventHandlers = [];

function connect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  
  const host = process.env.FS_ESL_HOST || '127.0.0.1';
  const port = Number(process.env.FS_ESL_PORT || 8021);
  const pass = process.env.FS_ESL_PASSWORD || 'ClueCon';

  console.log(`Connecting to FreeSWITCH ESL at ${host}:${port}...`);
  eslSocket = net.createConnection({ host, port });
  eslSocket.setEncoding('utf8');

  eslSocket.on('data', (data) => {
    const s = data.toString();
    if (s.includes('auth/request')) {
      console.log('ESL authentication requested.');
      eslSocket.write(`auth ${pass}\n\n`);
      // Añadimos CHANNEL_BRIDGE para cancelar timers Safe Harbor y otros eventos.
      eslSocket.write('event json CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_BRIDGE CHANNEL_HANGUP_COMPLETE CHANNEL_EXECUTE_COMPLETE CUSTOM callcenter::info\n\n');
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

function api(cmd) {
  return new Promise((resolve, reject) => {
    if (!eslSocket || !eslSocket.writable) {
      return reject(new Error('ESL socket not connected or writable.'));
    }
    const toSend = `api ${cmd}\n\n`;
    eslSocket.write(toSend, (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

export function eslInit({ onEvent } = {}) {
  if (onEvent && !eventHandlers.includes(onEvent)) {
    eventHandlers.push(onEvent);
  }
  if (!eslSocket) {
    connect();
  }

  return { api };
}

export function getEslSocket() {
    return { eslSocket, api };
}
