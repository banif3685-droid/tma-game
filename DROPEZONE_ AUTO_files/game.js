// ===== DROPZONE: AUTO — логика игры =====
'use strict';

const tg = window.Telegram && window.Telegram.WebApp;
const inTelegram = true;
if (tg) {
  tg.ready();
  tg.expand();
}

// тёмная/светлая схема: из Telegram, иначе из системы
function applyScheme() {
  const dark = inTelegram ? tg.colorScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.scheme = dark ? 'dark' : 'light';
  if (inTelegram) {
    const bg = dark ? '#000000' : '#f2f2f7';
    try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); tg.setBottomBarColor?.(bg); } catch {}
  }
}
applyScheme();
tg?.onEvent?.('themeChanged', applyScheme);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyScheme);

const haptic = {
  tap()  { tg?.HapticFeedback?.impactOccurred('light'); },
  soft() { tg?.HapticFeedback?.impactOccurred('soft'); },
  heavy() { tg?.HapticFeedback?.impactOccurred('heavy'); },
  tick() { tg?.HapticFeedback?.selectionChanged(); },
  ok()   { tg?.HapticFeedback?.notificationOccurred('success'); },
  err()  { tg?.HapticFeedback?.notificationOccurred('error'); },
};

const { CAR_BY_ID, CASE_BY_ID, SLOT_BY_ID, tierIdx, carClass } = Rules;
const $ = sel => document.querySelector(sel);

// ---------- эмодзи как на iPhone ----------
// На iPhone/Mac — родные эмодзи системы, на остальных — картинки Apple-эмодзи.
const IS_APPLE = ['ios', 'macos'].includes(tg?.platform) || /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const EMOJI_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';

function emo(ch, size = 20) {
  if (IS_APPLE) return `<span class="emo" style="font-size:${size}px">${ch}</span>`;
  const code = [...ch].map(c => c.codePointAt(0).toString(16)).join('-');
  return `<img class="emo" src="${EMOJI_CDN}${code}.png" width="${size}" height="${size}" alt="${ch}" draggable="false">`;
}

// ---------- состояние игрока и связь с сервером ----------
// 'server' — всё решает сервер (в Telegram, когда задан API_URL);
// 'local'  — правила выполняются прямо в браузере, прогресс в localStorage (тесты на компьютере).
// для проверки с локальным сервером: http://localhost:5173/?api=http://localhost:8787
const DEV_API = new URLSearchParams(location.search).get('api');
const API = 'http://localhost:8000';
const tgUser = () => ({ id: 8252703031, first_name: "Serik", username: "Serik" });
// админ: в Telegram — ADMIN_IDS; в браузере (тестовый режим) — всегда
const isAdmin = () => true;
const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

// Админка в игре — только в браузерной тестовой версии (7 нажатий на заголовок или ссылка внизу Меню).
// В Telegram админки в игре нет: всё через админ-бота (admin.html).
const gameAdmin = () => true;
function openLocalAdmin() {
  if (!gameAdmin()) return;
  const open = () => { admTarget = null; showAdmin(); };
  if (typeof showAdmin === 'function') return open();
  const s = document.createElement('script');
  s.src = 'js/admin.js?v=' + APP_VERSION;
  s.onload = open;
  document.body.appendChild(s);
}
(() => {
  let taps = [];
  document.getElementById('title').addEventListener('click', () => {
    const t = Date.now();
    taps = taps.filter(x => t - x < 3000);
    taps.push(t);
    if (taps.length >= 7) {
      taps = [];
      if (gameAdmin()) { haptic.heavy(); openLocalAdmin(); }
    }
  });
})();
const MODE = DEV_API || (API_URL && inTelegram) ? 'server' : 'local';
// (основной сайт: новинки обновления не включаются)   // тестовая версия: релизное обновление включено (Rules.nextActive)
// проверка релиза с локальным сервером: ?api=http://127.0.0.1:8787&next (сервер — npm run dev с --var NEXT:1)
// (основной сайт)
// заголовки авторизации: подпись Telegram, а в режиме проверки — тестовый игрок
const authHeaders = () => DEV_API ? { 'X-Dev-User': String(ADMIN_IDS[0] || 1) } : { 'X-Init-Data': tg.initData };
const SAVE_KEY = 'dropzone_auto_v1';
const PREFS_KEY = 'dropzone_prefs_v1';

// настройки интерфейса — хранятся только на этом устройстве
const prefs = Object.assign({
  selCase: null, selPartCase: null, selPartSlot: null, fastOpen: false, partCount: 1, carCount: 1,
  autoSell: { on: false, tiers: [...RARITY_ORDER] }, raceCar: null,
}, (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } })());
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} };

let clockOffset = 0;                       // разница часов сервера и устройства
const now = () => Date.now() + clockOffset;

let state = Rules.newState();
const saveLocal = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {} };

// новые уровни ждут показа (поздравление — когда закончится анимация)
const levelUpQueue = [];
const noteLevelUps = r => {
  if (r?.levelUps) levelUpQueue.push(...r.levelUps);
  if (r?.marketSold && typeof noteMarketSold === 'function') setTimeout(() => noteMarketSold(r.marketSold), 600);   // боты купили мои лоты
  return r;
};

// выполнить действие игрока; возвращает результат или null (ошибка уже показана)
let lastApiAt = Date.now();   // когда игрок последний раз что-то делал (опрос подарков — только в простое)
async function api(name, params = {}) {
  lastApiAt = Date.now();
  if (MODE === 'local') {
    try {
      const ctx = {
        now: Date.now(), rnd: Math.random, local: true, admin: typeof isAdmin === 'function' && isAdmin(),
        uid: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      };
      const r = Rules.run(state, name, params, ctx);
      state = r.state;
      saveLocal();
      return noteLevelUps(r.result);
    } catch (e) {
      if (!(e instanceof Rules.GameError)) console.error(e);
      haptic.err();
      toast(e.message || 'Ошибка');
      return null;
    }
  }
  try {
    const res = await fetch(API + '/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name, params }),
    });
    const data = await res.json();
    if (data.now) clockOffset = data.now - Date.now();
    if (data.maintenance && !data.state) { showMaintenance(data.maintenance); return null; }
    if (data.subscribe && !data.state) { subscribeGate(data.subscribe).then(() => render()); return null; }
    if (data.state) state = Rules.migrate(data.state);
    if (data.error) { haptic.err(); toast(data.error); return null; }
    return noteLevelUps(data.result);
  } catch {
    haptic.err();
    toast('Нет связи с сервером');
    return null;
  }
}

// технические работы: вместо игры — заглушка (админы играют как обычно)
function showMaintenance(m) {
  closeSheet();
  document.body.classList.add('maintenance');
  $('#title').textContent = 'DROPEZONE';
  $('#screen').innerHTML = `<div class="card empty-state maint">${emo('🛠️', 56)}
    <h3>Технические работы</h3>
    <p class="muted">${String(m?.text || 'Скоро вернёмся — улучшаем игру').replace(/[<>&]/g, '')}</p>
    <button class="btn" onclick="location.reload()">Обновить</button></div>`;
}

// подписка на канал игры: без неё вход закрыт; промис выполнится, когда подписка подтвердится
function subscribeGate(sub) {
  closeSheet();
  document.body.classList.add('maintenance');
  $('#title').textContent = 'DROPEZONE';
  $('#screen').innerHTML = `<div class="card empty-state maint sub-gate">${emo('📢', 56)}
    <h3>Подпишись на канал игры</h3>
    <p class="muted">Новости, промокоды и ивенты — первым делом там. Подпишись, чтобы войти в игру 🔒</p>
    <p class="muted small">Откроется бот-проверка: подтверди, что ты не бот — и он добавит тебя в канал. Потом вернись сюда и нажми «Я подписался»</p>
    <button class="btn" id="sub-open">Подписаться</button>
    <button class="btn gray" id="sub-check">Я подписался</button></div>`;
  return new Promise(resolve => {
    $('#sub-open').onclick = () => {
      haptic.tap();
      if (tg?.openTelegramLink) tg.openTelegramLink(sub.url); else window.open(sub.url, '_blank');
    };
    $('#sub-check').onclick = async e => {
      const b = e.currentTarget;
      if (b.disabled) return;
      b.disabled = true; b.textContent = 'Проверяем…';
      const r = await loadState();
      b.disabled = false; b.textContent = 'Я подписался';
      if (r === true) {
        haptic.ok();
        document.body.classList.remove('maintenance');
        resolve();
      } else if (r?.subscribe) { haptic.err(); toast('Подписка не найдена — подпишись и нажми ещё раз'); }
      else if (r !== 'maintenance') toast('Нет связи с сервером');
    };
  });
}

// Telegram держит мини-приложение свёрнутым, не перезапуская его — проверяем подписку и техработы при возврате
let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (MODE !== 'server' || !hiddenAt || Date.now() - hiddenAt < 30e3) return;
  hiddenAt = 0;
  try {
    const res = await fetch(API + '/state', { headers: authHeaders() });
    const data = await res.json();
    if (data.maintenance && !data.state) showMaintenance(data.maintenance);
    else if (data.subscribe && !data.state) subscribeGate(data.subscribe).then(() => render());
  } catch {}
});

let refWelcome = null;   // новичок пришёл по приглашению — покажем подарок

// загрузка прогресса при запуске
// Тестовая версия (локальный режим) — только по ссылке с ?test (запоминается на устройстве) и на localhost.
// Внутри Telegram без подписи (старый Telegram Desktop, открыли обычной ссылкой) — не пускаем в тест, просим открыть через бота.
const tgShell = !!tg && !!tg.platform && tg.platform !== 'unknown';
const testAllowed = (() => {
  try {
    if (new URLSearchParams(location.search).has('test')) localStorage.setItem('dz_test', '1');
    return false;   // основной сайт: тест закрыт (tools/build_site.py)
  } catch { return false; }
})();
function showOpenInBot() {
  document.body.classList.add('maintenance');
  $('#title').textContent = 'DROPEZONE';
  $('#screen').innerHTML = `<div class="card empty-state maint">${emo('🏁', 56)}
    <h3>Открой игру в Telegram</h3>
    <p class="muted">${tgShell ? 'Telegram не передал данные входа. Обнови Telegram и открой игру кнопкой «Играть» в боте.' : 'Игра работает внутри Telegram.'}</p>
    <a class="btn" href="https://t.me/dropezone_bot/dropezone">Открыть @dropezone_bot</a></div>`;
}

