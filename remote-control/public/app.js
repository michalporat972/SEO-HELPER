/* שלט ביתי: לוגיקת צד לקוח. מדבר עם ה-API של השרת המקומי ב-/api. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

let meta = { apps: [] };

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
if (localStorage.getItem('tab') === 'lights') $('.tab[data-tab="lights"]').click();

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

// ---------- אורות ----------
const COLOR_PRESETS = ['#ffd966', '#ffb366', '#ff6b6b', '#ff7ad9', '#8f7bff', '#5aa9ff', '#5ef0c8', '#ffffff'];
const ROOM_ICON = { 'סלון': '🛋️', 'מטבח': '🍳', 'חדר שינה': '🛏️', 'מסדרון': '🚪', 'אמבטיה': '🛁', 'חדר ילדים': '🧸', 'משרד': '💻', 'מרפסת': '🌿' };
const dragging = new Set(); // אורות שהמשתמש גורר כרגע את הבהירות שלהם, לא לדרוס מהפולינג
let lightEls = new Map();

function lightGlow(l) {
  if (l.color) return `rgb(${l.color.r},${l.color.g},${l.color.b})`;
  return '#ffd966';
}

function renderLight(l) {
  let el = lightEls.get(l.id);
  if (!el) {
    el = document.createElement('div'); el.className = 'light'; el.dataset.id = l.id;
    el.innerHTML = `<div class="icon">💡</div><div class="name"><span></span><small></small></div><button class="toggle" aria-label="הדלקה/כיבוי"></button>
      <input class="slider" type="range" min="1" max="100" step="1" dir="rtl"><div class="colors"></div>`;
    const toggle = $('.toggle', el);
    toggle.addEventListener('click', safe(() => setLight(l.id, { on: !toggle.classList.contains('on') })));
    const slider = $('.slider', el);
    let t;
    const send = () => { clearTimeout(t); t = setTimeout(safe(() => setLight(l.id, { brightness: Number(slider.value) })), 120); };
    slider.addEventListener('pointerdown', () => dragging.add(l.id));
    slider.addEventListener('input', () => { slider.style.setProperty('--pct', `${slider.value}%`); send(); });
    slider.addEventListener('change', () => { dragging.delete(l.id); send(); });
    slider.addEventListener('pointerup', () => dragging.delete(l.id));
    const colors = $('.colors', el);
    for (const hex of COLOR_PRESETS) {
      const b = document.createElement('button'); b.style.background = hex; b.dataset.hex = hex; b.title = hex;
      b.addEventListener('click', safe(() => setLight(l.id, { color: hex })));
      colors.appendChild(b);
    }
    lightEls.set(l.id, el);
  }
  el.classList.toggle('on', l.on);
  el.classList.toggle('unreachable', l.reachable === false);
  el.style.setProperty('--glow', lightGlow(l));
  $('.name span', el).textContent = l.name;
  $('.name small', el).textContent = l.reachable === false ? (l.error || 'לא זמין') : (l.on && l.brightness != null ? `${l.brightness}%` : (l.on ? 'דולק' : 'כבוי'));
  $('.toggle', el).classList.toggle('on', l.on);
  const slider = $('.slider', el);
  slider.hidden = !l.capabilities?.brightness;
  if (!dragging.has(l.id) && l.brightness != null) { slider.value = l.brightness; slider.style.setProperty('--pct', `${l.brightness}%`); }
  const colors = $('.colors', el);
  colors.hidden = !l.capabilities?.color;
  if (l.color) {
    const cur = `#${[l.color.r, l.color.g, l.color.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    $$('button', colors).forEach((b) => b.classList.toggle('active', b.dataset.hex === cur));
  }
  return el;
}

function renderLights(st) {
  $('#lights-label').textContent = st.label || 'אורות';
  $('#lights-pair').hidden = !st.canPair;
  const err = $('#lights-error'); err.hidden = !st.error; err.textContent = st.error || '';
  const wrap = $('#rooms');
  const seen = new Set();
  st.rooms.forEach((room, idx) => {
    let el = $(`.room[data-room="${CSS.escape(room.name)}"]`, wrap);
    if (!el) {
      el = document.createElement('section'); el.className = 'room'; el.dataset.room = room.name;
      el.innerHTML = `<div class="room-head"><h2>${ROOM_ICON[room.name] || '🏠'} ${room.name} <span class="muted"></span></h2>
        <div class="room-actions"><button data-on="true">הדלק</button><button data-on="false">כבה</button></div></div><div class="room-lights"></div>`;
      $$('.room-actions button', el).forEach((b) => b.addEventListener('click', safe(async () => {
        await api(`/api/lights/room/${encodeURIComponent(room.name)}`, { on: b.dataset.on === 'true' }); refresh();
      })));
    }
    const onCount = room.lights.filter((l) => l.on).length;
    $('.room-head .muted', el).textContent = onCount ? `${onCount}/${room.lights.length} דולקים` : '';
    const list = $('.room-lights', el);
    for (const l of room.lights) { seen.add(l.id); list.appendChild(renderLight(l)); }
    wrap.appendChild(el);
    if (wrap.children[idx] !== el) wrap.insertBefore(el, wrap.children[idx]);
  });
  // מחיקת חדרים/אורות שנעלמו
  $$('.room', wrap).forEach((el) => { if (!st.rooms.some((r) => r.name === el.dataset.room)) el.remove(); });
  for (const [id, el] of lightEls) if (!seen.has(id)) { el.remove(); lightEls.delete(id); }
  if (!st.rooms.length && !st.error) wrap.innerHTML = '<p class="muted">לא נמצאו אורות. בדוק את ההגדרות ב-.env</p>';
}

async function setLight(id, patch) {
  const l = await api(`/api/lights/${encodeURIComponent(id)}`, patch);
  renderLight(l);
}
$$('[data-all]').forEach((b) => b.addEventListener('click', safe(async () => {
  const r = await api('/api/lights/all', { on: b.dataset.all === 'true' });
  if (r.failed?.length) toast(`${r.failed.length} אורות לא הגיבו`); else toast(b.dataset.all === 'true' ? 'כל האורות דולקים' : 'כל האורות כבויים', true);
  refresh();
})));
$('#lights-pair').addEventListener('click', safe(async () => {
  toast('לחץ על הכפתור הפיזי בגשר ואז המתן…', true);
  const r = await api('/api/lights/pair', {});
  const errs = Object.values(r).filter((x) => x?.error).map((x) => x.error);
  if (errs.length) throw new Error(errs.join(' | '));
  toast('הצימוד הצליח', true); refresh();
}));

// ---------- רענון ----------
let appsLoaded = false;
async function refresh() {
  try {
    const st = await api('/api/status');
    meta = st.meta;
    renderTv(st.tv);
    renderLights(st.lights);
    if (!appsLoaded) { appsLoaded = true; renderApps(meta.apps); }
    if (st.tv.status === 'connected' && !refresh.gotApps) { refresh.gotApps = true; loadApps(); }
  } catch (e) { toast(`אין קשר לשרת: ${e.message}`); }
}
refresh();
setInterval(refresh, 6000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
