import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { WebOSClient } from './lg/webos.js';
import { createAcAdapter } from './ac/index.js';
import { createApp } from './app.js';

const tv = new WebOSClient({ ip: config.tv.ip, mac: config.tv.mac, keyFile: config.tv.keyFile });
tv.on('status', (s) => console.log(`[TV] ${s}`));
tv.on('prompt', () => console.log('[TV] 👉 אשר את הצימוד על מסך הטלוויזיה (עד 60 שניות)'));
tv.on('error', (e) => console.error('[TV]', e.message));

let ac;
try {
  ac = createAcAdapter(config.ac);
} catch (err) {
  console.error(`[AC] ${err.message}. עובר למתאם mock.`);
  ac = createAcAdapter({ ...config.ac, adapter: 'mock' });
}

const app = createApp({ tv, ac, publicDir: path.join(config.root, 'public'), tvInfo: config.tv });

app.listen(config.port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('🎛️  שלט ביתי פעיל');
  console.log(`   טלוויזיה: ${config.tv.ip || 'לא מוגדר (LG_TV_IP)'}   מזגן: ${ac.label}`);
  console.log('   פתח מהטלפון:');
  for (const ip of ips) console.log(`   http://${ip}:${config.port}`);
  if (!ips.length) console.log(`   http://localhost:${config.port}`);
});