async function loadState() {
  if (MODE === 'local' && !DEV_API && (tgShell || !testAllowed)) { showOpenInBot(); return 'maintenance'; }
  if (MODE === 'local') {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) state = Rules.migrate(JSON.parse(raw)); } catch {}
    return true;
  }
  try {
    const res = await fetch(API + '/state', { headers: authHeaders() });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    clockOffset = data.now - Date.now();
    if (data.maintenance && !data.state) { showMaintenance(data.maintenance); return 'maintenance'; }
    if (data.subscribe && !data.state) return { subscribe: data.subscribe };
    if (data.refFrom) refWelcome = data.refFrom;
    if (data.admin && typeof serverMaint !== 'undefined') serverMaint = data.maintenance;
    globalThis.contLive = data.cont || null;   // идущий контейнер (плашка, островок)
    if (data.ecases) globalThis.EVENT_CASES = data.ecases;   // временные кейсы (с сервера)
    state = Rules.migrate(data.state);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

// ---------- форматирование ----------
function money(n) {
  n = Math.floor(n);
  const fmt = (v, unit) => (Math.round(v * 10) / 10).toString().replace('.', ',') + ' ' + unit;
  if (n >= 999.95e6) return fmt(n / 1e9, 'млрд ₽');
  if (n >= 999.95e3) return fmt(n / 1e6, 'млн ₽');
  return n.toLocaleString('ru-RU').replace(/[\s,]/g, ' ') + ' ₽';
}
const pct = v => (v >= 1 ? v.toFixed(v % 1 ? 1 : 0) : v.toFixed(2).replace(/0$/, '')).replace('.', ',') + '%';

// ---------- расчёты (из общих правил) ----------
const carIncome = car => Rules.carIncome(car, state);
const { tuneBonus, carHp, partsValue, carValue, sellPrice, canInstall, partHpGain, partSell } = Rules;
const incomePerHour = () => Rules.incomePerHour(state);
const pendingCap = () => Rules.pendingCap(state);
const currentPending = () => Rules.currentPending(state, now());
const invCount = (slot, t) => Rules.invCount(state, slot, t);
const invTotal = () => Rules.invTotal(state);
const partName = (slot, t) => `${SLOT_BY_ID[slot].name} ${PART_TIERS[t].name}`;

// ---------- картинки: фото машины/детали, иначе заглушка ----------
const missingImg = new Set();
window.__imgErr = (img, key) => { missingImg.add(key); img.remove(); };

const BODIES = {
  sedan: {
    body: 'M8,64 L8,50 Q9,44 22,42 L58,39 L76,23 Q80,20 88,20 L128,20 Q136,20 142,25 L160,39 L184,43 Q192,45 192,54 L192,64 Z',
    win: 'M68,39 L81,26 Q84,24 89,24 L106,24 L106,39 Z M110,24 L127,24 Q133,24 137,28 L149,39 L110,39 Z',
  },
  hatch: {
    body: 'M8,64 L8,30 Q9,22 18,21 L108,20 Q116,20 122,25 L142,40 L182,44 Q192,46 192,55 L192,64 Z',
    win: 'M22,25 L68,25 L68,39 L20,39 Z M72,25 L106,25 Q112,25 116,29 L128,39 L72,39 Z',
  },
  sport: {
    body: 'M6,64 L6,54 Q8,48 24,46 L70,42 L96,28 Q102,25 112,25 L134,26 Q146,28 158,38 L188,47 Q195,50 195,58 L195,64 Z',
    win: 'M84,42 L100,31 Q104,29 112,29 L118,29 L118,42 Z M122,29 L132,29 Q142,30 150,40 L150,42 L122,42 Z',
  },
  suv: {
    body: 'M8,64 L8,36 Q8,30 14,28 L36,26 L50,12 Q53,10 60,10 L150,10 Q158,10 162,16 L172,30 L186,32 Q193,34 193,44 L193,64 Z',
    win: 'M44,28 L56,15 L100,15 L100,28 Z M104,15 L148,15 Q154,15 157,19 L164,28 L104,28 Z',
  },
};

function carSilhouette(def) {
  const b = BODIES[def.body] || BODIES.sedan;
  const wheel = x => `<circle cx="${x}" cy="64" r="14" fill="#1d1f23"/><circle cx="${x}" cy="64" r="7" fill="#9aa1ab"/>`;
  return `<svg viewBox="0 0 200 82" xmlns="http://www.w3.org/2000/svg">
    <path d="${b.body}" fill="${def.color}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
    <path d="${b.win}" fill="rgba(20,30,45,.75)"/>
    ${wheel(48)}${wheel(154)}
  </svg>`;
}

function carPic(def, locked = false, paint = null) {
  const key = 'car:' + def.id;
  // перекрашенная машина: готовая картинка из кэша, иначе пока оригинал (подменится, когда краска «высохнет»)
  const painted = paint && !locked && typeof paintedSrc === 'function' && canPaint(def);
  const src = (painted && paintedSrc(def, paint)) || `./DROPEZONE_ AUTO_files/${def.id}.webp`;
  const img = missingImg.has(key) ? '' :
    `<img src="${src}" alt="" loading="lazy" draggable="false"${painted ? ` data-paint="${def.id}|${paint}"` : ''} onerror="__imgErr(this,'${key}')">`;
  return `<div class="pic car-pic${locked ? ' locked' : ''}">${img}${carSilhouette(def)}</div>`;
}

// деталь: фото img/parts/<slot>.webp, пока его нет — эмодзи слота
function partPic(slot, locked = false) {
  const key = 'part:' + slot;
  const img = missingImg.has(key) ? '' :
    `<img src="./DROPEZONE_ AUTO_files/${slot}.webp" alt="" loading="lazy" draggable="false" onerror="__imgErr(this,'${key}')">`;
  return `<div class="pic part-pic${locked ? ' locked' : ''}">${img}<span class="fb">${emo(SLOT_BY_ID[slot].icon, 64)}</span></div>`;
}

const rc = r => RARITIES[r].color;
// откуда машина: у машин из «Других» — настоящая страна
const originOf = d => (d.o && ORIGINS[d.o]) || COUNTRIES[d.c];
const clsBadge = r => `<span class="badge" style="background:${rc(r)}">${r} · ${RARITIES[r].name}</span>`;
const tierBadge = t => `<span class="badge" style="background:${rc(t)}">${t} · ${PART_TIERS[t].name}</span>`;

// ---------- выпадение из кейса: машина или деталь ----------
// drop = { kind: 'car', def } | { kind: 'part', slot, t }
const dropTier = d => d.kind === 'car' ? d.def.r : d.t;
const dropName = d => d.kind === 'car' ? d.def.name : partName(d.slot, d.t);
const dropPrice = d => d.kind === 'car' ? d.def.price : PART_TIERS[d.t].price;
const dropPic = (d, locked) => d.kind === 'car' ? carPic(d.def, locked) : partPic(d.slot, locked);

const casePool = Rules.casePool;
// случайный предмет для ленты рулетки (настоящий выигрыш решает сервер)
function rollCase(cs) {
  const d = Rules.rollCase(cs);
  return d.kind === 'car' ? { kind: 'car', def: CAR_BY_ID[d.id] } : d;
}

const garageFull = () => Rules.garageFull(state);
const partCase = Rules.partCase;

function currentCase(kind) {
  if (kind === 'part') return partCase(prefs.selPartCase, prefs.selPartSlot);
  const cs = Rules.caseById(prefs.selCase);
  // скрытый кейс (секретный) — только пока есть подарок с ним
  if (cs && cs.kind !== 'part' && !(cs.starter && state.starterOpened) && Rules.caseOn(cs, now())
    && (!cs.hidden || (state.gifts || []).some(g => g.caseId === cs.id))) return cs;
  return state.starterOpened ? CASE_BY_ID.rusty : CASE_BY_ID.starter;
}

// ---------- навигация ----------
let tab = 'cases';      // при запуске открываются кейсы
let garageView = 0;     // 0 — мои машины, 1 — витрина
let menuView = null;    // вкладка «Меню»: null — плитки, 'race' — гонки, 'collection' — коллекция
let shopView = 0;       // мастерская: 0 — кейсы, 1 — склад
let colFilter = 'all';
let lastNewUid = null;

const TITLES = { garage: 'Гараж', cases: 'Кейсы', shop: 'Мастерская', menu: 'Меню' };
const MENU_TITLES = { race: 'Гонки', collection: 'Коллекция', promo: 'Промокоды', friends: 'Друзья', store: 'Магазин', market: 'Площадка', plates: 'Номера', rating: 'Рейтинг', upgrade: 'Апгрейд', job: 'Мойка' };
const isSoon = () => false;  // «Скоро», пока раздел не включён
const ratingClosed = () => false;   // топ закрыт до релиза
const nextOn = () => true;
const inRace = () => tab === 'menu' && menuView === 'race';
const TAB_KIND = { cases: 'car', shop: 'part' };

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  if (b.dataset.tab === tab) {
    // повторное нажатие на «Меню» из раздела — назад к плиткам
    if (tab === 'menu' && menuView) openMenu(null);
    return;
  }
  switchTab(b.dataset.tab);
});

function switchTab(t, view = null) {
  tab = t;
  if (t === 'menu') menuView = view;
  haptic.tick();
  render('tab');
  window.scrollTo(0, 0);
}

// стеклянная «капля» под активной вкладкой
function moveTabThumb() {
  const btn = document.querySelector(`#tabs button[data-tab="${tab}"]`);
  const thumb = $('#tab-thumb');
  thumb.style.width = btn.offsetWidth + 'px';
  thumb.style.transform = `translateX(${btn.offsetLeft}px)`;
}

function render(animate) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  moveTabThumb();
  setTitle((tab === 'menu' && MENU_TITLES[menuView]) || TITLES[tab]);
  updateBalance();
  if (typeof updateRewardBadge === 'function') updateRewardBadge();
  updateMenuDot();
  if (typeof updateAvatar === 'function') updateAvatar();
  if (!$('#gift').innerHTML) $('#gift').innerHTML = emo('🎁', 22);
  const scr = $('#screen');
  if (spinning) return;   // не мешаем анимации кейса
  // горизонтальные ленты (машины в гонках и т.п.) не прыгают в начало при перерисовке
  const keepX = !animate && [...scr.querySelectorAll('.race-cars')].map(el => el.scrollLeft);
  if (tab === 'garage') scr.innerHTML = renderGarage();
  else if (tab === 'cases') scr.innerHTML = renderCaseScreen('car');
  else if (tab === 'menu') scr.innerHTML = menuView ? renderMenu() : renderMenuNext();
  else scr.innerHTML = renderShop();
  if (typeof updateIsland === 'function') updateIsland();
  if (state.seasonResult && !state.seasonResult.shown && !document.body.classList.contains('sheet-open') && typeof showSeasonResult === 'function') setTimeout(showSeasonResult, 600);
  if (keepX && keepX.length) scr.querySelectorAll('.race-cars').forEach((el, i) => { if (keepX[i]) el.scrollLeft = keepX[i]; });
  if (animate) {
    const cls = animate === 'tab' ? 'enter-tab' : 'enter';
    scr.classList.remove('enter', 'enter-tab'); void scr.offsetWidth; scr.classList.add(cls);
  }
}

// ---------- заголовок: старый уезжает в сторону перехода и размывается у края, новый выезжает с другой ----------
const TAB_ORDER = ['garage', 'cases', 'shop', 'menu'];
// версия игры — из адреса скрипта (game.js?v=N): видно, дошло ли обновление
const APP_VERSION = (document.querySelector('script[src*="game.js"]')?.src.match(/v=(\d+)/) || [])[1] || '?';
let titlePos = null;   // [номер вкладки, глубина в «Меню»]

function setTitle(text) {
  const el = $('#title');
  const pos = [TAB_ORDER.indexOf(tab), tab === 'menu' && menuView ? 1 : 0];
  const prev = titlePos;
  titlePos = pos;
  const cur = el.querySelector('.t-cur');
  const html = `<span class="t-cur${text.length > 7 ? ' long' : ''}">${text}</span>`;   // длинное — чуть мельче
  if (!cur || !prev || cur.textContent === text) {
    if (!cur || cur.textContent !== text) el.innerHTML = html;
    return;
  }
  // вправо по вкладкам или глубже в раздел — старый уезжает влево (-1), назад — вправо (+1)
  const d = pos[0] !== prev[0] ? Math.sign(prev[0] - pos[0]) : Math.sign(prev[1] - pos[1]);
  el.querySelectorAll('.t-old').forEach(o => o.remove());
  cur.className = cur.className.replace('t-cur', 't-old');
  el.insertAdjacentHTML('afterbegin', html);
  el.style.setProperty('--d', d || -1);
  el.classList.remove('t-anim'); void el.offsetWidth; el.classList.add('t-anim');
  const old = cur;
  setTimeout(() => { old.remove(); if (!el.querySelector('.t-old')) el.classList.remove('t-anim'); }, 420);
}

// ---------- переходы как в iOS: новый экран наезжает справа поверх старого ----------
// Оба экрана лежат в одном контейнере прямо на странице (не position: fixed) — так на iPhone в Safari
// старый экран не съезжает из-за адресной строки. Старый экран — те же узлы (картинки уже отрисованы).
let navEndAt = 0;   // когда закончится переход — тяжёлое обновление экрана лучше делать после
const NAV_MS = 440;

// собрать «сцену»: flowNodes — экран в потоке (задаёт высоту), absNodes — экран поверх/под ним
function navStage(flowNodes, absNodes, absTop) {
  const scr = $('#screen');
  const stage = document.createElement('div');
  stage.className = 'nav-stage';
  const flow = document.createElement('div');
  flow.className = 'nav-layer nav-flow';
  flow.append(...flowNodes);
  const abs = document.createElement('div');
  abs.className = 'nav-layer nav-abs';
  abs.style.top = absTop + 'px';
  abs.append(...absNodes);
  stage.append(flow, abs);   // экран в потоке — первым: поиск по id находит новый экран, а не уезжающий
  scr.innerHTML = '';
  scr.append(stage);
  // оба экрана — на всю высоту (не ниже видимой области): новый короткий раздел полностью закрывает уезжающий,
  // и уезжающий не обрезается снизу
  const h = Math.max(flow.offsetHeight, abs.offsetHeight + absTop, window.innerHeight - scr.getBoundingClientRect().top);
  stage.style.minHeight = flow.style.minHeight = h + 'px';
  abs.style.minHeight = (h - absTop) + 'px';
  return { stage, flow, abs };
}

// разобрать сцену: экран в потоке снова становится обычным содержимым #screen
function navUnstage(stage) {
  const scr = $('#screen');
  if (!stage.isConnected) return;
  const flow = stage.querySelector(':scope > .nav-flow');
  scr.innerHTML = '';
  scr.append(...flow.childNodes);
  document.body.classList.remove('navigating');
  // плашки, прилипающие к низу (например «Ты: #…» в рейтинге), плавно всплывают после перехода
  scr.querySelectorAll('.rt-me').forEach(el => el.classList.add('appear'));
}

// push — вперёд (раздел открывается), pop — назад
function navAnimate(dir, update) {
  const scr = $('#screen');
  const scrollY = window.scrollY;
  const oldNodes = [...scr.childNodes];
  oldNodes.forEach(n => n.remove());           // старые узлы сохраняем — они уедут в сцене
  update();                                     // рисует новый экран и прокручивает наверх
  scr.classList.remove('enter', 'enter-tab');
  const { stage } = navStage([...scr.childNodes], oldNodes, -scrollY + window.scrollY);
  stage.classList.add(dir === 'push' ? 'prep-push' : 'prep-pop');   // стартовая позиция, без анимации
  navEndAt = Date.now() + NAV_MS + 80;
  document.body.classList.add('navigating');     // на время перехода — без «матового стекла»
  requestAnimationFrame(() => requestAnimationFrame(() => {
    stage.classList.remove('prep-push', 'prep-pop');
    stage.classList.add(dir);
    setTimeout(() => navUnstage(stage), NAV_MS + 20);
  }));
}

// баланс: коротко («195,2 млн ₽»); с обновлением — нажал, и плашка плавно раскрывается до точной суммы
let balExact = false;
const balText = () => balExact ? `${Math.floor(state.money).toLocaleString('ru-RU')} ₽` : money(state.money);
function updateBalance(bump) {
  const el = $('#balance');
  el.textContent = balText();
  if (bump) { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 200); }
}
// плавно меняем ширину плашки под новый текст (сам текст — с лёгким проявлением)
function toggleBalance() {
  const el = $('#balance');
  const from = el.getBoundingClientRect().width;
  balExact = !balExact;
  el.textContent = balText();
  const to = el.getBoundingClientRect().width;
  el.style.width = from + 'px';
  void el.offsetWidth;
  el.classList.add('resizing');
  el.style.width = to + 'px';
  setTimeout(() => { el.classList.remove('resizing'); el.style.width = ''; }, 380);
  haptic.tick();
}
document.addEventListener('click', e => {
  if (!e.target.closest('#balance') || typeof nextOn !== 'function' || !nextOn()) return;
  toggleBalance();
});

function segmented(id, v, ...labels) {
  return `<div class="segmented" id="${id}" data-v="${v}" style="--n:${labels.length}">
    <div class="thumb"></div>
    ${labels.map((l, i) => `<button data-act="${id}" data-v="${i}" class="${v === i ? 'on' : ''}">${l}</button>`).join('')}
  </div>`;
}

// переключение сегмента с анимацией ползунка (без перерисовки самого переключателя)
function switchSegment(id, v, bodyHtml) {
  haptic.tick();
  const seg = $('#' + id);
  const dir = v > +seg.dataset.v ? 1 : -1;
  seg.dataset.v = v;
  seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === v));
  const body = seg.nextElementSibling;
  body.innerHTML = bodyHtml;
  body.style.setProperty('--dir', dir);
  body.classList.remove('enter', 'seg-in'); void body.offsetWidth; body.classList.add('seg-in');
}

// ---------- экран: гараж (мои машины | коллекция) ----------
// бонус за 3+ машины одной страны (релизное обновление)
function setsHTML() {
  if (!Rules.nextActive()) return '';
  const sets = [...Rules.setCountries(state)];
  const hint = `${INCOME_SET.n}+ машины одной страны — +${INCOME_SET.k * 100}% к их доходу`;
  return `<div class="inc-sets">${sets.length
    ? sets.map(k => `<span class="inc-set">${emo(COUNTRIES[k].flag, 14)} +${INCOME_SET.k * 100}%</span>`).join('') + `<span class="muted small">${hint}</span>`
    : `<span class="muted small">${emo('💡', 13)} ${hint}</span>`}</div>`;
}

function renderGarage() {
  return `${segmented('gseg', garageView, 'Машины', 'Витрина')}
    <div>${garageBody()}</div>`;
}
const garageBody = () => garageView === 0 ? renderMyCars() : renderMuseum();

