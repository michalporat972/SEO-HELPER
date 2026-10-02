import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { WebOSClient } from '../server/lg/webos.js';
import { createMockAdapter } from '../server/ac/mock.js';
import { createSensiboAdapter } from '../server/ac/sensibo.js';
import { createBroadlinkAdapter } from '../server/ac/broadlink.js';
import { createHttpAdapter } from '../server/ac/http.js';
import { startFakeTv } from './fake-tv.js';

const publicDir = path.resolve('public');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'remote-'));

async function serve(app) {
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (p, body, method) => {
    const res = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return { call, close: () => new Promise((r) => srv.close(r)) };
}

test('API טלוויזיה + מזגן דמה: זרימה מלאה', async () => {
  const tv = await startFakeTv({ requirePrompt: false });
  const client = new WebOSClient({ url: tv.url, keyFile: path.join(tmp(), 'k') });
  const ac = createMockAdapter();
  const { call, close } = await serve(createApp({ tv: client, ac, publicDir, tvInfo: { ip: '1.2.3.4', mac: 'AA:BB:CC:DD:EE:FF' } }));

  let r = await call('/api/status');
  assert.equal(r.status, 200);
  assert.equal(r.json.tv.status, 'disconnected');
  assert.equal(r.json.ac.adapter, 'mock');
  assert.equal(r.json.ac.state.power, false);
  assert.ok(r.json.meta.apps.length > 5);

  r = await call('/api/tv/connect', {});
  assert.equal(r.json.status, 'connected');

  r = await call('/api/tv/button', { name: 'home' });
  assert.equal(r.json.ok, true);
  r = await call('/api/tv/button', { name: 'BOGUS' });
  assert.equal(r.status, 400);

  r = await call('/api/tv/volume', { delta: 1 });
  assert.equal(r.json.volume, 11);
  r = await call('/api/tv/volume', { mute: true });
  assert.equal(r.json.muted, true);

  r = await call('/api/tv/apps');
  assert.equal(r.json[0].name, 'Netflix');
  r = await call('/api/tv/app', { id: 'netflix' });
  assert.equal(r.status, 200);
  r = await call('/api/tv/inputs');
  assert.equal(r.json.length, 2);
  r = await call('/api/tv/input', { id: 'HDMI_2' });
  assert.equal(r.status, 200);
  assert.deepEqual(tv.log.requests.at(-1), { uri: 'ssap://tv/switchInput', payload: { inputId: 'HDMI_2' } });

  r = await call('/api/tv/text', { text: 'שלום', enter: true });
  assert.equal(r.status, 200);
  assert.equal(tv.log.requests.at(-2).payload.text, 'שלום');

  r = await call('/api/tv/command', { uri: 'http://evil' });
  assert.equal(r.status, 400);

  // כיבוי דרך power toggle כשמחוברים
  r = await call('/api/tv/power', {});
  assert.deepEqual(r.json, { off: true });

  // מזגן
  r = await call('/api/ac/state', { power: true, mode: 'cool', targetTemperature: 22 });
  assert.equal(r.json.power, true);
  assert.equal(r.json.targetTemperature, 22);
  r = await call('/api/ac/temperature', { delta: 1 });
  assert.equal(r.json.targetTemperature, 23);
  r = await call('/api/ac/state', { targetTemperature: 99 });
  assert.equal(r.status, 500);
  assert.match(r.json.error, /טמפרטורה/);
  r = await call('/api/ac/state', { mode: 'turbo' });
  assert.match(r.json.error, /מצב לא חוקי/);
  r = await call('/api/ac/power', {});
  assert.equal(r.json.power, false);
  r = await call('/api/ac/learn', { key: 'x' });
  assert.equal(r.status, 400);

  await close(); client.disconnect(); await tv.close();
});

test('הממשק ו-SPA fallback מוגשים', async () => {
  const client = new WebOSClient({ url: 'ws://127.0.0.1:1', keyFile: path.join(tmp(), 'k'), timeout: 500 });
  const { call, close } = await serve(createApp({ tv: client, ac: createMockAdapter(), publicDir }));
  const r = await call('/');
  assert.equal(r.status, 200);
  // טלוויזיה כבויה → כפתור מחזיר שגיאה מסודרת ולא קריסה
  const b = await call('/api/tv/button', { name: 'UP' });
  assert.equal(b.status, 500);
  assert.equal(b.json.ok, false);
  await close();
});

test('מתאם Sensibo: קריאות API נכונות', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body && JSON.parse(init.body) });
    const u = String(url);
    const ok = (result) => new Response(JSON.stringify({ status: 'success', result }), { status: 200 });
    if (u.includes('/users/me/pods')) return ok([{ id: 'POD1', room: { name: 'סלון' } }]);
    if (u.includes('/pods/POD1/acStates')) return ok({});
    if (u.includes('/pods/POD1')) return ok({ acState: { on: false, mode: 'cool', targetTemperature: 24, fanLevel: 'auto', swing: 'stopped' }, measurements: { temperature: 27.3, humidity: 60 }, room: { name: 'סלון' } });
    return new Response('{}', { status: 404 });
  };
  const ac = createSensiboAdapter({ apiKey: 'K', fetchImpl });
  const s = await ac.getState();
  assert.equal(s.roomTemperature, 27.3);
  assert.equal(s.room, 'סלון');
  await ac.setState({ power: true, targetTemperature: 21 });
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post.url.includes('/pods/POD1/acStates') && post.url.includes('apiKey=K'));
  assert.deepEqual(post.body.acState, { on: true, mode: 'cool', targetTemperature: 21, fanLevel: 'auto', swing: 'stopped' });
  assert.throws(() => createSensiboAdapter({}), /SENSIBO_API_KEY/);
});

