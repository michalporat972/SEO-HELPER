import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { WebOSClient } from '../server/lg/webos.js';
import { createMockAdapter } from '../server/lights/mock.js';
import { createHueAdapter } from '../server/lights/hue.js';
import { createShellyAdapter, parseShellyDevices } from '../server/lights/shelly.js';
import { createHomeAssistantAdapter } from '../server/lights/homeassistant.js';
import { combineAdapters, normalizePatch, rgbToHsv, hsvToRgb } from '../server/lights/base.js';
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

test('API טלוויזיה + אורות דמה: זרימה מלאה', async () => {
  const tv = await startFakeTv({ requirePrompt: false });
  const client = new WebOSClient({ url: tv.url, keyFile: path.join(tmp(), 'k') });
  const lights = createMockAdapter();
  const { call, close } = await serve(createApp({ tv: client, lights, publicDir, tvInfo: { ip: '1.2.3.4', mac: 'AA:BB:CC:DD:EE:FF' } }));

  let r = await call('/api/status');
  assert.equal(r.status, 200);
  assert.equal(r.json.tv.status, 'disconnected');
  assert.equal(r.json.lights.adapter, 'mock');
  assert.equal(r.json.lights.rooms[0].name, 'סלון');
  assert.equal(r.json.lights.rooms.length, 4);
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

  // אורות
  r = await call('/api/lights/mock:2', { on: true, brightness: 55 });
  assert.equal(r.json.on, true); assert.equal(r.json.brightness, 55);
  r = await call('/api/lights/mock:2', { color: '#ff0000' });
  assert.deepEqual(r.json.color, { r: 255, g: 0, b: 0 });
  r = await call('/api/lights/mock:2', { brightness: 150 });
  assert.equal(r.status, 500); assert.match(r.json.error, /בהירות/);
  r = await call('/api/lights/nope', { on: true });
  assert.equal(r.status, 500);
  r = await call('/api/lights/room/מטבח', { on: true });
  assert.equal(r.json.changed, 2);
  r = await call('/api/lights/room/אין', { on: true });
  assert.equal(r.status, 400);
  r = await call('/api/lights/all', { on: false });
  assert.equal(r.json.changed, 7); assert.deepEqual(r.json.failed, []);
  r = await call('/api/lights');
  assert.ok(r.json.every((room) => room.lights.every((l) => !l.on)));
  r = await call('/api/lights/all', {});
  assert.equal(r.status, 400);
  r = await call('/api/lights/pair', {});
  assert.equal(r.status, 400);

  await close(); client.disconnect(); await tv.close();
});

test('הממשק ו-SPA fallback מוגשים', async () => {
  const client = new WebOSClient({ url: 'ws://127.0.0.1:1', keyFile: path.join(tmp(), 'k'), timeout: 500 });
  const { call, close } = await serve(createApp({ tv: client, lights: createMockAdapter(), publicDir }));
  const r = await call('/');
  assert.equal(r.status, 200);
  // טלוויזיה כבויה → כפתור מחזיר שגיאה מסודרת ולא קריסה
  const b = await call('/api/tv/button', { name: 'UP' });
  assert.equal(b.status, 500);
  assert.equal(b.json.ok, false);
  await close();
});

test('מודל אחיד: normalizePatch והמרות צבע', () => {
  assert.deepEqual(normalizePatch({ brightness: 0 }), { brightness: 0, on: false });
  assert.deepEqual(normalizePatch({ brightness: 40 }), { brightness: 40, on: true });
  assert.deepEqual(normalizePatch({ color: '#00ff00' }), { color: { r: 0, g: 255, b: 0 }, on: true });
  assert.throws(() => normalizePatch({}), /אין מה לשנות/);
  assert.throws(() => normalizePatch({ color: 'zzz' }), /hex/);
  const back = hsvToRgb(rgbToHsv({ r: 200, g: 50, b: 120 }));
  assert.deepEqual(back, { r: 200, g: 50, b: 120 });
});