// ---------- экран: меню (плитки разделов) ----------
const MENU_TILES = [
  { id: 'race', icon: '🏁', name: 'Гонки', color: '255,59,48' },
  { id: 'rating', icon: '🏆', name: 'Рейтинг', color: '255,196,0', soon: true, live: () => typeof ratingOn === 'function' && ratingOn() },
  { id: 'collection', icon: '📚', name: 'Коллекция', color: '175,82,222' },
  { id: 'store', icon: '🛒', name: 'Магазин', color: '52,199,89', soon: true, live: () => typeof nextOn === 'function' && (nextOn() || storeLive()) },
  { id: 'friends', icon: '👥', name: 'Друзья', color: '255,55,95' },
  { id: 'promo', icon: '🎟️', name: 'Промокоды', color: '10,132,255' },
  { id: 'plates', icon: '🚘', name: 'Номера', color: '100,210,255', wide: true, on: () => platesOn() },
  { id: 'market', icon: '🏪', name: 'Торговая площадка', short: 'Площадка', color: '255,149,0', wide: true, on: () => typeof nextOn === 'function' && nextOn() },
  { id: 'upgrade', icon: '🎯', name: 'Апгрейд', color: '48,209,88', wide: true, on: () => typeof nextOn === 'function' && nextOn() },
  { id: 'job', icon: '🧽', name: 'Подработка', color: '90,200,250', wide: true, on: () => typeof nextOn === 'function' && nextOn() },
];

function menuTileSub(id) {
  if (id === 'race') {
    const car = state.cars.length && raceCar();
    return car ? `Топливо ${Rules.fuelNow(state, now(), state)}/${RACE.fuelMax}` : 'Нужна машина';
  }
  if (id === 'promo') return 'Коды из канала';
  if (id === 'upgrade') return 'Сам выбираешь шанс — крути колесо';
  if (id === 'job') { const l = Rules.jobLeft(state, now()); return l > 0 ? `Мойка через ${Math.ceil(l / 60e3)} мин` : `Помой машину — ${money(JOB.min)}–${money(JOB.max)}`; }
  if (id === 'rating') {
    if (isSoon(MENU_TILES.find(t => t.id === 'rating'))) return '';
    if (ratingClosed()) return 'Закрыт до обновления';
    if (typeof nextOn === 'function' && nextOn()) {
      const ms = Rules.msToSeasonEnd(now()), d = Math.floor(ms / 86400e3), h = Math.floor(ms % 86400e3 / 3600e3);
      return `Сезон ${Rules.seasonId(now(), state)} · ещё ${d ? d + ' дн' : h + ' ч'}`;
    }
    return 'Призы каждую неделю';
  }
  if (id === 'plates') return state.plates.length ? `Моих номеров: ${state.plates.length}` : 'Кейсы, покупка, номер на машину';
  if (id === 'friends') return `+${money(REFERRAL.inviter)} за друга`;
  if (id === 'market') return state.lots.length ? `Моих лотов: ${state.lots.length}` : 'Покупай и продавай машины, детали, номера';
  if (id === 'store') return isSoon(MENU_TILES.find(t => t.id === 'store')) ? '' : !nextOn() ? 'Рубли за звёзды' : Rules.vipOn(state, now()) ? 'VIP активен' : 'Рубли, VIP, наборы';
  if (id === 'collection') {
    const base = Rules.baseCars();
    return `${base.filter(c => state.discovered.includes(c.id)).length}/${base.length}`;
  }
  return '';
}

// ---------- новое Меню (релиз): баннер пропуска, разделы, компактные плитки, красные точки ----------
const MENU_GROUPS = [
  ['Сезон', ['rating']],
  ['Заработать', ['race', 'job', 'upgrade']],
  ['Торговля', ['market', 'plates', 'store']],
  ['Ещё', ['collection', 'friends', 'promo']],
];
// красная точка: в разделе что-то ждёт игрока
function menuDot(id) {
  const t = now();
  if (id === 'pass') return (state.passPending || []).length > 0;
  if (id === 'race') return state.cars.length > 0 && Rules.fuelNow(state, t, state) >= RACE.fuelMax;
  if (id === 'job') return Rules.jobLeft(state, t) <= 0 && state.money < CASE_BY_ID.rusty.price;
  if (id === 'market') return (state.lots || []).some(l => l.until && l.until <= t);
  return false;
}
function updateMenuDot() {
  const b = document.querySelector('#tabs button[data-tab="menu"]');
  if (b) b.classList.toggle('mdot', typeof nextOn === 'function' && nextOn() && ['pass', 'race', 'job', 'market'].some(menuDot));
}
function passBannerHTML() {
  if (!Rules.passOn()) return '';
  const prem = Rules.passPremOn(state, now()), lv = Math.min(state.level, PASS.levels), pend = (state.passPending || []).length;
  const max = state.level >= PASS.levels, pct = max ? 100 : state.xp / xpNeed(state.level) * 100;
  const nx = !max && (prem ? passPrem(state.level + 1) : Rules.levelGift(state.level + 1));
  return `<button class="pass-banner${prem ? ' prem' : ''}${pend ? ' mdot' : ''}" data-act="pass-open">
    <span class="pb-top"><b>${emo('🎟️', 20)} Пропуск · Сезон ${Rules.seasonId(now(), state)}</b><span class="pb-lv">${lv}/${PASS.levels}</span></span>
    <span class="bar pb-bar"><i style="width:${pct}%"></i></span>
    <span class="pb-sub">${pend ? `${emo('🎁', 15)} <b>Забери награды: ${pend === 1 ? `уровень ${state.passPending[0]}` : `${pend} уровня`}</b>`
      : max ? 'Все уровни пройдены' : `Уровень ${state.level + 1}: ${emo(passIcon(nx), 14)} ${passText(nx)}`}</span>
    ${prem ? '' : `<span class="pb-prem">${emo('👑', 13)} Премиум</span>`}
  </button>`;
}
function menuTileHTML(t, full) {
  return `<button class="menu-tile compact${full ? ' full' : ''}${isSoon(t) ? ' soon' : ''}${menuDot(t.id) ? ' mdot' : ''}${t.id === 'rating' && Rules.msToSeasonEnd(now()) < 86400e3 ? ' hot' : ''}" data-act="menu-open" data-id="${t.id}" style="--glow:${t.color}">
    <span class="mt-icon">${emo(t.icon, 26)}</span>
    <span class="mt-name">${t.short || t.name}</span>
    <span class="mt-sub">${menuTileSub(t.id)}</span>
  </button>`;
}
function renderMenuNext() {
  const byId = Object.fromEntries(MENU_TILES.map(t => [t.id, t]));
  return `${passBannerHTML()}
    ${MENU_GROUPS.map(([title, ids]) => {
      const tiles = ids.map(id => byId[id]).filter(t => t && (!t.on || t.on()));
      return tiles.length ? `<div class="section-h menu-h"><span>${title}</span></div>
        <div class="menu-grid compact">${tiles.map((t, i) => menuTileHTML(t, tiles.length % 2 && i === tiles.length - 1)).join('')}</div>` : '';
    }).join('')}`;
}

function renderMenu() {
  if (menuView) {
    const body = menuView === 'race' ? renderRace() : menuView === 'promo' ? renderPromo()
      : menuView === 'friends' ? renderFriends() : menuView === 'plates' ? renderPlates()
      : menuView === 'rating' ? renderRating() : menuView === 'store' ? renderStore() : menuView === 'market' ? renderMarket() : menuView === 'upgrade' ? renderUpgrade() : menuView === 'job' ? renderJob() : renderCollection();
    return `<button class="menu-back" data-act="menu-back">${CHEVRON_L}<span>Меню</span></button>
      <div id="menu-body">${body}</div>`;
  }
  return `${typeof nextOn === 'function' && nextOn() ? renderMenuNext() : `<div class="menu-grid">${MENU_TILES.filter(t => !t.on || t.on()).map(t => `
    <button class="menu-tile${isSoon(t) ? ' soon' : ''}${t.id === 'rating' && ratingClosed() ? ' closed' : ''}${t.wide ? ' wide' : ''}${t.id === 'rating' && typeof nextOn === 'function' && nextOn() && Rules.msToSeasonEnd(now()) < 86400e3 ? ' hot' : ''}" data-act="menu-open" data-id="${t.id}" style="--glow:${t.color}">
      ${isSoon(t) ? '<span class="soon-tag">Скоро</span>' : ''}
      <span class="mt-icon">${emo(t.icon, 34)}</span>
      <span class="mt-name">${t.name}</span>
      <span class="mt-sub">${menuTileSub(t.id)}</span>
    </button>`).join('')}</div>`}
    ${SUPPORT.live || MODE === 'local' ? `<button class="menu-support" data-act="support">${emo('💬', 18)}<span>Поддержка</span></button>` : ''}
    <button class="menu-terms" data-act="terms">Правила и условия</button>
    ${gameAdmin() ? '<button class="menu-admin" data-act="menu-admin">Админ-панель</button>' : ''}
    ${isAdmin() ? `<div class="app-ver">версия ${APP_VERSION}</div>` : ''}`;
}

function openMenu(view) {
  haptic.tick();
  navAnimate(view ? 'push' : 'pop', () => { menuView = view; render(); window.scrollTo(0, 0); });
}

// свайп от левого края — назад из раздела «Меню»
(() => {
  let sw = null;
  const W = () => window.innerWidth;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (e.touches.length !== 1 || t.clientX > 24 || tab !== 'menu' || !menuView || spinning || busy
        || document.body.classList.contains('sheet-open') || document.body.classList.contains('racing')
        || $('#screen .nav-stage')) return;
    sw = { x: t.clientX, y: t.clientY, dx: 0, t: Date.now(), on: false };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!sw) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > dx) { sw = null; return; }   // это прокрутка
      if (dx < 8) return;
      sw.on = true;
      // под разделом — меню с плитками (в верхней части видимой области)
      const v = menuView; menuView = null;
      const tmp = document.createElement('div');
      tmp.innerHTML = renderMenu();
      menuView = v;
      const scr = $('#screen');
      sw.st = navStage([...scr.childNodes], [...tmp.childNodes], window.scrollY);
      sw.st.stage.classList.add('dragging');
      document.body.classList.add('navigating');
    }
    sw.dx = Math.max(0, dx);
    const p = sw.dx / W();
    sw.st.flow.style.transform = `translateX(${sw.dx}px)`;
    sw.st.abs.style.transform = `translateX(${-30 * (1 - p)}%)`;
    sw.st.abs.style.setProperty('--dim', (.35 * (1 - p)).toFixed(3));
  }, { passive: true });
  const end = () => {
    if (!sw) return;
    const s = sw; sw = null;
    if (!s.on) return;
    const { stage, flow, abs } = s.st;
    const speed = s.dx / Math.max(1, Date.now() - s.t);
    const back = s.dx > W() * .35 || speed > .5;
    stage.classList.add('settle');
    flow.style.transform = back ? 'translateX(100%)' : '';
    abs.style.transform = back ? 'translateX(0)' : 'translateX(-30%)';
    abs.style.setProperty('--dim', back ? 0 : .35);
    setTimeout(() => {
      if (back) { haptic.tick(); menuView = null; render(); window.scrollTo(0, 0); document.body.classList.remove('navigating'); }
      else { flow.style.transform = ''; navUnstage(stage); }
    }, 300);
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
})();

function renderMyCars() {
  if (!state.cars.length) {
    return `<div class="card empty-state">
      ${emo('🅿️', 56)}
      <h3>Гараж пуст</h3>
      <p class="muted">Открой ${state.starterOpened ? 'кейс' : 'бесплатный стартовый кейс'}, чтобы получить первую машину</p>
      <button class="btn" data-act="goto" data-tab="cases">К кейсам</button>
    </div>`;
  }
  const rate = incomePerHour();
  const pend = currentPending();
  const fill = pendingCap() ? pend / pendingCap() * 100 : 0;
  const sorted = [...state.cars].sort((a, b) => carValue(b) - carValue(a));
  const totalValue = state.cars.reduce((s, c) => s + carValue(c), 0);

  let html = `<div class="card income">
    <div class="row"><span class="muted small">Доход гаража</span><span class="muted small">${money(rate)} / ч</span></div>
    <div class="big" id="pending">${money(pend)}</div>
    <div class="bar"><i id="pending-bar" style="width:${fill}%"></i></div>
    <button class="btn" data-act="collect" ${pend < 1 ? 'disabled' : ''}>Забрать</button>
    <div class="muted small" style="margin-top:10px;text-align:center">Копится до ${Rules.offlineMs(state, now()) / 3600e3} ч, потом останавливается</div>
    ${setsHTML()}
  </div>
  <div class="section-h"><span>Машины ${Rules.slotCars(state)}/${state.slots}</span>${typeof nextOn === 'function' && nextOn() && state.cars.length > 1
    ? `<button class="link-btn" data-act="g-select">${gSel ? 'Отмена' : 'Выбрать'}</button>` : `<span>${money(totalValue)}</span>`}</div>
  ${gSel ? `<div class="muted small" style="margin:-4px 4px 10px">Нажми на машины, которые хочешь продать. Секретные не продаются, одна машина должна остаться</div>` : ''}
  <div class="grid${gSel ? ' picking' : ''}">`;
  for (const car of sorted) {
    const d = CAR_BY_ID[car.id];
    const tuned = Object.keys(car.parts).length;
    const act = gSel ? (d.secret ? '' : `data-act="g-pick"`) : `data-act="car"`;
    html += `<button class="car-card${car.uid === lastNewUid ? ' new' : ''}${gSel?.has(car.uid) ? ' sel' : ''}${gSel && d.secret ? ' dim' : ''}" ${act} data-uid="${car.uid}">
      <span class="cls" style="background:${rc(d.r)}">${d.r}</span>
      ${tuned ? `<span class="tuned">${emo('🔧', 11)} ${tuned}/8</span>` : ''}
      ${carPicOf(car)}
      ${car.plate && typeof platesOn === 'function' && platesOn() ? `<div class="car-plate tiny">${plateHTML(car.plate)}</div>` : ''}
      <div class="name">${d.name}</div>
      <div class="sub">${carHp(car)} л.с. · ${money(carValue(car))}</div>
    </button>`;
  }
  if (gSel) return html + '</div>' + gSellBar();
  for (let i = Rules.slotCars(state); i < state.slots; i++) {
    html += `<button class="car-card empty" data-act="goto" data-tab="cases">+ Свободное место</button>`;
  }
  return html + buySlotCard() + '</div>';
}

