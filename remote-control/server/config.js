import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export const config = {
  root,
  dataDir,
  port: Number(process.env.PORT || 8484),
  tv: {
    ip: process.env.LG_TV_IP || '',
    mac: process.env.LG_TV_MAC || '',
    keyFile: path.join(dataDir, 'lg-client-key.txt'),
  },
  lights: {
    adapters: process.env.LIGHTS_ADAPTERS || 'mock',
    hue: { bridgeIp: process.env.HUE_BRIDGE_IP || '', username: process.env.HUE_USERNAME || '', userFile: path.join(dataDir, 'hue-username.txt') },
    shelly: { devices: process.env.SHELLY_DEVICES || '' },
    ha: { url: process.env.HA_URL || '', token: process.env.HA_TOKEN || '', domains: list(process.env.HA_DOMAINS || 'light'), entities: list(process.env.HA_ENTITIES) },
  },
};
