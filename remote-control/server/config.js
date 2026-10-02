import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');

export const config = {
  root,
  dataDir,
  port: Number(process.env.PORT || 8484),
  tv: {
    ip: process.env.LG_TV_IP || '',
    mac: process.env.LG_TV_MAC || '',
    keyFile: path.join(dataDir, 'lg-client-key.txt'),
  },
  ac: {
    adapter: process.env.AC_ADAPTER || 'mock',
    stateFile: path.join(dataDir, 'ac-state.json'),
    sensibo: { apiKey: process.env.SENSIBO_API_KEY || '', deviceId: process.env.SENSIBO_DEVICE_ID || '' },
    broadlink: { ip: process.env.BROADLINK_IP || '', mac: process.env.BROADLINK_MAC || '', codesFile: path.join(dataDir, 'ac-ir-codes.json') },
    http: { url: process.env.AC_HTTP_URL || '', method: (process.env.AC_HTTP_METHOD || 'GET').toUpperCase() },
  },
};