// ---------- выбор машин в гараже для продажи (релизное обновление) ----------
let gSel = null;   // Set uid выбранных машин или null — режим выбора выключен
function gSellBar() {
  const cars = state.cars.filter(c => gSel.has(c.uid));
  const sum = cars.reduce((a, c) => a + sellPrice(c), 0);
  const all = cars.length && cars.length >= state.cars.length;
  return `<div class="g-sellbar">
    <button class="btn danger" data-act="g-sell" ${cars.length && !all ? '' : 'disabled'} data-confirm="Продать ${cars.length} за ${money(sum)}?">${
      all ? 'Одна машина должна остаться' : cars.length ? `Продать (${cars.length}) · ${money(sum)}` : 'Выбери машины'}</button>
  </div>`;
}
async function gSell() {
  if (busy || !gSel?.size) return;
  busy = true;
  const r = await api('sellCars', { uids: [...gSel] });
  busy = false;
  if (!r) return;
  haptic.ok();
  updateBalance(true);
  toast(`Продано ${r.n} · +${money(r.sum)}`);
  gSel = null;
  render();
}

function renderCollection() {
  const owned = new Set(state.discovered);
  const inGarage = new Set([...state.cars, ...state.museum, ...(state.waiting || [])].map(c => c.id));   // куплено на площадке, но не выбито
  const base = Rules.baseCars();   // секретные машины — отдельным разделом
  const total = base.length;
  const got = base.filter(c => owned.has(c.id)).length;
  const filters = [['all', '', 'Все'], ...Object.entries(COUNTRIES).map(([k, v]) => [k, emo(v.flag, 18), v.name])];
  let html = `<div class="card">
    <div class="row"><b>Собрано</b><span class="muted">${got} из ${total}</span></div>
    <div class="bar" style="margin-bottom:0"><i style="width:${got / total * 100}%"></i></div>
  </div>
  ${collectionRewardsHTML()}
  <div class="section-h"><span>Машины</span></div>
  <div class="filter">${filters.map(([k, flag, n]) =>
    `<button class="${colFilter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${flag}${n}</button>`).join('')}</div>`;

  for (const r of RARITY_ORDER) {
    const list = base.filter(c => c.r === r && (colFilter === 'all' || c.c === colFilter));
    if (!list.length) continue;
    const n = list.filter(c => owned.has(c.id)).length;
    html += `<div class="section-h"><span style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${rc(r)}"></span>${RARITIES[r].name}</span><span>${n}/${list.length}</span></div><div class="grid">`;
    for (const d of list) {
      const has = owned.has(d.id);
      html += `<div class="car-card">
        <span class="cls" style="background:${has ? rc(r) : 'var(--fill)'}">${r}</span>
        ${carPic(d, !has)}
        <div class="name">${has || inGarage.has(d.id) ? d.name : '???'}</div>
        <div class="sub">${emo(originOf(d).flag, 13)} ${has ? money(d.price) : originOf(d).name}</div>
        ${!has && inGarage.has(d.id) ? '<div class="col-bought">Есть в гараже — выбей из кейса, чтобы засчитать</div>' : ''}
      </div>`;
    }
    html += '</div>';
  }
  // секретные: силуэт и подсказка, какую страну собрать
  const secrets = SECRET_CARS.filter(c => colFilter === 'all' || c.c === colFilter);
  if (secrets.length) {
    const n = secrets.filter(c => owned.has(c.id)).length;
    html += `<div class="section-h"><span style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${rc('X')}"></span>Секретные</span><span>${n}/${secrets.length}</span></div><div class="grid">`;
    for (const d of secrets) {
      const has = owned.has(d.id);
      html += `<div class="car-card secret${has ? ' got' : ''}">
        <span class="cls" style="background:${rc('X')}">X</span>
        ${carPic(d, !has)}
        <div class="name">${has ? d.name : '???'}</div>
        <div class="sub">${emo(COUNTRIES[d.c].flag, 13)} ${has ? `${d.hp} л.с.` : Rules.nextActive() ? 'секретный кейс' : `собери: ${COUNTRIES[d.c].name}`}</div>
      </div>`;
    }
    html += '</div>';
  }
  // эксклюзивные: только из контейнеров (релизное обновление)
  const excl = Rules.nextActive() && colFilter === 'all' ? EXCL_CARS : [];   // по странам не показываем — не подсказываем, что это за машины
  if (excl.length) {
    const n = excl.filter(c => owned.has(c.id)).length;
    html += `<div class="section-h"><span style="display:flex;align-items:center;gap:6px"><span class="dot" style="background:${rc('E')}"></span>Эксклюзивные</span><span>${n}/${excl.length}</span></div><div class="grid">`;
    for (const d of excl) {
      const has = owned.has(d.id);
      html += `<div class="car-card secret excl${has ? ' got' : ''}">
        <span class="cls" style="background:${rc('E')}">E</span>
        ${has ? carPic(d) : `<div class="excl-mystery">${carPic(CAR_BY_ID.e36, true)}<span class="q">?</span></div>`}
        <div class="name">${has ? d.name : '???'}</div>
        <div class="sub">${emo('📦', 13)} ${has ? `${d.hp} л.с.` : 'только из контейнеров'}</div>
      </div>`;
    }
    html += '</div>';
  }
  return html;
}

// ---------- экран: мастерская (кейсы деталей | склад) ----------
function renderShop() {
  return `${segmented('sseg', shopView, 'Кейсы', `Склад${invTotal() ? ' · ' + invTotal() : ''}`)}
    <div>${shopView === 0 ? renderCaseScreen('part') : renderStock()}</div>`;
}

function renderStock() {
  if (!invTotal()) {
    return `<div class="card empty-state">
      ${emo('📦', 56)}
      <h3>Склад пуст</h3>
      <p class="muted">Детали выпадают из кейсов мастерской. Три одинаковые детали можно слить в одну уровнем выше.</p>
      <button class="btn" data-act="shop-cases">К кейсам деталей</button>
    </div>`;
  }
  const rows = Rules.allSlots().filter(s => RARITY_ORDER.some(t => invCount(s.id, t))).map(s => {
    const chips = RARITY_ORDER.filter(t => invCount(s.id, t))
      .map(t => `<span class="chip"><span class="dot" style="background:${rc(t)}"></span>${t} × ${invCount(s.id, t)}</span>`).join('');
    const canMerge = RARITY_ORDER.some(t => t !== 'S' && invCount(s.id, t) >= 3);
    return `<button class="list-row" data-act="stock" data-slot="${s.id}">
      <div class="ic part-ic plain">${partPic(s.id)}</div>
      <div class="info"><div class="t">${s.name}</div><div class="s">${chips}</div></div>
      <div class="r">${canMerge ? '<span class="merge-dot">3→1</span>' : ''}${CHEVRON_R}</div>
    </button>`;
  }).join('');
  const bulk = typeof nextOn === 'function' && nextOn()
    ? `<button class="btn gray bulk-open" data-act="bulk-sell">${emo('💸', 18)} Продать детали по редкости</button>` : '';
  return `${bulk}<div class="list">${rows}</div>
    <div class="muted small" style="margin:12px 16px">Установить деталь можно в гараже, в карточке машины. Подходят детали не ниже класса машины.</div>`;
}

// продать все детали выбранных редкостей (кроме остывающих)
let bulkTiers = ['D', 'C'];
const bulkFree = t => Rules.allSlots().reduce((n, s) => n + Rules.invFree(state, s.id, t, now()), 0);
function bulkSheet() {
  const rows = RARITY_ORDER.map(t => {
    const n = bulkFree(t), on = bulkTiers.includes(t);
    return `<button class="list-row bulk-row${on && n ? ' on' : ''}" data-act="bulk-tier" data-t="${t}" ${n ? '' : 'disabled'}>
      <span class="bulk-check">${on && n ? '✓' : ''}</span>
      <div class="info"><div class="t">${tierBadge(t)}</div><div class="sub">${n ? `${n} шт · по ${money(partSell(t))}` : 'нет на складе'}</div></div>
      <div class="r"><b>${n ? money(n * partSell(t)) : ''}</b></div>
    </button>`;
  }).join('');
  const sel = bulkTiers.filter(t => bulkFree(t));
  const cnt = sel.reduce((a, t) => a + bulkFree(t), 0), sum = sel.reduce((a, t) => a + bulkFree(t) * partSell(t), 0);
  const html = `${sheetNav('Продать детали')}
    <div class="muted small" style="margin:0 4px 10px">Отметь редкости — продадутся все такие детали со склада. Детали на машинах и остывающие не трогаются</div>
    <div class="list">${rows}</div>
    <button class="btn danger" style="margin-top:14px" data-act="bulk-go" ${cnt ? '' : 'disabled'} data-confirm="Продать ${cnt} шт за ${money(sum)}?">${cnt ? `Продать ${cnt} шт · ${money(sum)}` : 'Выбери редкость'}</button>`;
  const body = $('#sheet-body');
  if (document.body.classList.contains('sheet-open') && body.querySelector('.bulk-row')) body.innerHTML = html; else openSheet(html);
}
async function bulkGo() {
  if (busy) return;
  const items = [];
  for (const t of bulkTiers) for (const s of Rules.allSlots()) { const n = Rules.invFree(state, s.id, t, now()); if (n) items.push({ slot: s.id, t, n }); }
  if (!items.length) return;
  busy = true;
  const r = await api('sellParts', { items });
  busy = false;
  if (!r) return;
  haptic.ok();
  updateBalance(true);
  closeSheet();
  toast(`Продано · +${money(r.sum)}`);
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act="bulk-sell"], [data-act="bulk-tier"], [data-act="bulk-go"]');
  if (!el || el.disabled) return;
  if (el.dataset.act === 'bulk-sell') { haptic.tap(); bulkSheet(); }
  else if (el.dataset.act === 'bulk-tier') { toggleIn(bulkTiers, el.dataset.t); haptic.tick(); bulkSheet(); }
  else bulkGo();
});

// ---------- экран кейса (общий для машин и деталей) ----------
const CHEVRON = `<svg viewBox="0 0 12 12"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEVRON_R = `<svg class="chev" viewBox="0 0 8 14"><path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// состояние сцены: idle — серый силуэт, result — показан выигрыш
const caseView = { car: { phase: 'idle' }, part: { phase: 'idle' } };
let spinning = false;

const mysteryPic = kind => kind === 'car' ? carPic(CAR_BY_ID.e36, true) : partPic(currentCase('part').slot || 'turbo', true);

function renderCaseScreen(kind) {
  const cs = currentCase(kind);
  const v = caseView[kind];
  // идёт аукцион контейнера — плашка сверху экрана кейсов
  return `<div class="case-screen${kind === 'part' ? ' in-shop' : ''}">
    ${kind === 'car' ? `<div id="auc-banners">${typeof aucBannersHTML === 'function' ? aucBannersHTML() : ''}${typeof evBannersHTML === 'function' ? evBannersHTML() : ''}</div>` : ''}
    <div class="case-top"><button class="case-switch" data-act="pick-case" data-kind="${kind}">${emo(cs.icon, 22)} <span class="cs-name">${cs.name}</span> ${CHEVRON}</button>
      <button class="case-info" data-act="case-odds" data-kind="${kind}" aria-label="Что внутри">i</button></div>
    <div class="stage" id="stage">${v.phase !== 'result' ? mysteryHTML(kind) : v.multi ? multiHTML(v, true) : resultHTML(v, true)}</div>
    <div class="case-actions" id="case-actions">${actionsHTML(kind)}</div>
  </div>`;
}

// «Что внутри»: классы с шансами и машины (детали) с процентами
const fmtPct = p => (p >= 10 ? p.toFixed(1) : p >= 0.1 ? p.toFixed(2) : p.toFixed(3)).replace(/\.?0+$/, '').replace('.', ',') + '%';
function showCaseOdds(kind) {
  const cs = currentCase(kind);
  const odds = Rules.caseOdds(cs);
  const body = kind === 'part'
    ? `<div class="list">${odds.map(o => `<div class="list-row static odds-row">
        <div class="ic">${partPic(cs.slot || 'turbo')}</div>
        <div class="info"><div class="t">${tierBadge(o.r)}</div><div class="sub">${cs.slot ? SLOT_BY_ID[cs.slot].name : 'Случайная деталь'} · ${money(PART_TIERS[o.r].price)}</div></div>
        <div class="r"><b>${fmtPct(o.pct)}</b></div></div>`).join('')}</div>`
    : odds.map(o => `<div class="odds-cls"><span>${clsBadge(o.r)}</span><b>${fmtPct(o.pct)}</b></div>
        <div class="odds-grid">${o.items.map(it => {
          const d = CAR_BY_ID[it.id], got = state.discovered.includes(it.id);
          return `<div class="odds-car" style="--rc:${rc(o.r)}">${carPic(d)}<div class="n">${d.name}</div>
            <div class="p">${fmtPct(it.pct)}${got ? ` ${emo('✅', 11)}` : ''}</div></div>`;
        }).join('')}</div>`).join('');
  openSheet(`${sheetNav('Что внутри')}
    <div class="odds-head">${emo(cs.icon, 26)} <b>${cs.name}</b></div>
    <div class="muted small" style="margin:0 4px 12px">${kind === 'part' ? 'Шанс уровня детали' : 'Сначала выпадает класс, потом машина. Чем дороже машина, тем реже она выпадает. ✅ — уже есть в коллекции'}</div>
    ${body}`);
}

function mysteryHTML(kind) {
  return `<div class="stage-item mystery ${kind}">
    <div class="stage-pic">${mysteryPic(kind)}<span class="q">?</span></div>
  </div>`;
}

function resultInfo(v) {
  const d = v.drop;
  const t = dropTier(d);
  let sub;
  if (d.kind === 'car') sub = `${v.isNew ? emo('✨', 14) + ' Новая в коллекции · ' : ''}Стоимость ${money(d.def.price)}`;
  else if (v.autoSold) sub = `Продано автоматически · +${money(partSell(t))}`;
  else sub = `До +${Math.round(SLOT_BY_ID[d.slot].hp * PART_TIERS[t].mult * 100)}% мощности · ${money(PART_TIERS[t].price)}`;
  return `<div class="result-info">
    <div class="title">${dropName(d)}</div>
    <div style="margin:8px 0 6px">${d.kind === 'car' ? clsBadge(t) : tierBadge(t)}</div>
    <div class="muted small">${sub}</div>
  </div>`;
}

function resultHTML(v, ready) {
  return `<div class="stage-item result ${v.drop.kind}${ready ? ' ready' : ''}" style="--rc:${rc(dropTier(v.drop))}">
    <div class="stage-pic big"><div class="glow"></div>${dropPic(v.drop)}</div>
    ${resultInfo(v)}
  </div>`;
}