test('מתאם Broadlink: למידה, fallback של מפתחות ושליחה', async () => {
  const dir = tmp();
  const sent = [];
  let learnCalls = 0;
  const fakeDev = {
    host: { address: '10.0.0.5' }, mac: [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff],
    auth: async () => {}, sendData: async (d) => sent.push(d),
    enterLearning: async () => { learnCalls++; },
    checkData: async () => Buffer.from([0x26, 0x00, 0x01, 0x02]),
  };
  const ac = createBroadlinkAdapter({ ip: '10.0.0.5', codesFile: path.join(dir, 'codes.json'), stateFile: path.join(dir, 'state.json'), broadlinkLib: { discover: async () => [fakeDev] } });

  await assert.rejects(ac.setState({ power: true, mode: 'cool', targetTemperature: 24 }), /אין קוד IR/);
  const l = await ac.learn('cool');
  assert.equal(l.learned, true); assert.equal(learnCalls, 1);
  await ac.learn('off');
  // אין קוד מדויק ל-cool_24_auto, אבל יש fallback ל-cool
  const s = await ac.setState({ power: true, mode: 'cool', targetTemperature: 24, fanLevel: 'auto' });
  assert.equal(s.power, true);
  assert.deepEqual(s.learnedKeys.sort(), ['cool', 'off']);
  assert.equal(sent.length, 1); assert.equal(sent[0], '26000102');
  await ac.setState({ power: false });
  assert.equal(sent.length, 2);
  // המצב נשמר לדיסק
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'state.json'))).power, false);
  await ac.deleteCode('cool');
  assert.deepEqual(await ac.getCodes(), ['off']);
});

test('מתאם HTTP: תבנית URL ו-POST', async () => {
  const hits = [];
  const fetchImpl = async (url, init) => { hits.push({ url, init }); return new Response('', { status: 200 }); };
  const ac = createHttpAdapter({ urlTemplate: 'http://bridge/ac?cmd={cmd}&t={temp}&m={mode}', fetchImpl });
  await ac.setState({ power: true, mode: 'heat', targetTemperature: 28 });
  assert.equal(hits[0].url, 'http://bridge/ac?cmd=heat_28_auto&t=28&m=heat');
  const post = createHttpAdapter({ urlTemplate: 'http://bridge/ac', method: 'POST', fetchImpl });
  await post.setState({ power: false });
  assert.equal(JSON.parse(hits[1].init.body).power, false);
  const bad = createHttpAdapter({ urlTemplate: 'http://bridge', fetchImpl: async () => new Response('', { status: 503 }) });
  await assert.rejects(bad.setState({ power: true }), /503/);
});