test('מתאם Hue: צימוד, רשימה עם חדרים, שליחה', async () => {
  const dir = tmp();
  const calls = [];
  const lightsDb = { 1: { name: 'תקרה', state: { on: true, bri: 254, reachable: true } }, 2: { name: 'פס', state: { on: false, bri: 100, hue: 0, sat: 254, reachable: true } }, 3: { name: 'מתג', state: { on: true } } };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); calls.push({ u, init });
    const j = (b, status = 200) => new Response(JSON.stringify(b), { status });
    if (u.endsWith('/api') && init.method === 'POST') return j([{ success: { username: 'USER1' } }]);
    if (u.includes('/USER1/lights/2/state')) { const b = JSON.parse(init.body); Object.assign(lightsDb[2].state, b); return j([{ success: {} }]); }
    if (u.endsWith('/USER1/lights/2')) return j(lightsDb[2]);
    if (u.endsWith('/USER1/lights')) return j(lightsDb);
    if (u.endsWith('/USER1/groups')) return j({ 1: { name: 'סלון', type: 'Room', lights: ['1', '2'] }, 2: { name: 'הכל', type: 'LightGroup', lights: ['1', '2', '3'] } });
    if (u.includes('/BAD/')) return j([{ error: { type: 1, description: 'unauthorized user' } }]);
    return j({}, 404);
  };
  const hue = createHueAdapter({ bridgeIp: '10.0.0.2', userFile: path.join(dir, 'hue.txt'), fetchImpl });
  await assert.rejects(hue.list(), /לא מצומד/);
  await hue.pair();
  assert.equal(fs.readFileSync(path.join(dir, 'hue.txt'), 'utf8'), 'USER1');
  const list = await hue.list();
  assert.equal(list.length, 3);
  assert.equal(list[0].room, 'סלון'); assert.equal(list[0].brightness, 100);
  assert.equal(list[2].room, ''); assert.deepEqual(list[2].capabilities, { brightness: false, color: false });
  assert.equal(list[1].capabilities.color, true); assert.deepEqual(list[1].color, { r: 255, g: 0, b: 0 });
  const l = await hue.set('hue:2', { on: true, brightness: 50, color: '#0000ff' });
  const body = JSON.parse(calls.find((c) => c.u.includes('/lights/2/state')).init.body);
  assert.equal(body.on, true); assert.equal(body.bri, 127); assert.equal(body.hue, 43690); assert.equal(body.sat, 254);
  assert.equal(l.on, true); assert.equal(l.brightness, 50);
  const bad = createHueAdapter({ bridgeIp: '10.0.0.2', username: 'BAD', fetchImpl });
  await assert.rejects(bad.list(), /לחץ על הכפתור/);
});

test('מתאם Shelly: דור 1 ודור 2, חדרים מההגדרות', async () => {
  const devices = parseShellyDevices('10.0.0.80|סלון, 10.0.0.81|מטבח:אי');
  assert.deepEqual(devices[1], { ip: '10.0.0.81', room: 'מטבח', name: 'אי' });
  const hits = []; const relayState = {};
  const fetchImpl = async (url) => {
    const u = String(url); hits.push(u);
    const j = (b) => new Response(JSON.stringify(b), { status: 200 });
    if (u.startsWith('http://10.0.0.80')) { // gen 2 dimmer
      if (u.endsWith('/shelly')) return j({ gen: 2, id: 'shellyplus' });
      if (u.includes('Shelly.GetConfig')) return j({ sys: { device: { name: 'דימר סלון' } }, 'light:0': { name: null } });
      if (u.includes('Light.GetStatus')) return j({ output: true, brightness: 70 });
      if (u.includes('Light.Set')) return j({});
    }
    if (u.startsWith('http://10.0.0.81')) { // gen 1 relay 2ch
      if (u.endsWith('/shelly')) return j({ type: 'SHSW-25' });
      if (u.endsWith('/settings')) return j({ name: 'מטבח', relays: [{ name: 'אי' }, { name: 'שיש' }] });
      const m = /\/relay\/(\d)(\?turn=(on|off))?$/.exec(u);
      if (m) { if (m[3]) relayState[m[1]] = m[3] === 'on'; return j({ ison: Boolean(relayState[m[1]]) }); }
    }
    return new Response('', { status: 404 });
  };
  const sh = createShellyAdapter({ devices, fetchImpl });
  const list = await sh.list();
  assert.equal(list.length, 3);
  const dimmer = list.find((l) => l.id === 'shelly:10.0.0.80:light:0');
  assert.equal(dimmer.name, 'דימר סלון'); assert.equal(dimmer.brightness, 70); assert.equal(dimmer.room, 'סלון');
  const r1 = list.find((l) => l.id === 'shelly:10.0.0.81:relay:1');
  assert.equal(r1.name, 'שיש'); assert.equal(r1.capabilities.brightness, false); assert.equal(r1.on, false);
  await sh.set('shelly:10.0.0.80:light:0', { brightness: 30 });
  assert.ok(hits.some((h) => h.includes('/rpc/Light.Set?id=0&on=true&brightness=30')));
  const r = await sh.set('shelly:10.0.0.81:relay:0', { on: true });
  assert.ok(hits.some((h) => h.endsWith('/relay/0?turn=on'))); assert.equal(r.on, true);
  // מכשיר שלא עונה → מופיע כלא זמין, לא מפיל את הרשימה
  const dead = createShellyAdapter({ devices: parseShellyDevices('10.0.0.99|חוץ'), fetchImpl: async () => { throw new Error('timeout'); } });
  const dl = await dead.list();
  assert.equal(dl[0].reachable, false);
});