// подарок от админа для этого кейса — тогда кнопка «Прокрутить бесплатно»
const giftHere = (kind, cs) => (state.gifts || []).find(g => g.kind === kind && g.caseId === cs.id && (kind !== 'part' || (g.slot || null) === (cs.slot || null)));

function actionsHTML(kind) {
  const cs = currentCase(kind);
  const v = caseView[kind];
  const isResult = v.phase === 'result';
  const gift = giftHere(kind, cs);
  const n = kind === 'part' ? prefs.partCount : cs.starter ? 1 : prefs.carCount;
  const cost = cs.price * n;
  const label = cs.starter ? 'Открыть бесплатно' : `${isResult ? 'Открыть ещё' : 'Открыть'}${n > 1 ? ' ×' + n : ''} · ${money(cost)}`;
  const free = state.slots - Rules.slotCars(state);
  let main, note = '';
  const giftsN = gift ? state.gifts.filter(g => g.kind === kind && g.caseId === cs.id).length : 0;
  if (gift && !(kind === 'car' && garageFull())) {
    main = `<button class="btn gold" data-act="open-case" data-kind="${kind}">${emo('🎁', 18)} Прокрутить бесплатно${giftsN > 1 ? ` · ${giftsN}` : ''}</button>`;
    note = gift.note ? esc(gift.note) : 'Подарок от DROPEZONE';
  } else if (kind === 'car' && garageFull()) {
    main = `<button class="btn" disabled>Гараж заполнен</button>`;
    note = 'Продай машину, чтобы освободить место';
  } else if (kind === 'car' && free < n) {
    main = `<button class="btn" disabled>Нужно ${n} свободных мест</button>`;
    note = `Свободно мест в гараже: ${free}`;
  } else if (kind === 'part' && Rules.partCasePauseLeft(state, now()) > 0) {
    main = `<button class="btn" disabled>Следующий кейс через <span data-timer="partcase">${mmssLeft(Rules.partCasePauseLeft(state, now()))}</span></button>`;
    note = `Кейсы с деталями — не чаще раза в ${Rules.partPauseMs(state, now()) / 1000} секунд`;
  } else if (cs.event && Rules.casePay(cs) === 'stars') {
    main = '';
    note = 'Этот кейс — только за звёзды';
  } else if (cs.starter || state.money >= cost) {
    main = `<button class="btn" data-act="open-case" data-kind="${kind}">${label}</button>`;
    if (cs.starter) note = 'Подарок новичку';
  } else {
    main = `<button class="btn" disabled>${label}</button>`;
    note = `Не хватает ${money(cost - state.money)}`;
  }
  if (kind === 'car' && cs.event && cs.stars && Rules.casePay(cs) !== 'rub' && !gift && !garageFull()) {
    main += `<button class="btn gold ev-stars" data-act="open-case-stars" data-confirm="Открыть за ${cs.stars} ⭐?">Открыть за ${emo('⭐', 16)} ${cs.stars}</button>`;
  }
  const counts = gift || (cs.event && Rules.casePay(cs) === 'stars') ? [] : kind === 'part' ? PART_COUNTS : cs.starter ? [] : CAR_COUNTS;
  const counter = counts.length ? `<div class="count-picker" style="--n:${counts.length};--i:${Math.max(0, counts.indexOf(n))}">
    <div class="thumb"></div>${counts.map(c =>
    `<button class="${c === n ? 'on' : ''}" data-act="count" data-kind="${kind}" data-n="${c}">×${c}</button>`).join('')}</div>` : '';
  let extra = '';
  if (isResult && kind === 'car' && v.multi) {
    const left = multiToSell(v), selN = multiSel(v).length;
    extra = `<div class="btn-row">
      <button class="btn gray" data-act="take" data-kind="car">В гараж</button>
      ${left.length ? `<button class="btn danger" data-act="sell-multi" data-kind="car" data-confirm="Нажми ещё раз">${selN ? `Продать (${selN})` : 'Продать все'} · ${money(left.reduce((s, i) => s + sellPrice(i.car), 0))}</button>` : ''}
    </div>${typeof nextOn === 'function' && nextOn() && multiLeft(v).length > 1 ? `<div class="multi-sum">${selN ? `Выбрано: <b>${selN}</b>` : 'Нажми на машины, чтобы выбрать'}</div>` : ''}`;
  } else if (isResult && kind === 'car') {
    const car = state.cars.find(c => c.uid === v.carUid);
    if (car) extra = `<div class="btn-row">
      <button class="btn gray" data-act="take" data-kind="car">В гараж</button>
      ${state.cars.length > 1 ? `<button class="btn danger" data-act="sell" data-uid="${car.uid}" data-confirm="Нажми ещё раз">Продать · ${money(sellPrice(car))}</button>` : ''}
    </div>`;
  } else if (isResult && v.multi) {
    const left = multiToSell(v), selN = multiSel(v).length;
    extra = `${left.length ? `<button class="btn danger sell-all" data-act="sell-multi" data-confirm="Нажми ещё раз, чтобы продать${selN ? ' выбранные' : ' всё'}">${selN ? `Продать (${selN})` : 'Продать всё'} · ${money(left.reduce((s, i) => s + partSell(i.d.t), 0))}</button>` : ''}
      <div class="multi-sum">На склад: <b>${v.kept}</b>${v.soldN ? ` · Продано: <b>${v.soldN}</b> (+${money(v.soldSum)})` : ''}</div>`;
  } else if (isResult && v.partLeft) {
    const { slot, t } = v.drop;
    extra = `<div class="btn-row">
      <button class="btn gray" data-act="take" data-kind="part">На склад</button>
      <button class="btn danger" data-act="sell-drop-part" data-confirm="Нажми ещё раз">Продать · ${money(partSell(t))}</button>
    </div>`;
  }
  const as = prefs.autoSell;
  const autoRow = kind === 'part' ? `<button class="list-row setting" data-act="autosell">
      <div class="info"><div class="t">Автопродажа</div></div>
      <div class="r">${as.on ? autoSellSummary() : 'Выкл'}${CHEVRON_R}</div>
    </button>` : '';
  return `${counter}${main}${note ? `<div class="note">${note}</div>` : ''}${extra}
    <div class="list settings">
      <div class="list-row setting static"><div class="info"><div class="t">Быстрое открытие</div></div><button class="switch${prefs.fastOpen ? ' on' : ''}" data-act="fast" aria-label="Быстрое открытие"></button></div>
      ${autoRow}
    </div>`;
}

function caseRow(cs, selected) {
  const drops = cs.kind === 'part' ? cs.drops : Rules.caseDrops(cs);
  const chips = RARITY_ORDER.filter(r => drops[r] && (cs.kind === 'part' || casePool(cs, r).length))
    .map(r => `<span class="chip"><span class="dot" style="background:${rc(r)}"></span>${pct(drops[r])}</span>`).join('');
  return `<button class="list-row" data-act="choose-case" data-id="${cs.id}">
    <div class="ic">${emo(cs.icon, 30)}</div>
    <div class="info"><div class="t">${cs.name}</div><div class="s">${chips}</div></div>
    <div class="r">${cs.starter ? 'Бесплатно' : money(cs.price)}<span class="check">${selected ? '✓' : ''}</span></div>
  </button>`;
}

// шторка кейсов деталей: выбор детали (или любой) и уровня кейса
function partPickerBody(cur) {
  const slot = prefs.selPartSlot;
  const tile = (id, pic, name) => `<button class="slot-tile${(id || null) === slot ? ' on' : ''}" data-act="pick-slot" data-slot="${id || ''}">
      <div class="st-pic">${pic}</div><div class="st-n">${name}</div>
    </button>`;
  const tiles = [tile('', `<div class="any">${emo('🎲', 30)}</div>`, 'Любая'),
    ...Rules.allSlots().map(s => tile(s.id, partPic(s.id), s.name + (s.ev ? ' ⚡' : '')))].join('');
  const rows = PART_CASES.filter(c => !(slot && c.anySlotOnly))
    .map(c => caseRow({ ...partCase(c.id, slot), name: c.name }, c.id === cur.id)).join('');
  return `<div class="section-h">Деталь</div>
    <div class="slot-grid">${tiles}</div>
    <div class="section-h">Кейс</div>
    <div class="list">${rows}</div>
    <div class="muted small" style="margin:12px 16px">${slot
      ? `Выпадает только «${SLOT_BY_ID[slot].name}». Кейс конкретной детали дороже на ${Math.round(SLOT_CASE_MARKUP * 100)}%. ${PART_CASES.filter(c => c.anySlotOnly).map(c => `«${c.name}»`).join(', ')} — только со случайной деталью.`
      : 'Деталь выпадает случайная. Выбери конкретную деталь выше, чтобы собирать только её.'}</div>`;
}

function showCasePicker(kind) {
  const cur = currentCase(kind);
  let html = sheetNav(kind === 'part' ? 'Кейсы с деталями' : 'Выбор кейса');
  if (kind === 'part') {
    html += partPickerBody(cur);
  } else {
    if (!state.starterOpened) {
      html += `<div class="section-h">Подарок новичку</div><div class="list">${caseRow(CASE_BY_ID.starter, cur.starter)}</div>`;
    }
    if (typeof evPickerHTML === 'function') html += evPickerHTML(cur);
    html += `<div class="section-h">По редкости</div><div class="list">${
      CASES.filter(c => !c.starter && !c.country && !c.hidden && Rules.caseOn(c, now())).map(c => caseRow(c, c === cur)).join('')}</div>`;
    html += `<div class="section-h">По странам</div><div class="list">${
      CASES.filter(c => c.country).map(c => caseRow(c, c === cur)).join('')}</div>`;
  }
  openSheet(html);
}

// ---------- открытие кейса ----------
const ITEM_W = 104, GAP = 8, STEP = ITEM_W + GAP;
const WIN_INDEX = 48, STRIP_LEN = 56;
const wait = ms => new Promise(r => setTimeout(r, ms));
// следующий кадр; таймер — на случай, если окно свёрнуто и кадры не рисуются
const nextFrame = () => new Promise(r => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 60); });

async function openCase(kind, stars) {
  const cs = currentCase(kind);
  if (spinning || busy || (kind === 'car' && garageFull())) return;
  const gift = giftHere(kind, cs);
  if (!gift && kind === 'part' && prefs.partCount > 1) return openMulti(cs, prefs.partCount);
  if (!gift && !stars && kind === 'car' && !cs.starter && prefs.carCount > 1) return openMultiCar(cs, prefs.carCount);
  busy = true;
  const r = gift ? await api('giftOpen', { id: gift.id }) : await api('openCase', kind === 'part'
    ? { kind, caseId: cs.id, slot: cs.slot || null, count: 1, autoSell: prefs.autoSell }
    : { kind, caseId: cs.id, stars: !!stars, useStars: stars === 'bal' });
  if (gift && typeof updateIsland === 'function') updateIsland();
  busy = false;
  if (!r) { render(); return; }
  let v;
  if (kind === 'car') {
    v = caseView.car = { phase: 'spin', drop: { kind: 'car', def: CAR_BY_ID[r.id] }, carUid: r.uid, isNew: r.isNew };
    if (cs.starter) { prefs.selCase = 'rusty'; savePrefs(); }
  } else {
    const it = gift ? { slot: r.slot, t: r.t } : r.items[0];
    v = caseView.part = { phase: 'spin', drop: { kind: 'part', slot: it.slot, t: it.t }, partLeft: !it.sold, autoSold: it.sold };
  }
  updateBalance(true);

  spinning = true;
  document.body.classList.add('spinning');
  $('#case-actions').classList.add('hide');

  if (prefs.fastOpen) await fastReveal(v, kind);
  else await rouletteReveal(v, cs);

  // финал: показываем подпись и кнопки
  v.phase = 'result';
  if (v.carUid) lastNewUid = v.carUid;
  spinning = false;
  document.body.classList.remove('spinning');
  haptic.ok();
  $('#stage .stage-item.result')?.classList.add('ready');
  const actions = $('#case-actions');
  actions.innerHTML = actionsHTML(kind);
  actions.classList.remove('hide');
  // после стартового кейса выбранным становится другой; на складе вырос счётчик
  const cur = currentCase(kind);
  $('.case-switch').innerHTML = `${emo(cur.icon, 22)} <span class="cs-name">${cur.name}</span> ${CHEVRON}`;
  if (kind === 'part') $('#sseg button[data-v="1"]').textContent = `Склад · ${invTotal()}`;
}

// обычный режим: силуэт уезжает, крутится лента, выигрыш вылетает и увеличивается
async function rouletteReveal(v, cs) {
  const stage = $('#stage');
  const old = stage.querySelector('.stage-item');
  old.classList.add('leave');
  setTimeout(() => old.remove(), 500);

  const items = Array.from({ length: STRIP_LEN }, (_, i) => i === WIN_INDEX ? v.drop : rollCase(cs));
  stage.insertAdjacentHTML('beforeend', `<div class="roulette"><div class="strip">
    ${items.map(d => `<div class="r-item ${d.kind}" style="--rc:${rc(dropTier(d))}">${dropPic(d)}<div class="n">${dropName(d)}</div></div>`).join('')}
  </div></div>`);
  const rl = stage.lastElementChild;
  const strip = rl.firstElementChild;
  await nextFrame();
  rl.classList.add('in');
  await wait(250);

  const box = rl.getBoundingClientRect();
  const jitter = (Math.random() - 0.5) * (ITEM_W - 16);
  const target = -(WIN_INDEX * STEP + ITEM_W / 2 - box.width / 2 + jitter);

  // щелчок вибрацией на каждом проезжающем предмете
  let lastIdx = -1, ticking = true;
  const tickLoop = () => {
    if (!ticking) return;
    const x = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41;
    const idx = Math.floor((box.width / 2 - x) / STEP);
    if (idx !== lastIdx) { lastIdx = idx; haptic.tick(); }
    requestAnimationFrame(tickLoop);
  };
  strip.style.transition = 'transform 6s cubic-bezier(0.12, 0.8, 0.12, 1)';
  strip.style.transform = `translateX(${target}px)`;
  requestAnimationFrame(tickLoop);
  let ended = false;
  await new Promise(r => { strip.addEventListener('transitionend', e => { if (e.target === strip) { ended = true; r(); } }); setTimeout(r, 7500); });
  ticking = false;
  // на слабом телефоне (или если игра была свёрнута) анимация могла отстать — ставим ленту точно
  // на выигрыш, чтобы под стрелкой была именно та машина, что придёт в гараж
  if (!ended) {
    strip.style.transition = 'transform .35s ease-out';
    strip.style.transform = `translateX(${target}px)`;
    await wait(400);
  }
  strip.style.transition = 'none';
  strip.style.transform = `translateX(${target}px)`;
  await wait(250);

  // выигрыш вылетает из ленты и увеличивается (FLIP-анимация)
  const from = strip.children[WIN_INDEX].querySelector('.pic').getBoundingClientRect();
  stage.insertAdjacentHTML('beforeend', resultHTML(v, false));
  const pic = stage.lastElementChild.querySelector('.stage-pic');
  const to = pic.getBoundingClientRect();
  const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
  const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
  pic.style.transition = 'none';
  pic.style.transform = `translate(${dx}px, ${dy}px) scale(${from.width / to.width})`;
  void pic.offsetWidth;
  pic.style.transition = 'transform .75s var(--spring)';
  pic.style.transform = '';
  rl.classList.add('out');
  setTimeout(() => rl.remove(), 400);
  await wait(500);
}

