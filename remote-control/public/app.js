/* שלט ביתי: לוגיקת צד לקוח. מדבר עם ה-API של השרת המקומי ב-/api. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let meta = { modes: [], fanLevels: [], apps: [], tempMin: 16, tempMax: 30 };
let acState = null;
let acCaps = {};
let pendingAc = null; // מצב "אופטימי" בזמן שליחה

// ---------- כלים ----------
const haptic = () => { try { navigator.vibrate?.(8); } catch {} };
let toastTimer;
function toast(msg, ok = false) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false; t.classList.toggle('ok', ok);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ok ? 1800 : 3500);
}
async function api(path, body, method) {
  const res = await fetch(path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || `שגיאה ${res.status}`);
  return json;
}
const safe = (fn) => async (...a) => { try { haptic(); await fn(...a); } catch (e) { toast(e.message); } };

// ---------- טאבים ----------
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('active', x === b));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${b.dataset.tab}`));
  localStorage.setItem('tab', b.dataset.tab);
}));
if (localStorage.getItem('tab') === 'ac') $('.tab[data-tab="ac"]').click();

// ---------- טלוויזיה ----------
const TV_STATUS = { connected: ['מחובר', 'chip-on'], connecting: ['מתחבר…', 'chip-wait'], pairing: ['אשר בטלוויזיה', 'chip-wait'], disconnected: ['מנותק', 'chip-off'] };
function renderTv(tv) {
  const [txt, cls] = TV_STATUS[tv.status] || TV_STATUS.disconnected;
  const el = $('#tv-status'); el.textContent = txt; el.className = `chip ${cls}`;
  $('#tv-connect').textContent = tv.paired ? (tv.status === 'connected' ? 'מחובר ✓' : 'התחבר') : 'צמד עם הטלוויזיה';
}
$('#tv-connect').addEventListener('click', safe(async () => {
  toast('מתחבר… אם זו הפעם הראשונה, אשר על מסך הטלוויזיה', true);
  await api('/api/tv/connect', {});
  toast('מחובר לטלוויזיה', true);
  refresh(); loadApps();
}));
$$('[data-btn]').forEach((b) => b.addEventListener('click', safe(() => api('/api/tv/button', { name: b.dataset.btn }))));
$('[data-tv="power"]').addEventListener('click', safe(async () => {
  const r = await api('/api/tv/power', {});
  toast(r.sent ? 'נשלחה פקודת הדלקה (Wake-on-LAN)' : 'הטלוויזיה כובתה', true);
  setTimeout(refresh, 1500);
}));
$$('[data-vol]').forEach((b) => b.addEventListener('click', safe(async () => {
  const v = b.dataset.vol;
  const r = await api('/api/tv/volume', v === 'mute' ? { mute: !muted } : { delta: Number(v) });
  if (typeof r.volume === 'number') $('#tv-vol').textContent = r.muted ? '🔇' : r.volume;
  if (typeof r.muted === 'boolean') muted = r.muted;
})));
let muted = false;
$$('[data-ch]').forEach((b) => b.addEventListener('click', safe(() => api('/api/tv/channel', { delta: Number(b.dataset.ch) }))));
$$('[data-media]').forEach((b) => b.addEventListener('click', safe(() => api('/api/tv/media', { action: b.dataset.media }))));

$('#tv-text').addEventListener('submit', safe(async (e) => {
  e.preventDefault();
  const input = $('input', e.target);
  await api('/api/tv/text', { text: input.value, enter: true });
  input.value = '';
}));
$('#tv-text-del').addEventListener('click', safe(() => api('/api/tv/text', { deleteCount: 1 })));

// אפליקציות: מתחילים עם רשימה ידועה, וכשמחוברים מחליפים ברשימה האמיתית מהטלוויזיה
function renderApps(list) {
  const wrap = $('#apps'); wrap.innerHTML = '';
  for (const a of list.slice(0, 12)) {
    const b = document.createElement('button'); b.className = 'app';
    b.innerHTML = a.icon ? `<img src="${a.icon}" alt=""><span>${a.name}</span>` : `<span class="glyph">${a.name.slice(0, 1)}</span><span>${a.name}</span>`;
    b.addEventListener('click', safe(() => api('/api/tv/app', { id: a.id })));
    wrap.appendChild(b);
  }
}
async function loadApps() {
  try {
    const apps = await api('/api/tv/apps');
    const fav = new Set(meta.apps.map((a) => a.id));
    apps.sort((x, y) => Number(fav.has(y.id)) - Number(fav.has(x.id)));
    if (apps.length) renderApps(apps);
  } catch { /* הטלוויזיה כבויה: נשארים עם הרשימה הידועה */ }
}

// גיליון כניסות
function openSheet(title, items, onPick) {
  $('#sheet-title').textContent = title;
  const list = $('#sheet-list'); list.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button'); b.className = 'key';
    b.innerHTML = `<span class="dot ${it.connected ? 'on' : ''}"></span>${it.label}`;
    b.addEventListener('click', safe(async () => { await onPick(it); $('#sheet').hidden = true; }));
    list.appendChild(b);
  }
  $('#sheet').hidden = false;
}
$('#sheet-close').addEventListener('click', () => { $('#sheet').hidden = true; });
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') $('#sheet').hidden = true; });
$('[data-sheet="inputs"]').addEventListener('click', safe(async () => {
  const inputs = await api('/api/tv/inputs');
  openSheet('כניסות', inputs, (it) => api('/api/tv/input', { id: it.id }));
}));

