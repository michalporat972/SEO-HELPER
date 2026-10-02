/**
 * מתאם Sensibo (ענן). הכי פשוט להתקנה: מפתח API ותו לא.
 * תיעוד: https://sensibo.github.io/
 */
import { normalizePatch } from './base.js';

const BASE = 'https://home.sensibo.com/api/v2';

export function createSensiboAdapter({ apiKey, deviceId, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('SENSIBO_API_KEY חסר');
  let podId = deviceId || null;
  let podName = '';

  async function api(path, { method = 'GET', body } = {}) {
    const url = new URL(BASE + path);
    url.searchParams.set('apiKey', apiKey);
    const res = await fetchImpl(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status !== 'success') {
      throw new Error(`Sensibo ${method} ${path} נכשל: ${json.reason || json.message || res.status}`);
    }
    return json.result;
  }

  async function ensurePod() {
    if (podId) return podId;
    const pods = await api('/users/me/pods?fields=id,room');
    if (!pods?.length) throw new Error('לא נמצאו מכשירי Sensibo בחשבון');
    podId = pods[0].id;
    podName = pods[0].room?.name || '';
    return podId;
  }

  const toState = (acState = {}, measurements = {}) => ({
    power: Boolean(acState.on),
    mode: acState.mode || 'cool',
    targetTemperature: acState.targetTemperature ?? 24,
    fanLevel: acState.fanLevel || 'auto',
    swing: acState.swing || 'stopped',
    roomTemperature: measurements.temperature,
    humidity: measurements.humidity,
    room: podName,
  });

  return {
    name: 'sensibo',
    label: 'Sensibo',
    capabilities: { learn: false, roomTemperature: true },
    async getState() {
      const id = await ensurePod();
      const pod = await api(`/pods/${id}?fields=acState,measurements,room`);
      podName = pod.room?.name || podName;
      return toState(pod.acState, pod.measurements);
    },
    async setState(patch) {
      const p = normalizePatch(patch);
      const id = await ensurePod();
      const current = await api(`/pods/${id}?fields=acState`);
      const acState = { ...current.acState };
      if ('power' in p) acState.on = p.power;
      if ('mode' in p) acState.mode = p.mode;
      if ('targetTemperature' in p) acState.targetTemperature = p.targetTemperature;
      if ('fanLevel' in p) acState.fanLevel = p.fanLevel;
      if ('swing' in p) acState.swing = p.swing;
      await api(`/pods/${id}/acStates`, { method: 'POST', body: { acState } });
      return this.getState();
    },
  };
}