// быстрый режим: серый силуэт плавно превращается в выигрыш
async function fastReveal(v, kind) {
  const stage = $('#stage');
  const old = stage.querySelector('.stage-item');
  const fromResult = old.classList.contains('result');
  stage.insertAdjacentHTML('beforeend', `<div class="stage-item result morph ${kind}${fromResult ? ' appear' : ''}" style="--rc:${rc(dropTier(v.drop))}">
    <div class="stage-pic">
      <div class="glow"></div>
      <div class="layer a">${mysteryPic(kind)}</div>
      <div class="layer b">${dropPic(v.drop, true)}</div>
      <span class="q">?</span>
    </div>
    ${resultInfo(v)}
  </div>`);
  const el = stage.lastElementChild;
  if (fromResult) { old.classList.add('fade'); setTimeout(() => old.remove(), 300); await wait(300); }
  else old.remove();

  await nextFrame();
  el.classList.add('s1');                    // серый силуэт перетекает в силуэт выигрыша
  haptic.soft();
  await wait(450);
  el.querySelector('.layer.b .pic').classList.remove('locked');   // проявляется цвет
  el.querySelector('.stage-pic').classList.add('big');            // и выигрыш увеличивается
  el.classList.add('s2');
  await wait(800);
}

// ---------- несколько кейсов деталей за раз ----------
let busy = false;   // идёт запрос — повторные нажатия игнорируем

function multiTile(item, revealed, idx) {
  const { d } = item;
  const pick = typeof nextOn === 'function' && nextOn();   // релизное обновление: нажатие выделяет плитку
  if (d.kind === 'car') {
    const sold = !state.cars.some(c => c.uid === item.uid);
    const act = !revealed || sold ? '' : pick && !d.def.secret ? ` data-act="mpick" data-kind="car" data-i="${idx}"` : ` data-act="car" data-uid="${item.uid}"`;
    return `<div class="mtile car${revealed ? ' s1 s2' : ''}${sold ? ' sold' : ''}${item.sel && !sold ? ' sel' : ''}" style="--rc:${rc(d.def.r)}"${act}>
      <span class="tl">${d.def.r}</span>${item.isNew ? `<span class="tnew">${emo('✨', 12)}</span>` : ''}
      <div class="layer a">${mysteryPic('car')}</div>
      <div class="layer b">${carPic(d.def, !revealed)}</div>
      <span class="q">?</span>
      <div class="mn">${sold ? 'Продано' : d.def.name}</div>
    </div>`;
  }
  const { sold } = item;
  const act = revealed && !sold && pick ? ` data-act="mpick" data-kind="part" data-i="${idx}"` : '';
  return `<div class="mtile${revealed ? ' s1 s2' : ''}${sold ? ' sold' : ''}${item.sel && !sold ? ' sel' : ''}" style="--rc:${rc(d.t)}"${act}>
    <span class="tl">${d.t}</span>
    <div class="layer a">${mysteryPic('part')}</div>
    <div class="layer b">${partPic(d.slot, !revealed)}</div>
    <span class="q">?</span>
    <div class="mn">${sold ? `+${money(partSell(d.t))}` : SLOT_BY_ID[d.slot].name}</div>
  </div>`;
}

function multiHTML(v, revealed) {
  return `<div class="stage-item multi${revealed ? ' ready' : ''}">
    <div class="mgrid n${v.items.length}${v.items[0]?.d.kind === 'car' ? ' cars' : ''}">${v.items.map((it, i) => multiTile(it, revealed, i)).join('')}</div>
  </div>`;
}

// несколько кейсов с машинами: та же сетка, что у деталей
async function openMultiCar(cs, n) {
  if (busy) return;
  busy = true;
  const r = await api('openCase', { kind: 'car', caseId: cs.id, count: n });
  busy = false;
  if (!r) { render(); return; }
  const items = r.items.map(it => ({ d: { kind: 'car', def: CAR_BY_ID[it.id] }, uid: it.uid, isNew: it.isNew }));
  const v = caseView.car = { phase: 'spin', multi: true, items };
  updateBalance(true);
  await revealGrid(v, 'car');
}

async function openMulti(cs, n) {
  if (busy) return;
  busy = true;
  const r = await api('openCase', { kind: 'part', caseId: cs.id, slot: cs.slot || null, count: n, autoSell: prefs.autoSell });
  busy = false;
  if (!r) { render(); return; }
  const items = r.items.map(it => ({ d: { kind: 'part', slot: it.slot, t: it.t }, sold: it.sold }));
  const v = caseView.part = {
    phase: 'spin', multi: true, items,
    kept: items.filter(i => !i.sold).length,
    soldN: items.filter(i => i.sold).length,
    soldSum: items.filter(i => i.sold).reduce((s, i) => s + partSell(i.d.t), 0),
  };
  updateBalance(true);
  await revealGrid(v, 'part');
}

// сетка серых силуэтов со знаком вопроса, они по очереди превращаются в выпавшее
async function revealGrid(v, kind) {
  const { items } = v;
  const n = items.length;
  spinning = true;
  document.body.classList.add('spinning');
  $('#case-actions').classList.add('hide');

  const stage = $('#stage');
  const old = stage.querySelector('.stage-item');
  old.classList.add('fade');
  setTimeout(() => old.remove(), 300);
  stage.insertAdjacentHTML('beforeend', multiHTML(v, false));
  const tiles = [...stage.lastElementChild.querySelectorAll('.mtile')];
  await nextFrame();
  await wait(250);
  const step = kind === 'car' ? 520 : n >= 10 ? 160 : 230;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    tile.classList.add('s1');
    await wait(step * 0.5);
    tile.querySelector('.layer.b .pic').classList.remove('locked');
    tile.classList.add('s2');
    const t = kind === 'car' ? items[i].d.def.r : items[i].d.t;
    tierIdx(t) >= 3 ? haptic.heavy() : haptic.tick();
    await wait(step * 0.5);
  }
  await wait(350);

  v.phase = 'result';
  spinning = false;
  document.body.classList.remove('spinning');
  haptic.ok();
  // плитки становятся нажимаемыми (выбор для продажи / карточка машины)
  stage.querySelectorAll('.stage-item:not(.multi)').forEach(x => x.remove());
  stage.querySelector('.stage-item.multi').outerHTML = multiHTML(v, true);
  const actions = $('#case-actions');
  actions.innerHTML = actionsHTML(kind);
  actions.classList.remove('hide');
  if (kind === 'part') $('#sseg button[data-v="1"]').textContent = `Склад · ${invTotal()}`;
}

// что из этого открытия ещё не продано: детали на складе / машины в гараже
const multiLeft = v => v.items[0]?.d.kind === 'car'
  ? v.items.map(i => ({ ...i, car: state.cars.find(c => c.uid === i.uid) })).filter(i => i.car && !CAR_BY_ID[i.car.id].secret)
  : v.items.filter(i => !i.sold && invCount(i.d.slot, i.d.t) > 0);

// выбранные плитки (если ничего не выбрано — продаются все)
const multiSel = v => multiLeft(v).filter(i => i.sel);
const multiToSell = v => multiSel(v).length ? multiSel(v) : multiLeft(v);

async function sellMulti(kind = 'part') {
  const v = caseView[kind];
  if (!v.multi || busy) return;
  const left = multiToSell(v);
  if (!left.length) return;
  busy = true;
  const r = kind === 'car'
    ? await api('sellCars', { uids: left.map(i => i.uid) })
    : await api('sellParts', { items: left.map(it => ({ slot: it.d.slot, t: it.d.t, n: 1 })) });
  busy = false;
  if (!r) { render(); return; }
  if (kind === 'part') for (const it of left) { it.sold = true; v.kept--; v.soldN++; v.soldSum += partSell(it.d.t); }
  v.items.forEach(i => { i.sel = false; });
  updateBalance(true);
  haptic.ok();
  toast(`Продано · +${money(r.sum)}`);
  $('#stage').innerHTML = multiHTML(v, true);
  // продано всё: кнопка «Продать» плавно уезжает, «В гараж» растягивается на всю ширину
  const sb = $('#case-actions [data-act="sell-multi"]');
  if (sb && !multiLeft(v).length && typeof nextOn === 'function' && nextOn()) {
    sb.classList.add('collapse');
    await wait(380);
  }
  $('#case-actions').innerHTML = actionsHTML(kind);
  if (kind === 'part') $('#sseg button[data-v="1"]').textContent = `Склад${invTotal() ? ' · ' + invTotal() : ''}`;
}

// ---------- автопродажа: что класть на склад ----------
function toggleIn(arr, x) {
  const i = arr.indexOf(x);
  if (i >= 0) arr.splice(i, 1); else arr.push(x);
}

function autoSellSummary() {
  const t = RARITY_ORDER.filter(x => prefs.autoSell.tiers.includes(x));
  return t.length ? `на склад: ${t.join(' ')}` : 'всё продаётся';
}

function showAutoSell(update) {
  const as = prefs.autoSell;
  const check = on => `<span class="check">${on ? '✓' : ''}</span>`;
  const html = `${sheetNav('Автопродажа')}
    <div class="list">
      <div class="list-row setting static"><div class="info"><div class="t">Включить</div></div>
        <button class="switch${as.on ? ' on' : ''}" data-act="as-on" aria-label="Автопродажа"></button></div>
    </div>
    <div class="muted small" style="margin:8px 16px 0">На склад попадают только отмеченные уровни. Всё остальное сразу продаётся за 50%.</div>
    <div class="as-body${as.on ? '' : ' off'}">
      <div class="section-h">Уровни</div>
      <div class="list">${[...RARITY_ORDER].reverse().map(t => `<button class="list-row" data-act="as-tier" data-t="${t}">
        <div class="info"><div class="t">${tierBadge(t)}</div></div>
        <div class="r">${money(PART_TIERS[t].price)}${check(as.tiers.includes(t))}</div>
      </button>`).join('')}</div>
    </div>`;
  if (update) {
    const body = $('#sheet-body');
    const top = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = top;
  } else openSheet(html);
}

