/** טלוויזיית LG מזויפת: מדמה את פרוטוקול SSAP כולל חלון אישור צימוד ו-pointer socket. */
import { WebSocketServer } from 'ws';
import http from 'node:http';

export function startFakeTv({ requirePrompt = true } = {}) {
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  const log = { requests: [], buttons: [], pointer: [] };
  let volume = 10, muted = false;

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (req.url.startsWith('/pointer')) {
        ws.on('message', (raw) => {
          const fields = Object.fromEntries(raw.toString().trim().split('\n').map((l) => l.split(':')));
          log.pointer.push(fields);
          if (fields.type === 'button') log.buttons.push(fields.name);
        });
        return;
      }
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'register') {
          const hasKey = msg.payload['client-key'] === 'secret-key-123';
          if (!hasKey && requirePrompt) {
            ws.send(JSON.stringify({ type: 'response', id: msg.id, payload: { pairingType: 'PROMPT', returnValue: true } }));
            setTimeout(() => ws.send(JSON.stringify({ type: 'registered', id: msg.id, payload: { 'client-key': 'secret-key-123' } })), 50);
          } else {
            ws.send(JSON.stringify({ type: 'registered', id: msg.id, payload: { 'client-key': 'secret-key-123' } }));
          }
          return;
        }
        log.requests.push({ uri: msg.uri, payload: msg.payload });
        const reply = (payload) => ws.send(JSON.stringify({ type: 'response', id: msg.id, payload: { returnValue: true, ...payload } }));
        switch (msg.uri) {
          case 'ssap://audio/volumeUp': volume++; return reply({ volume });
          case 'ssap://audio/volumeDown': volume--; return reply({ volume });
          case 'ssap://audio/getVolume': return reply({ volume, muted });
          case 'ssap://audio/setMute': muted = msg.payload.mute; return reply({});
          case 'ssap://com.webos.service.networkinput/getPointerInputSocket':
            return reply({ socketPath: `ws://127.0.0.1:${server.address().port}/pointer/abc` });
          case 'ssap://com.webos.applicationManager/listLaunchPoints':
            return reply({ launchPoints: [{ id: 'netflix', title: 'Netflix', icon: 'http://x/n.png' }, { id: 'youtube.leanback.v4', title: 'YouTube' }] });
          case 'ssap://tv/getExternalInputList':
            return reply({ devices: [{ id: 'HDMI_1', label: 'HDMI 1', connected: true }, { id: 'HDMI_2', label: 'HDMI 2', connected: false }] });
          case 'ssap://system/turnOff': return reply({});
          case 'ssap://fail/me': return ws.send(JSON.stringify({ type: 'error', id: msg.id, error: '404 no such service' }));
          default: return reply({});
        }
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `ws://127.0.0.1:${server.address().port}`, log, close: () => new Promise((r) => { wss.close(); server.close(r); }) });
    });
  });
}
