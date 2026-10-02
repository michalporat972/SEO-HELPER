import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebOSClient } from '../server/lg/webos.js';
import { startFakeTv } from './fake-tv.js';

const tmpKey = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lgkey-')), 'key.txt');

test('צימוד ראשון: מקבל prompt, שומר client-key, ואז פקודות עובדות', async () => {
  const tv = await startFakeTv();
  const keyFile = tmpKey();
  const client = new WebOSClient({ url: tv.url, keyFile, timeout: 2000 });
  let prompted = false;
  client.on('prompt', () => { prompted = true; });

  await client.connect();
  assert.equal(client.status, 'connected');
  assert.equal(prompted, true);
  assert.equal(fs.readFileSync(keyFile, 'utf8'), 'secret-key-123');

  const v = await client.volumeUp();
  assert.equal(v.volume, 11);
  await client.setMute(true);
  assert.deepEqual(await client.getVolume(), { returnValue: true, volume: 11, muted: true });

  await assert.rejects(client.request('ssap://fail/me'), /404/);

  client.disconnect();
  await tv.close();
});

test('חיבור חוזר עם מפתח שמור לא דורש אישור', async () => {
  const tv = await startFakeTv();
  const keyFile = tmpKey();
  fs.writeFileSync(keyFile, 'secret-key-123');
  const client = new WebOSClient({ url: tv.url, keyFile });
  let prompted = false;
  client.on('prompt', () => { prompted = true; });
  await client.connect();
  assert.equal(prompted, false);
  client.disconnect();
  await tv.close();
});

test('כפתורים עוברים דרך pointer socket', async () => {
  const tv = await startFakeTv({ requirePrompt: false });
  const client = new WebOSClient({ url: tv.url, keyFile: tmpKey() });
  await client.button('UP');
  await client.button('enter');
  await client.move(10, -5);
  await client.click();
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(tv.log.buttons, ['UP', 'ENTER']);
  assert.deepEqual(tv.log.pointer[2], { type: 'move', dx: '10', dy: '-5', down: '0' });
  assert.equal(tv.log.pointer[3].type, 'click');
  await assert.rejects(client.button('NOPE'), /לא מוכר/);
  client.disconnect();
  await tv.close();
});

test('טלוויזיה כבויה: החיבור נכשל מהר ובצורה מסודרת', async () => {
  const client = new WebOSClient({ url: 'ws://127.0.0.1:1', keyFile: tmpKey(), timeout: 1000 });
  await assert.rejects(client.connect());
  assert.equal(client.status, 'disconnected');
});

test('Wake-on-LAN בונה חבילת קסם תקינה ונכשל על MAC שגוי', async () => {
  const bad = new WebOSClient({ ip: '127.0.0.1', mac: 'zz:zz', keyFile: tmpKey() });
  await assert.rejects(bad.wake(), /MAC/);
  const none = new WebOSClient({ ip: '127.0.0.1', keyFile: tmpKey() });
  await assert.rejects(none.wake(), /LG_TV_MAC/);
  const ok = new WebOSClient({ ip: '127.0.0.1', mac: 'AA:BB:CC:DD:EE:FF', keyFile: tmpKey() });
  const r = await ok.wake().catch((e) => ({ error: e.message }));
  // בסביבות ללא broadcast ייתכן EACCES; העיקר שלא קרס על parsing
  assert.ok(r.sent || /EACCES|EPERM|ENETUNREACH/.test(r.error), JSON.stringify(r));
});
