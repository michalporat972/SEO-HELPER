import { createMockAdapter } from './mock.js';
import { createSensiboAdapter } from './sensibo.js';
import { createBroadlinkAdapter } from './broadlink.js';
import { createHttpAdapter } from './http.js';

/** בוחר מתאם לפי config.ac.adapter */
export function createAcAdapter(cfg) {
  switch ((cfg.adapter || 'mock').toLowerCase()) {
    case 'sensibo': return createSensiboAdapter({ apiKey: cfg.sensibo.apiKey, deviceId: cfg.sensibo.deviceId });
    case 'broadlink': return createBroadlinkAdapter({ ip: cfg.broadlink.ip, mac: cfg.broadlink.mac, codesFile: cfg.broadlink.codesFile, stateFile: cfg.stateFile });
    case 'http': return createHttpAdapter({ urlTemplate: cfg.http.url, method: cfg.http.method, stateFile: cfg.stateFile });
    case 'mock': return createMockAdapter();
    default: throw new Error(`AC_ADAPTER לא מוכר: ${cfg.adapter}`);
  }
}