// משטח מגע → pointer socket
(() => {
  const pad = $('#touchpad');
  let last = null, moved = false, startT = 0, queue = { dx: 0, dy: 0 }, timer = null;
  const flush = () => { if (queue.dx || queue.dy) { api('/api/tv/pointer', { action: 'move', dx: queue.dx, dy: queue.dy }).catch(() => {}); queue = { dx: 0, dy: 0 }; } timer = null; };
  pad.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; moved = false; startT = Date.now(); pad.setPointerCapture(e.pointerId); });
  pad.addEventListener('pointermove', (e) => {
    if (!last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
    if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
    queue.dx += dx * 1.6; queue.dy += dy * 1.6;
    if (!timer) timer = setTimeout(flush, 40);
  });
  pad.addEventListener('pointerup', () => {
    if (last && !moved && Date.now() - startT < 300) api('/api/tv/pointer', { action: 'click' }).catch((e) => toast(e.message));
    last = null;
  });
  pad.addEventListener('wheel', (e) => { e.preventDefault(); api('/api/tv/pointer', { action: 'scroll', dx: 0, dy: -Math.sign(e.deltaY) }).catch(() => {}); }, { passive: false });
})();

// ---------- מזגן ----------
const MODE_HE = { cool: 'קירור', heat: 'חימום', fan: 'מאוורר', dry: 'ייבוש', auto: 'אוטומטי' };
const FAN_HE = { auto: 'אוטו', low: 'נמוך', medium: 'בינוני', high: 'גבוה' };
function renderAc(ac) {
  $('#ac-label').textContent = ac.label || 'מזגן';
  acCaps = ac.capabilities || {};
  $('#ac-learn').hidden = !acCaps.learn;
  if (ac.error && !ac.state) { $('#ac-state-line').textContent = ac.error; return; }
  acState = pendingAc || ac.state;
  const s = acState;
  $('#ac-power').classList.toggle('on', s.power);
  $('#ac-temp').textContent = s.targetTemperature;
  $$('#ac-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === s.mode));
  $$('#ac-fan button').forEach((b) => b.classList.toggle('active', b.dataset.fan === s.fanLevel));
  $('#ac-swing').classList.toggle('active', s.swing === 'rangeFull');
  $('#ac-state-line').textContent = s.power ? `${MODE_HE[s.mode] || s.mode} · מאוורר ${FAN_HE[s.fanLevel] || s.fanLevel}` : 'כבוי';
  const bits = [];
  if (typeof s.roomTemperature === 'number') bits.push(`בחדר ${s.roomTemperature.toFixed(1)}°`);
  if (typeof s.humidity === 'number') bits.push(`לחות ${Math.round(s.humidity)}%`);
  if (s.room) bits.push(s.room);
  $('#ac-room').textContent = bits.join(' · ');
  if (acCaps.learn) {
    const wrap = $('#ac-codes'); wrap.innerHTML = '';
    for (const k of s.learnedKeys || []) {
      const el = document.createElement('span'); el.className = 'code';
      el.innerHTML = `${k} <button title="מחק">✕</button>`;
      $('button', el).addEventListener('click', safe(async () => { await api(`/api/ac/codes/${encodeURIComponent(k)}`, undefined, 'DELETE'); refresh(); }));
      wrap.appendChild(el);
    }
    if (!(s.learnedKeys || []).length) wrap.innerHTML = '<span class="muted small">עדיין לא נלמדו קודים</span>';
  }
}
async function setAc(patch) {
  pendingAc = { ...acState, ...patch };
  renderAc({ state: pendingAc, capabilities: acCaps, label: $('#ac-label').textContent });
  try {
    const s = await api('/api/ac/state', patch);
    pendingAc = null; acState = s;
    renderAc({ state: s, capabilities: acCaps, label: $('#ac-label').textContent });
  } catch (e) { pendingAc = null; refresh(); throw e; }
}
$('#ac-power').addEventListener('click', safe(() => setAc({ power: !acState?.power })));
$$('[data-temp]').forEach((b) => b.addEventListener('click', safe(() => {
  const t = Math.min(meta.tempMax, Math.max(meta.tempMin, (acState?.targetTemperature ?? 24) + Number(b.dataset.temp)));
  return setAc({ targetTemperature: t, power: true });
})));
$$('#ac-mode button').forEach((b) => b.addEventListener('click', safe(() => setAc({ mode: b.dataset.mode, power: true }))));
$$('#ac-fan button').forEach((b) => b.addEventListener('click', safe(() => setAc({ fanLevel: b.dataset.fan, power: true }))));
$('#ac-swing').addEventListener('click', safe(() => setAc({ swing: acState?.swing === 'rangeFull' ? 'stopped' : 'rangeFull' })));
$('[data-preset="sleep"]').addEventListener('click', safe(() => setAc({ power: true, mode: 'cool', targetTemperature: 25, fanLevel: 'low' })));

// למידת קודי IR
const learn = (key) => safe(async () => {
  toast(`מצב למידה: כוון את השלט המקורי אל ה-Broadlink ולחץ (${key})`, true);
  const r = await api('/api/ac/learn', { key });
  toast(`נשמר קוד "${r.key}"`, true); refresh();
});
$('#ac-learn-current').addEventListener('click', () => {
  const s = acState || {}; learn(`${s.mode}_${s.targetTemperature}_${s.fanLevel}`)();
});
$('#ac-learn-off').addEventListener('click', learn('off'));

// ---------- רענון ----------
let appsLoaded = false;
async function refresh() {
  try {
    const st = await api('/api/status');
    meta = st.meta;
    renderTv(st.tv);
    renderAc(st.ac);
    if (!appsLoaded) { appsLoaded = true; renderApps(meta.apps); }
    if (st.tv.status === 'connected' && !refresh.gotApps) { refresh.gotApps = true; loadApps(); }
  } catch (e) { toast(`אין קשר לשרת: ${e.message}`); }
}
refresh();
setInterval(refresh, 6000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
