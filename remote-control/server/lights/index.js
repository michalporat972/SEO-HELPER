import { createMockAdapter } from './mock.js';
import { createHueAdapter } from './hue.js';
import { createShellyAdapter, parseShellyDevices } from './shelly.js';
import { createHomeAssistantAdapter } from './homeassistant.js';
import { combineAdapters } from './base.js';

/** LIGHTS_ADAPTERS יכול להכיל כמה מתאמים מופרדים בפסיק, למשל "hue,shelly". */
export function createLightsAdapter(cfg) {
  const names = String(cfg.adapters || 'mock').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const adapters = names.map((n) => {
    switch (n) {
      case 'hue': return createHueAdapter({ bridgeIp: cfg.hue.bridgeIp, username: cfg.hue.username, userFile: cfg.hue.userFile });
      case 'shelly': return createShellyAdapter({ devices: parseShellyDevices(cfg.shelly.devices) });
      case 'ha': case 'homeassistant': return createHomeAssistantAdapter({ url: cfg.ha.url, token: cfg.ha.token, domains: cfg.ha.domains, entities: cfg.ha.entities });
      case 'mock': return createMockAdapter();
      default: throw new Error(`מתאם אורות לא מוכר: ${n}`);
    }
  });
  return combineAdapters(adapters);
}