test('מתאם Home Assistant: סינון דומיינים, שירותים, שגיאת טוקן', async () => {
  const calls = [];
  const states = [
    { entity_id: 'light.salon', state: 'on', attributes: { friendly_name: 'סלון תקרה', brightness: 128, supported_color_modes: ['brightness'] } },
    { entity_id: 'light.rgb', state: 'off', attributes: { friendly_name: 'פס לד', supported_color_modes: ['hs', 'color_temp'], rgb_color: [10, 20, 30] } },
    { entity_id: 'switch.boiler', state: 'on', attributes: { friendly_name: 'דוד' } },
    { entity_id: 'sensor.temp', state: '22', attributes: {} },
  ];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url); calls.push({ u, init });
    if (init.headers.authorization !== 'Bearer T') return new Response('', { status: 401 });
    const j = (b) => new Response(JSON.stringify(b), { status: 200 });
    if (u.endsWith('/api/states')) return j(states);
    if (u.includes('/api/states/')) return j(states.find((s) => u.endsWith(s.entity_id)));
    if (u.includes('/api/services/')) return j([]);
    return new Response('', { status: 404 });
  };
  const ha = createHomeAssistantAdapter({ url: 'http://ha:8123/', token: 'T', fetchImpl });
  let list = await ha.list();
  assert.deepEqual(list.map((l) => l.id), ['ha:light.salon', 'ha:light.rgb']);
  assert.equal(list[0].brightness, 50); assert.equal(list[0].room, 'סלון');
  assert.equal(list[1].capabilities.color, true); assert.deepEqual(list[1].color, { r: 10, g: 20, b: 30 });
  const both = createHomeAssistantAdapter({ url: 'http://ha:8123', token: 'T', domains: ['light', 'switch'], entities: ['switch.boiler'], fetchImpl });
  list = await both.list();
  assert.deepEqual(list.map((l) => l.id), ['ha:switch.boiler']);
  await ha.set('ha:light.rgb', { brightness: 80, color: '#ff00ff' });
  const on = calls.find((c) => c.u.endsWith('/api/services/light/turn_on'));
  assert.deepEqual(JSON.parse(on.init.body), { entity_id: 'light.rgb', brightness_pct: 80, rgb_color: [255, 0, 255] });
  await ha.set('ha:light.rgb', { on: false });
  assert.ok(calls.some((c) => c.u.endsWith('/api/services/light/turn_off')));
  const bad = createHomeAssistantAdapter({ url: 'http://ha:8123', token: 'WRONG', fetchImpl });
  await assert.rejects(bad.list(), /טוקן/);
  assert.throws(() => createHomeAssistantAdapter({}), /HA_URL/);
});

test('שילוב כמה מתאמים: מזהים עם קידומת, שגיאה של אחד לא מפילה את השני', async () => {
  const a = createMockAdapter();
  const broken = { name: 'x', label: 'שבור', async list() { throw new Error('אין קשר'); }, async set() {} };
  const combo = combineAdapters([a, broken]);
  const list = await combo.list();
  assert.equal(list.length, 7);
  const l = await combo.set('mock:1', { on: false });
  assert.equal(l.on, false);
  await assert.rejects(combo.set('zzz:1', { on: true }), /אור לא מוכר/);
  const allBroken = combineAdapters([broken, { ...broken, name: 'y' }]);
  await assert.rejects(allBroken.list(), /אין קשר/);
});