// ---------- шторка (bottom sheet) ----------
function sheetNav(title, back) {
  const left = back ? `<button class="back" data-act="${back.act}" ${back.attrs || ''}>${CHEVRON_L} ${back.label}</button>` : '<span class="sp"></span>';
  return `<div class="sheet-nav">${left}<span class="t">${title}</span><button class="x" data-act="close">✕</button></div>`;
}
const CHEVRON_L = `<svg viewBox="0 0 8 14"><path d="M6.5 1.5 1.5 7l5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function openSheet(html) {
  const body = $('#sheet-body');
  const sheet = $('#sheet');
  const wasOpen = document.body.classList.contains('sheet-open');
  if (wasOpen) {
    // смена содержимого открытой шторки: высота плавно перетекает к новой, содержимое въезжает
    const h0 = sheet.offsetHeight;
    body.innerHTML = html;
    body.scrollTop = 0;
    sheetResize(sheet, h0);
    body.classList.remove('swap', 'opening'); void body.offsetWidth; body.classList.add('swap');
    return;
  }
  body.innerHTML = html;
  body.scrollTop = 0;
  sheet.style.transform = '';
  sheet.style.height = '';
  body.classList.remove('swap', 'opening'); void body.offsetWidth; body.classList.add('opening');   // элементы появляются по очереди
  document.body.classList.add('sheet-open');
  tg?.BackButton?.show();
  haptic.soft();
}

// плавная смена высоты шторки (FLIP): со старой высоты на новую
function sheetResize(sheet, h0) {
  const h1 = sheet.offsetHeight;
  if (Math.abs(h1 - h0) < 4) return;
  sheet.style.transition = 'none';
  sheet.style.height = h0 + 'px';
  void sheet.offsetHeight;
  sheet.style.transition = '';
  sheet.classList.add('resizing');
  sheet.style.height = h1 + 'px';
  clearTimeout(sheet._rs);
  sheet._rs = setTimeout(() => { sheet.classList.remove('resizing'); sheet.style.height = ''; }, 460);
}

// экран под шторкой перерисовываем, когда она уже уехала, — чтобы закрытие шло без рывков
let sheetRenderT = null;
function closeSheet() {
  if (!document.body.classList.contains('sheet-open')) return;
  $('#sheet').style.transform = '';
  document.body.classList.remove('sheet-open');
  tg?.BackButton?.hide();
  clearTimeout(sheetRenderT);
  sheetRenderT = setTimeout(render, 420);
}
tg?.BackButton?.onClick(closeSheet);
$('#backdrop').addEventListener('click', closeSheet);

// смахивание шторки вниз
(() => {
  const sheet = $('#sheet');
  let startY = 0, lastY = 0, lastT = 0, vy = 0, dragging = false;
  const down = e => {
    const body = $('#sheet-body');
    const onGrabber = e.target.closest('#grabber, .sheet-nav');
    if (!onGrabber && body.scrollTop > 0) return;
    if (e.target.closest('button') && !onGrabber) return;
    dragging = true; startY = lastY = e.clientY; lastT = performance.now(); vy = 0;
    sheet.classList.add('dragging');
  };
  const move = e => {
    if (!dragging) return;
    const dy = Math.max(0, e.clientY - startY);
    const now = performance.now();
    vy = (e.clientY - lastY) / Math.max(1, now - lastT);
    lastY = e.clientY; lastT = now;
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    const dy = Math.max(0, lastY - startY);
    if (dy > sheet.offsetHeight * 0.3 || vy > 0.6) closeSheet();
    else sheet.style.transform = '';
  };
  sheet.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
})();

// ---------- карточка машины и тюнинг ----------
function showCar(uid) {
  const car = state.cars.find(c => c.uid === uid);
  if (!car) return;
  const d = CAR_BY_ID[car.id];
  if (lastNewUid === uid) lastNewUid = null;
  const gain = carHp(car) - (Rules.isBeta(car) ? Rules.betaHp(car) : d.hp);
  const slots = Rules.carSlots(car).map(s => {
    const t = car.parts[s.id];
    const cd = Rules.slotCdLeft(car, s.id, now());
    const right = t ? tierBadge(t) : cd ? `<span class="muted">${emo('⏳', 13)} ${Rules.fmtLeft(cd)}</span>` : '<span class="muted">Пусто</span>';
    return `<button class="list-row" data-act="slot" data-uid="${uid}" data-slot="${s.id}">
      <div class="ic part-ic${t ? '' : ' plain'}" style="--rc:${t ? rc(t) : 'transparent'}">${partPic(s.id, !t)}</div>
      <div class="info"><div class="t">${s.name}</div></div>
      <div class="r">${right}${CHEVRON_R}</div>
    </button>`;
  }).join('');
  openSheet(`${sheetNav('')}
    <div class="car-head">
      <div class="title">${d.name}</div>
      <div class="tags">${clsBadge(d.r)}<span class="chip">${emo(originOf(d).flag, 13)} ${originOf(d).name}</span>${Rules.isEv(car) ? `<span class="chip">${emo('⚡', 13)} Электро</span>` : ''}</div>
    </div>
    <div style="padding:14px 0 0">${carPicOf(car)}</div>
    ${Rules.fullSet(car) ? `<div class="full-set" style="--rc:${rc(Rules.fullSet(car))}">${emo('🏁', 14)} Сет ${PART_TIERS[Rules.fullSet(car)].name} · +${FULL_SET.hp * 100}% мощности · +${FULL_SET.income * 100}% к доходу</div>`
      : Rules.nextActive() ? `<div class="muted small" style="text-align:center;margin-top:6px">Все 8 деталей одного уровня — сет: +${FULL_SET.hp * 100}% мощности и +${FULL_SET.income * 100}% к доходу</div>` : ''}
    ${car.plate && typeof platesOn === 'function' && platesOn() ? `<div class="car-plate">${plateHTML(car.plate)}</div>` : ''}
    <div class="stats">
      <div class="stat"><div class="v">${carHp(car)}</div><div class="l">л.с.${gain ? ` <span class="plus">+${gain}</span>` : ''}</div></div>
      <div class="stat"><div class="v">${d.perm ? (d.beta ? 'Бета' : 'Основатель') : money(carValue(car))}</div><div class="l">${d.perm ? 'не продаётся' : 'стоимость'}</div></div>
      <div class="stat"><div class="v">${money(carIncome(car))}</div><div class="l">доход / ч</div></div>
    </div>
    <div class="list">
      ${canPaint(d) ? `<button class="list-row" data-act="paint" data-uid="${uid}">
        <div class="ic">${emo('🎨', 24)}</div><div class="info"><div class="t">Покраска</div></div>
        <div class="r">${car.paint ? `<span class="paint-dot" style="background:${car.paint}"></span>${PAINTS.find(p => p.hex === car.paint)?.name || ''}` : 'Заводской'}${CHEVRON_R}</div></button>` : ''}
      ${d.perm ? '' : `<button class="list-row" data-act="museum-in" data-uid="${uid}" ${museumFull() ? 'disabled' : ''}>
        <div class="ic">${emo('🏛️', 24)}</div><div class="info"><div class="t">Выставить на витрину</div>
        <div class="sub">${museumFull() ? 'На витрине нет места' : `Свободно мест: ${state.museumSlots - state.museum.length}`}</div></div>
        <div class="r">${CHEVRON_R}</div></button>`}
      ${typeof carPlateRow === 'function' ? carPlateRow(car) : ''}
      ${typeof nextOn === 'function' && nextOn() && (!d.secret || car.cont) ? `<button class="list-row" data-act="mk-sell-car" data-uid="${uid}">
        <div class="ic">${emo('🏪', 24)}</div><div class="info"><div class="t">На торговую площадку</div><div class="sub">Продать другим игрокам по своей цене</div></div>
        <div class="r">${CHEVRON_R}</div></button>` : ''}
    </div>
    <div class="section-h"><span>Тюнинг · ${Object.keys(car.parts).length}/8</span><span>детали от класса ${carClass(d)}</span></div>
    <div class="list">${slots}</div>
    ${Object.keys(car.parts).length ? `<button class="btn gray" style="margin-top:12px" data-act="uninstall-all" data-uid="${uid}"
      data-confirm="Ещё раз — детали и слоты на ${Rules.fmtLeft(Rules.partCdMs(state, now()))} перерыв">Снять все детали · ${Object.keys(car.parts).length}</button>` : ''}
    ${!d.secret && state.cars.length <= 1 ? `<div class="card secret-note">${emo('🔒', 16)} Последнюю машину в гараже продать нельзя — на ней можно гонять и зарабатывать</div>`
      : d.secret ? `<div class="card secret-note">${emo('🔒', 16)} ${car.cont ? 'Машина из контейнера — продать можно только на торговой площадке' : d.perm ? `${d.beta ? 'Подарок за участие в бете' : 'Машина основателей — спасибо за поддержку игры'} — навсегда твоя: не продаётся и не занимает место в гараже. Мощность и доход растут с уровнем (сейчас ${Rules.betaHp(car)} л.с., ${money(Rules.betaIncome(car))} в час)` : 'Секретную машину нельзя продать'}</div>` : `<button class="btn danger" style="margin-top:18px" data-act="sell" data-uid="${car.uid}"
      data-confirm="Нажмите ещё раз, чтобы ${Object.keys(car.parts).length ? 'продать вместе с деталями' : 'подтвердить'}">Продать за ${money(sellPrice(car))}</button>`}
  `);
}

function showSlot(uid, slot) {
  const car = state.cars.find(c => c.uid === uid);
  if (!car) return;
  const d = CAR_BY_ID[car.id];
  const s = SLOT_BY_ID[slot];
  const cur = car.parts[slot];
  let html = sheetNav(s.name, { act: 'car', attrs: `data-uid="${uid}"`, label: 'Назад' });
  if (cur) {
    html += `<div class="section-h">Установлено</div>
    <div class="list"><div class="list-row static">
      <div class="ic part-ic" style="--rc:${rc(cur)}">${partPic(slot)}</div>
      <div class="info"><div class="t">${partName(slot, cur)}</div><div class="sub">+${partHpGain(car, slot, cur)} л.с. · +${money(PART_TIERS[cur].price)} к стоимости</div></div>
      <button class="pill gray" data-act="uninstall" data-uid="${uid}" data-slot="${slot}" data-confirm="Снять? Деталь и слот — ${Rules.fmtLeft(Rules.partCdMs(state, now()))} перерыв">Снять</button>
    </div></div>`;
  }
  const avail = RARITY_ORDER.filter(t => invCount(slot, t) && t !== cur);
  const slotCd = Rules.slotCdLeft(car, slot, now());
  html += `<div class="section-h">На складе</div>`;
  if (slotCd) html += `<div class="card cd-note">${emo('⏳', 16)} С этого слота недавно сняли деталь — поставить новую можно через <b>${Rules.fmtLeft(slotCd)}</b></div>`;
  if (!avail.length) {
    html += `<div class="card" style="text-align:center"><span class="muted">Нет деталей «${s.name}». Они выпадают из кейсов в Мастерской.</span>
      <button class="btn gray" style="margin-top:12px" data-act="goto" data-tab="shop">В Мастерскую</button></div>`;
  } else {
    html += `<div class="list">${[...avail].reverse().map(t => {
      const free = Rules.invFree(state, slot, t, now());
      const ok = canInstall(car, t) && free > 0 && !slotCd;
      const delta = partHpGain(car, slot, t) - (cur ? partHpGain(car, slot, cur) : 0);
      return `<div class="list-row static${ok ? '' : ' disabled'}">
        <div class="ic part-ic" style="--rc:${rc(t)}">${partPic(slot)}</div>
        <div class="info"><div class="t">${partName(slot, t)} <span class="muted">× ${invCount(slot, t)}</span></div>
          <div class="sub">${!canInstall(car, t) ? `Не подходит: машина класса ${carClass(d)}`
            : !free ? `${emo('⏳', 12)} Остывает ещё ${Rules.fmtLeft(Math.min(...Rules.invLocked(state, slot, t, now()).map(l => l.until)) - now())}`
            : `${delta >= 0 ? '+' : ''}${delta} л.с. · +${money(PART_TIERS[t].price)}`}</div></div>
        ${ok ? `<button class="pill" data-act="install" data-uid="${uid}" data-slot="${slot}" data-t="${t}">${cur ? 'Заменить' : 'Установить'}</button>` : ''}
      </div>`;
    }).join('')}</div>`;
  }
  openSheet(html);
}

async function installPart(uid, slot, t) {
  const r = await api('install', { uid, slot, t });
  if (!r) return;
  haptic.ok();
  toast(`${SLOT_BY_ID[slot].name} ${PART_TIERS[t].name} · +${r.gain} л.с.`);
  showCar(uid);
}

async function uninstallPart(uid, slot) {
  if (!(await api('uninstall', { uid, slot }))) return;
  haptic.tap();
  toast('Деталь снята и лежит на складе');
  showCar(uid);
}

// ---------- склад: слияние и продажа ----------
function showStock(slot, fx = '') {
  const s = SLOT_BY_ID[slot];
  const tiers = RARITY_ORDER.filter(t => invCount(slot, t));
  let html = sheetNav(s.name) + fx;
  if (!tiers.length) {
    html += `<div class="card" style="text-align:center"><span class="muted">Деталей «${s.name}» больше нет</span></div>`;
  } else {
    html += `<div class="list">${[...tiers].reverse().map(t => {
      const n = invCount(slot, t);
      const free = Rules.invFree(state, slot, t, now());
      const locks = Rules.invLocked(state, slot, t, now());
      const merge = t !== 'S'
        ? `<button class="pill" data-act="merge" data-slot="${slot}" data-t="${t}" ${free >= 3 ? '' : 'disabled'}>3→1 · ${Rules.mergeChance(state, t)}%</button>`
        : '';
      return `<div class="list-row static">
        <div class="ic part-ic" style="--rc:${rc(t)}">${partPic(slot)}</div>
        <div class="info"><div class="t">${PART_TIERS[t].name} <span class="muted">× ${n}</span></div>
          <div class="sub">${t} · ${money(PART_TIERS[t].price)}${locks.length ? ` · ${emo('⏳', 12)} ${locks.length} остыва${locks.length > 1 ? 'ют' : 'ет'} ещё ${Rules.fmtLeft(Math.min(...locks.map(l => l.until)) - now())}` : ''}</div></div>
        <div class="pills">${merge}${typeof nextOn === 'function' && nextOn() && free ? `<button class="pill gray" data-act="mk-sell-part" data-slot="${slot}" data-t="${t}">${emo('🏪', 14)}</button>` : ''}<button class="pill gray" data-act="sell-part" data-slot="${slot}" data-t="${t}" data-confirm="Ещё раз">${money(partSell(t))}</button></div>
      </div>`;
    }).join('')}</div>
    <div class="muted small" style="margin:12px 16px">Слияние: 3 одинаковые детали → 1 уровнем выше. Если не повезёт — сгорят все три. Кнопка с ценой продаёт одну деталь. Снятая с машины деталь ${Rules.fmtLeft(Rules.partCdMs(state, now()))} «остывает»: её нельзя поставить или слить.</div>`;
  }
  openSheet(html);
}

async function mergeParts(slot, t) {
  if (busy) return;
  busy = true;
  const r = await api('merge', { slot, t });
  busy = false;
  if (!r) return;
  const { ok, next, chance, kept } = r;

  // анимация: три детали слетаются в центр, затем вспышка или пепел
  const fx = `<div class="merge-fx ${ok ? 'win' : 'lose'}" style="--rc:${rc(ok ? next : t)}">
    <div class="trio">${[0, 1, 2].map(i => `<div class="m m${i}" style="--c:${rc(t)}">${partPic(slot)}</div>`).join('')}</div>
    <div class="outcome">
      <div class="big-pic">${partPic(slot)}</div>
      <div class="title">${ok ? partName(slot, next) : kept ? `Сгорели 2 детали` : 'Детали сгорели'}</div>
      <div class="muted small">${ok ? tierBadge(next) : `Шанс был ${chance ?? MERGE_CHANCE[t]}%${kept ? ` · 1 деталь осталась · следующий шанс ${Rules.mergeChance(state, t)}%` : ''}`}</div>
    </div>
  </div>`;
  showStock(slot, fx);
  haptic.heavy();
  setTimeout(() => { ok ? haptic.ok() : haptic.err(); }, 650);
}

async function sellPartItem(slot, t) {
  const r = await api('sellParts', { items: [{ slot, t, n: 1 }] });
  if (!r) return false;
  updateBalance(true);
  haptic.tap();
  toast(`Продано · +${money(r.sum)}`);
  return true;
}

// ---------- продажа машины ----------
async function sellCar(uid) {
  const r = await api('sellCar', { uid });
  if (!r) return;
  updateBalance(true);
  haptic.ok();
  toast(`Продано · +${money(r.price)}`);
  if (caseView.car.carUid === uid) caseView.car = { phase: 'idle' };
  if (document.body.classList.contains('sheet-open')) closeSheet();
  else render();
}

// ---------- подтверждение повторным нажатием ----------
// Кнопка с data-confirm: первое нажатие — кнопка краснеет, меняет надпись и вибрирует «тык-тык-тык-тык»,
// второе нажатие (в течение 3 с) — выполняет действие.
let armed = null;

function arm(el) {
  disarm();
  armed = { el, html: el.innerHTML, timer: setTimeout(disarm, 3000) };
  el.classList.add('armed');
  el.textContent = el.dataset.confirm;
  for (let i = 0; i < 4; i++) setTimeout(() => tg?.HapticFeedback?.impactOccurred('rigid'), i * 70);
}

function disarm() {
  if (!armed) return;
  clearTimeout(armed.timer);
  if (armed.el.isConnected) {
    armed.el.classList.remove('armed');
    armed.el.innerHTML = armed.html;
  }
  armed = null;
}

let toastTimer;
function toast(text, ms = 2200) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- обработка нажатий ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (armed && armed.el !== el) disarm();   // тап мимо — отменяем подтверждение
  if (!el || el.disabled) return;
  if (el.dataset.confirm !== undefined) {
    // первое нажатие только «взводит» кнопку — остальные обработчики (награды, музей, админка) не должны сработать
    if (!armed) { arm(el); e.stopImmediatePropagation(); return; }
    disarm();
  }
  const { act, uid, id, kind, slot, t } = el.dataset;
  switch (act) {
    case 'goto': closeSheet(); switchTab(el.dataset.tab); break;
    case 'menu-back': if (!spinning) openMenu(null); break;   // во время анимации (колесо, гонка) — не уходим
    case 'menu-admin': haptic.tap(); openLocalAdmin(); break;
    case 'support':   // профиль аккаунта поддержки в Telegram
      haptic.tap();
      if (tg?.openTelegramLink) tg.openTelegramLink(SUPPORT.url); else window.open(SUPPORT.url, '_blank');
      break;
    case 'menu-open': {
      const t = MENU_TILES.find(x => x.id === el.dataset.id);
      if (isSoon(t)) { haptic.tick(); toast('Скоро будет'); }
      else if (t.id === 'rating' && ratingClosed()) { haptic.err(); toast('Топ закрыт до обновления — итоги уже подведены'); }
      else {
        if (t.id === 'promo') promoFx = '';
        if (t.id === 'store') storeFx = '';
        if (t.id === 'rating') ratingData = {};
        if (t.id === 'job') jobFx = '';
        openMenu(t.id);
        if (t.id === 'friends') loadFriends();
      }
      break;
    }
    case 'gseg':
      garageView = +el.dataset.v;
      switchSegment('gseg', garageView, garageBody());
      break;
    case 'sseg':
      if (spinning) break;
      shopView = +el.dataset.v;
      switchSegment('sseg', shopView, shopView === 0 ? renderCaseScreen('part') : renderStock());
      break;
    case 'shop-cases': shopView = 0; render(true); break;
    case 'car': haptic.tap(); showCar(uid); break;
    case 'g-select': gSel = gSel ? null : new Set(); haptic.tap(); render(); break;
    case 'g-pick': {
      if (!gSel) break;
      if (gSel.has(uid)) { gSel.delete(uid); haptic.tick(); } else { gSel.add(uid); haptic.tap(); }
      el.classList.toggle('sel', gSel.has(uid));
      $('.g-sellbar')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: gSellBar() }).firstElementChild);
      break;
    }
    case 'g-sell': gSell(); break;
    case 'slot': haptic.tick(); showSlot(uid, slot); break;
    case 'install': installPart(uid, slot, t); break;
    case 'uninstall': uninstallPart(uid, slot); break;
    case 'uninstall-all':
      api('uninstallAll', { uid }).then(r => {
        if (!r) return;
        haptic.ok();
        toast(`Снято деталей: ${r.n} — они на складе`);
        showCar(uid);
      });
      break;
    case 'stock': haptic.tap(); showStock(slot); break;
    case 'merge': mergeParts(slot, t); break;
    case 'sell-part': sellPartItem(slot, t).then(ok => ok && showStock(slot)); break;
    case 'sell-multi': sellMulti(el.dataset.kind || 'part'); break;
    case 'mpick': {
      const v = caseView[el.dataset.kind];
      const it = v?.items?.[+el.dataset.i];
      if (!it || spinning) break;
      it.sel = !it.sel;
      el.classList.toggle('sel', it.sel);
      it.sel ? haptic.tap() : haptic.tick();
      $('#case-actions').innerHTML = actionsHTML(el.dataset.kind);
      break;
    }
    case 'sell-drop-part': {
      const v = caseView.part;
      if (v.partLeft) sellPartItem(v.drop.slot, v.drop.t).then(ok => { if (ok) { caseView.part = { phase: 'idle' }; render(); } });
      break;
    }
    case 'pick-case': if (!spinning) showCasePicker(kind); break;
    case 'count': {
      const k = el.dataset.kind || 'part';
      if (k === 'car') prefs.carCount = +el.dataset.n; else prefs.partCount = +el.dataset.n;
      savePrefs();
      haptic.tick();
      // ползунок плавно едет со старого места на новое
      const oldI = getComputedStyle(el.parentElement).getPropertyValue('--i');
      $('#case-actions').innerHTML = actionsHTML(k);
      const thumb = $('#case-actions .count-picker .thumb');
      if (thumb) {
        thumb.style.transition = 'none';
        thumb.style.transform = `translateX(calc(${oldI} * 100%))`;
        void thumb.offsetWidth;
        thumb.style.transition = thumb.style.transform = '';
      }
      break;
    }
    case 'autosell': haptic.tap(); showAutoSell(); break;
    case 'as-on': prefs.autoSell.on = !prefs.autoSell.on; savePrefs(); haptic.tick(); showAutoSell(true); break;
    case 'as-tier': toggleIn(prefs.autoSell.tiers, t); savePrefs(); haptic.tick(); showAutoSell(true); break;
    case 'pick-slot': {
      prefs.selPartSlot = slot || null;
      prefs.selPartCase = currentCase('part').id;   // заводской → гоночный цех, если выбрана деталь
      caseView.part = { phase: 'idle' };
      savePrefs();
      haptic.tick();
      const body = $('#sheet-body');
      const top = body.scrollTop;
      body.innerHTML = sheetNav('Кейсы с деталями') + partPickerBody(currentCase('part'));
      body.scrollTop = top;
      break;
    }
    case 'fast':
      prefs.fastOpen = !prefs.fastOpen;
      el.classList.toggle('on', prefs.fastOpen);
      savePrefs();
      haptic.tick();
      break;
    case 'choose-case': {
      const cs = Rules.caseById(id);
      const k = cs.kind === 'part' ? 'part' : 'car';
      if (k === 'part') prefs.selPartCase = id; else prefs.selCase = id;
      caseView[k] = { phase: 'idle' };
      savePrefs();
      haptic.tick();
      closeSheet();
      break;
    }
    case 'open-case': haptic.tap(); openCase(kind); break;
    case 'open-case-stars': {   // со счёта — сразу крутим; оплата Telegram — придёт подарком «Прокрутить бесплатно»
      const cs = currentCase('car');
      starChoice(cs.stars, `Кейс «${cs.name}»`, () => openCase('car', 'bal'), () => MODE === 'server' ? payStars('ev:' + cs.id) : openCase('car', true));
      break;
    }
    case 'case-odds': haptic.tap(); showCaseOdds(kind); break;
    case 'close': closeSheet(); break;
    case 'take':
      caseView[kind] = { phase: 'idle' };
      if (kind === 'car') { garageView = 0; switchTab('garage'); }
      else { shopView = 1; render(true); }
      break;
    case 'sell': sellCar(uid); break;
    case 'filter':
      colFilter = el.dataset.f;
      haptic.tick();
      $('#menu-body').innerHTML = renderCollection();
      break;
    case 'collect':
      api('collect').then(r => {
        if (!r) return;
        updateBalance(true);
        haptic.ok();
        toast(`+${money(r.got)}`);
        render();
      });
      break;
  }
});

// пауза между кейсами деталей: таймер на кнопке, по окончании — снова «Открыть»
const mmssLeft = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
setInterval(() => {
  const el = document.querySelector('[data-timer="partcase"]');
  if (!el || spinning) return;
  const left = Rules.partCasePauseLeft(state, now());
  if (left > 0) el.textContent = mmssLeft(left);
  else if ($('#case-actions')) $('#case-actions').innerHTML = actionsHTML('part');
}, 1000);

// ---------- тик: обновляем счётчик дохода ----------
setInterval(() => {
  if (tab !== 'garage' || garageView !== 0 || !state.cars.length) return;
  const pend = currentPending();
  const el = $('#pending');
  if (el) el.textContent = money(pend);
  const bar = $('#pending-bar');
  if (bar) bar.style.width = (pendingCap() ? pend / pendingCap() * 100 : 0) + '%';
  const btn = document.querySelector('[data-act="collect"]');
  if (btn) btn.disabled = pend < 1;
}, 1000);

// красные точки Меню (бак наполняется, подработка освобождается со временем)
setInterval(() => {
  updateMenuDot();
  if (tab === 'menu' && !menuView && !spinning && !document.body.classList.contains('sheet-open')
    && typeof nextOn === 'function' && nextOn()) {
    document.querySelectorAll('.menu-tile.compact').forEach(el => el.classList.toggle('mdot', menuDot(el.dataset.id)));
  }
}, 15e3);

window.addEventListener('resize', moveTabThumb);

// ---------- старт: когда загружены все скрипты (гонки, награды, музей) ----------
// тестовая версия: один раз на устройстве выдать машины обновления (эксклюзивы, машины сезона, бета, SLR) — Rules.actions.testAllCars.
// Новые обычные машины не выдаются (и один раз убираются — testRemoveNew): их выбивают из кейсов.
// Ключ — по числу таких машин: добавятся новые — выдаст и их. В Telegram (сервер) не срабатывает.
async function testAllCars() {
  if (MODE !== 'local' || !Rules.nextActive()) return;
  // один раз: новые обычные машины из гаража убрать — их проверяют выпадением из кейсов (18.10)
  try {
    if (!localStorage.getItem('dz_test_nonew_v1')) {
      const rm = await api('testRemoveNew', {});
      localStorage.setItem('dz_test_nonew_v1', '1');
      if (rm?.removed) { render(); toast(`🧪 Тест: новые машины убраны из гаража (${rm.removed}) — выбивай их из кейсов`, 4000); }
    }
  } catch {}
  const key = 'dz_test_allcars_' + (EXCL_CARS.length + PASS_CARS.length + NAMED_CARS.length + 2);
  try { if (localStorage.getItem(key)) return; } catch { return; }
  const r = await api('testAllCars', {});
  try { localStorage.setItem(key, '1'); } catch {}
  if (r?.total) { render(); toast(`🧪 Тест: выдано машин обновления — ${r.total}${r.museum ? ` (на витрину: ${r.museum})` : ''}`, 4000); }
}
document.addEventListener('DOMContentLoaded', async () => {
  $('#screen').innerHTML = `<div class="loading">${emo('🏁', 40)}<div class="muted">Загрузка…</div></div>`;
  const loaded = await loadState();
  if (loaded === 'maintenance') return;
  // приветствие-истории (один раз на устройстве), потом проверка подписки
  let storyAct = null;
  if (loaded && typeof storiesSeen === 'function') {
    if (typeof nextOn === 'function' && nextOn() && STORIES_RELEASE) {   // с релизом: один набор про обновление вместо старых сторис
      if (!storiesSeen(STORIES_REL_KEY)) await showStories(STORIES_RELEASE, STORIES_REL_KEY);
    } else {
      if (!storiesSeen()) await showStories();
      if (!storiesSeen(WHATSNEW_KEY)) storyAct = await showWhatsNew();
    }
  }
  if (loaded?.subscribe) await subscribeGate(loaded.subscribe);
  if (storyAct === 'friends') { tab = 'menu'; menuView = 'friends'; loadFriends(); }
  if (storyAct === 'plates') { tab = 'menu'; menuView = 'plates'; }
  if (!loaded) {
    $('#screen').innerHTML = `<div class="card empty-state">${emo('📡', 48)}<h3>Нет связи с сервером</h3>
      <p class="muted">Проверь интернет и попробуй ещё раз</p><button class="btn" onclick="location.reload()">Повторить</button></div>`;
    return;
  }
  render();
  document.dispatchEvent(new Event('game-ready'));
  testAllCars();
  if (refWelcome) toast(`🎁 +${money(REFERRAL.friend)} — подарок за приглашение от ${refWelcome}`, 5000);
});
// ---------- Встроенный Магазин ----------
var storeFx = '';

function renderStore() {
  return `
    <div class="st-hero">
      <div class="st-hero-tag">VIP ПАКЕТ</div>
      <div class="st-hero-t">Премиум Гараж</div>
      <div class="st-hero-items">
        <span>⚡ Доход x2</span>
        <span>🏎️ +5 мест</span>
        <span>⛽ Бесконечный бак</span>
        <span>👑 VIP-статус</span>
      </div>
      <button class="btn gold" onclick="fetch('http://localhost:8000/promo', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:'LAST'})}).then(()=>location.reload())">
        Активировать VIP (+1 млрд ₽)
      </button>
    </div>

    <div class="section-h"><span>Пакеты валюты</span></div>
    <div class="st-packs">
      <div class="st-pack" onclick="fetch('http://localhost:8000/promo', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:'LAST'})}).then(()=>location.reload())">
        <div class="st-pack-m">+50 млн ₽</div>
        <div class="st-price">100 ⭐ Забрать</div>
      </div>
      <div class="st-pack" onclick="fetch('http://localhost:8000/promo', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:'LAST'})}).then(()=>location.reload())">
        <div class="st-pack-m">+500 млн ₽</div>
        <div class="st-price">1000 ⭐ Забрать</div>
      </div>
    </div>
  `;
}
// ==================== АДМИН-ПАНЕЛЬ РАЗРАБОТЧИКА ====================
function showAdmin() {
  const modal = document.createElement('div');
  modal.id = 'admin-modal';
  modal.style = `
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.85); backdrop-filter: blur(15px);
    display: flex; flex-direction: column; justify-content: flex-end;
  `;
  
  modal.innerHTML = `
    <div style="background: #1c1c1e; border-radius: 24px 24px 0 0; padding: 20px; max-height: 85vh; overflow-y: auto; color: #fff; box-shadow: 0 -10px 40px rgba(0,0,0,0.8);">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 14px; margin-bottom: 16px;">
        <b style="font-size: 20px;">👑 Панель Администратора</b>
        <button onclick="document.getElementById('admin-modal').remove()" style="font-size: 20px; background: rgba(255,255,255,0.15); border-radius: 50%; width: 34px; height: 34px; color: #fff;">✕</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button class="btn" style="background: #30d158;" onclick="
          fetch('http://localhost:8000/promo', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code:'LAST'})})
          .then(() => { toast('+1 МИЛЛИАРД ₽ начислен!'); location.reload(); });
        ">💰 Начислить +1 000 000 000 ₽</button>

        <button class="btn" style="background: #0a84ff;" onclick="
          fetch('http://localhost:8000/action', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'openCase', params:{caseId:'elite', count:5}})})
          .then(() => { toast('Выдано 5 элитных суперкаров!'); location.reload(); });
        ">🏎️ Выдать пачку суперкаров (AMG ONE, Plaid, RX-7)</button>

        <button class="btn" style="background: #ff9f0a;" onclick="
          fetch('http://localhost:8000/action', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'openCase', params:{kind:'part', count:5}})})
          .then(() => { toast('Выдано 5 топовых деталей!'); location.reload(); });
        ">🔧 Выдать 5 деталей тюнинга</button>

        <button class="btn" style="background: #bf5af2;" onclick="
          fetch('http://localhost:8000/action', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'openPlateCase'})})
          .then(() => { toast('Выдан новый госномер!'); location.reload(); });
        ">🚘 Выдать красивый госномер</button>

        <button class="btn" style="background: #ff375f;" onclick="
          fetch('http://localhost:8000/action', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'buySlot'})})
          .then(() => { toast('Куплен новый слот в гараже!'); location.reload(); });
        ">➕ Добавить слот в гараже</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// Заменяем вызов админки на наше окно
function openLocalAdmin() {
  showAdmin();
}