// ===== DROPZONE: AUTO — покраска машин и музей (витрина) =====
'use strict';

// ---------- покраска ----------
// Маска кузова img/paint/<id>.webp (tools/paint_masks.py): под маской цвет меняется на новый,
// а яркость пикселя сохраняется — остаются блики и тени.
const paintCache = {};      // 'id|#hex' -> dataURL готовой картинки
const paintPending = {};

const canPaint = def => Rules.canPaintId(def.id) && (PAINT_BASE[def.id] !== undefined || (typeof PAINT_PINK !== 'undefined' && PAINT_PINK[def.id] !== undefined));
const paintPrice = Rules.paintPrice;
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

const loadImg = src => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => res(im);
  im.onerror = rej;
  im.src = src;
});

// розовая версия (img/paint/<id>.webp — сама машина с розовым кузовом): розовое меняем на новый цвет.
// Тени — по яркости розового, блики (белое на розовом) остаются белыми. То же в tools/paint_from_pink.py.
async function makePaintedPink(def, hex) {
  const key = `${def.id}|${hex}`;
  const img = await loadImg(`img/paint/${def.id}.webp`);
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const p = id.data;
  const base = Math.max(0.05, PAINT_PINK[def.id]);
  const [tr, tg, tb] = hexRgb(hex);
  const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
    const v = Math.max(r, b);
    if (v < 1e-3) continue;
    const k = cl((Math.min(r, b) - g) / v * 8 - 0.2) * cl((1 - Math.abs(r - b) / v) * 2.5 - 0.6);
    if (k < 0.01) continue;
    const hi = cl(g / v) * cl((v - 0.45) / 0.3), s = v / base;   // блик — только на светлом (на тёмном это шум)
    const nr = cl(tr * s), ng = cl(tg * s), nb = cl(tb * s);
    p[i] = (r * (1 - k) + (nr + (1 - nr) * hi) * k) * 255;
    p[i + 1] = (g * (1 - k) + (ng + (1 - ng) * hi) * k) * 255;
    p[i + 2] = (b * (1 - k) + (nb + (1 - nb) * hi) * k) * 255;
  }
  ctx.putImageData(id, 0, 0);
  const url = cv.toDataURL('image/webp', 0.88);
  paintCache[key] = url;
  document.querySelectorAll(`img[data-paint="${CSS.escape(key)}"]`).forEach(el => { el.src = url; });
  return url;
}

async function makePainted(def, hex) {
  if (typeof PAINT_PINK !== 'undefined' && PAINT_PINK[def.id] !== undefined) return makePaintedPink(def, hex);
  const key = `${def.id}|${hex}`;
  const [img, mask] = await Promise.all([loadImg(`img/cars/${def.id}.webp`), loadImg(`img/paint/${def.id}.webp`)]);
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(mask, 0, 0, w, h);
  const m = ctx.getImageData(0, 0, w, h).data;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const p = id.data;
  const base = Math.max(0.05, PAINT_BASE[def.id]);
  const [tr, tg, tb] = hexRgb(hex);
  const hiDiv = Math.max(1e-3, 1 / base - 1);
  for (let i = 0; i < p.length; i += 4) {
    const k = m[i] / 255;
    if (k < 0.01) continue;
    const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
    const s = (0.2126 * r + 0.7152 * g + 0.0722 * b) / base;
    let nr, ng, nb;
    if (s <= 1) { nr = tr * s; ng = tg * s; nb = tb * s; }
    else { const q = Math.min(1, (s - 1) / hiDiv); nr = tr + (1 - tr) * q; ng = tg + (1 - tg) * q; nb = tb + (1 - tb) * q; }
    p[i] = (r * (1 - k) + nr * k) * 255;
    p[i + 1] = (g * (1 - k) + ng * k) * 255;
    p[i + 2] = (b * (1 - k) + nb * k) * 255;
  }
  ctx.putImageData(id, 0, 0);
  const url = cv.toDataURL('image/webp', 0.88);
  paintCache[key] = url;
  document.querySelectorAll(`img[data-paint="${CSS.escape(key)}"]`).forEach(el => { el.src = url; });
  return url;
}

// готовая перекрашенная картинка или null (тогда запускаем покраску, картинка подменится сама)
function paintedSrc(def, hex) {
  const key = `${def.id}|${hex}`;
  if (paintCache[key]) return paintCache[key];
  if (!paintPending[key]) paintPending[key] = makePainted(def, hex).catch(() => { delete paintPending[key]; });
  return null;
}

// картинка конкретной машины игрока (с её цветом)
// скин — отдельное фото той же машины (золотая SLR основателей: img/cars/slr_gold.webp)
const carPicOf = car => carPic(car.skin ? { ...CAR_BY_ID[car.id], id: `${car.id}_${car.skin}` } : CAR_BY_ID[car.id], false, car.paint);

let paintPick = null;   // выбранный в окне покраски цвет (ещё не оплачен)

function showPaint(uid, hex) {
  const car = state.cars.find(c => c.uid === uid);
  if (!car) return;
  const d = CAR_BY_ID[car.id];
  paintPick = hex === undefined ? (car.paint || null) : hex;
  const price = paintPrice(car);
  const same = (paintPick || null) === (car.paint || null);
  const sw = (h, name) => `<button class="swatch${(h || null) === paintPick ? ' on' : ''}" data-act="paint-pick" data-uid="${uid}" data-hex="${h || ''}" title="${name}">
      <i style="${h ? `background:${h}` : ''}" class="${h ? '' : 'orig'}"></i><span>${name}</span></button>`;
  const name = paintPick ? PAINTS.find(p => p.hex === paintPick)?.name : 'Заводской цвет';
  let btn;
  if (same) btn = `<button class="btn" disabled>${car.paint ? 'Этот цвет уже на машине' : 'Выбери цвет'}</button>`;
  else if (!paintPick) btn = `<button class="btn gray" data-act="paint-apply" data-uid="${uid}">Вернуть заводской цвет · бесплатно</button>`;
  else if (state.money < price) btn = `<button class="btn" disabled>Не хватает ${money(price - state.money)}</button>`;
  else btn = `<button class="btn" data-act="paint-apply" data-uid="${uid}" data-confirm="Ещё раз — покрасить">Покрасить · ${money(price)}</button>`;
  const html = `${sheetNav('Покраска', { act: 'car', attrs: `data-uid="${uid}"`, label: 'Назад' })}
    <div class="paint-preview">${carPic(d, false, paintPick)}</div>
    <div class="paint-name">${name}</div>
    <div class="swatches">${sw(null, 'Заводской')}${PAINTS.map(p => sw(p.hex, p.name)).join('')}</div>
    ${btn}
    <div class="muted small" style="margin:10px 16px;text-align:center">Перекрашивается только кузов. Стоимость покраски — ${Math.round(PAINT_K * 100)}% цены машины.</div>`;
  if (hex === undefined) { openSheet(html); return; }
  // выбор цвета — без перерисовки окна: кружок плавно выделяется, машина плавно перетекает в новый цвет
  const body = $('#sheet-body');
  body.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', (s.dataset.hex || null) === paintPick));
  const nm = body.querySelector('.paint-name');
  if (nm && nm.textContent !== name) { nm.classList.remove('swap'); void nm.offsetWidth; nm.textContent = name; nm.classList.add('swap'); }
  const old = body.querySelector('.paint-preview + .paint-name + .swatches + .btn');
  if (old) old.outerHTML = btn;
  crossfadePaint(body.querySelector('.paint-preview .pic'), d, paintPick);
}

// плавная смена цвета на превью: новая картинка проявляется поверх старой
let paintFadeId = 0;
async function crossfadePaint(pic, def, hex) {
  if (!pic) return;
  const id = ++paintFadeId;
  let src = `img/cars/${def.id}.webp`;
  if (hex) src = paintCache[`${def.id}|${hex}`] || await (paintPending[`${def.id}|${hex}`] ||= makePainted(def, hex).catch(() => null)) || src;
  if (id !== paintFadeId) return;   // уже выбрали другой цвет
  const im = new Image();
  im.className = 'paint-layer';
  im.draggable = false;
  im.src = src;
  await im.decode().catch(() => {});
  if (id !== paintFadeId) return;
  const prev = [...pic.querySelectorAll('img')];
  pic.insertBefore(im, pic.querySelector('svg'));   // перед силуэтом-заглушкой — иначе он проступит
  void im.offsetWidth;
  im.classList.add('show');
  pic.classList.remove('pulse'); void pic.offsetWidth; pic.classList.add('pulse');
  // слои, что были под новым, убираем, когда новый полностью проявился
  setTimeout(() => prev.forEach(x => x.remove()), 650);
}

async function applyPaint(uid) {
  const r = await api('paint', { uid, hex: paintPick });
  if (!r) return;
  updateBalance(true);
  haptic.ok();
  toast(paintPick ? `Покрашено: ${PAINTS.find(p => p.hex === paintPick).name.toLowerCase()}` : 'Заводской цвет вернули');
  showCar(uid);
}

// ---------- музей (витрина) ----------
const museumFull = () => Rules.museumFull(state);
const museumSlotPrice = () => Rules.museumSlotPrice(state);

async function toMuseum(uid) {
  const car = state.cars.find(c => c.uid === uid);
  if (!car || !(await api('museumIn', { uid }))) return;
  if (lastNewUid === uid) lastNewUid = null;
  haptic.ok();
  toast(`${CAR_BY_ID[car.id].name} — на витрине`);
  closeSheet();
  garageView = 1;
  switchTab('garage');
}

async function fromMuseum(uid) {
  const car = state.museum.find(c => c.uid === uid);
  if (!car || !(await api('museumOut', { uid }))) return;
  haptic.ok();
  toast(`${CAR_BY_ID[car.id].name} вернулась в гараж`);
  closeSheet();
}

async function buyMuseumSlot() {
  if (!(await api('museumBuy'))) return;
  updateBalance(true);
  haptic.ok();
  toast(`Новое место на витрине · ${state.museumSlots}/${MUSEUM.maxSlots}`);
  render();
}

// Витрина славы: свою видно в «Витрине» гаража, чужую — из карточки игрока в рейтинге
function hallHTML(hall, mine) {
  const head = `<div class="card hall-head"><div class="row"><b>${emo('🏆', 20)} Витрина славы</b><span class="muted">${hall.length}</span></div>
      <div class="muted small" style="margin-top:4px">Секретные и эксклюзивные машины прошлых сезонов — остаются навсегда${mine ? '. Её видят другие игроки — из рейтинга' : ''}</div></div>`;
  if (!hall.length) return head + `<div class="card hall-empty">${emo('🔒', 34)}
      <div>${mine ? 'Пока пусто. Секретные машины, которые будут у тебя в конце сезона, переедут сюда навсегда — новый сезон их не сбросит' : 'У игрока пока нет машин на Витрине славы'}</div></div>`;
  return head + `<div class="museum-grid hall-grid">${hall.map(c => { const d = CAR_BY_ID[c.id]; return d ? `<div class="car-card secret got"><span class="cls" style="background:${rc(d.r)}">${d.r}</span>
      ${carPic(d, false, c.paint)}<div class="name">${d.name}</div><div class="sub">сезон ${c.season || '—'}</div></div>` : ''; }).join('')}</div>`;
}

function renderMuseum() {
  const list = state.museum;
  const total = list.reduce((s, c) => s + carValue(c), 0);
  // Витрина славы: секретные машины прошлых сезонов (навсегда); в обновлении видна всегда — пустая с подсказкой
  let html = Rules.nextActive() || (state.hall || []).length ? hallHTML(state.hall || [], true) : '';
  html += `<div class="card museum-head">
      <div class="row"><b>${emo('🏛️', 20)} Витрина</b><span class="muted">${list.length}/${state.museumSlots}</span></div>
      <div class="muted small" style="margin-top:6px">Любимые машины на постаменте. Здесь они не ездят и не приносят доход, зато не занимают место в гараже. Твою витрину видят другие игроки — из рейтинга.</div>
    </div>
    ${list.length ? `<div class="section-h"><span>Экспонаты</span><span>${money(total)}</span></div>` : ''}
    <div class="museum-grid">`;
  for (const car of list) {
    const d = CAR_BY_ID[car.id];
    html += `<button class="exhibit" data-act="exhibit" data-uid="${car.uid}" style="--rc:${rc(d.r)}">
      <div class="spot"></div>
      <div class="ex-pic">${carPicOf(car)}</div>
      <div class="pedestal"></div>
      ${exPlate(car)}
      <div class="ex-name">${d.name}</div>
      <div class="ex-sub"><span class="dot" style="background:${rc(d.r)}"></span>${RARITIES[d.r].name} · ${carHp(car)} л.с.</div>
    </button>`;
  }
  for (let i = list.length; i < state.museumSlots; i++) {
    html += `<button class="exhibit empty" data-act="exhibit-add"><div>+ Выставить машину</div></button>`;
  }
  if (state.museumSlots < MUSEUM.maxSlots) {
    const price = museumSlotPrice();
    html += `<button class="exhibit empty buy" data-act="museum-buy" ${state.money >= price ? 'data-confirm="Ещё раз — купить"' : 'disabled'}>
      <div><div class="buy-plus">+</div><div>Место на витрине</div><div class="buy-price">${money(price)}</div></div></button>`;
  }
  return html + '</div>';
}

// номер под машиной на витрине
const exPlate = (car, big) => car.plate && typeof platesOn === 'function' && platesOn()
  ? `<div class="car-plate${big ? '' : ' tiny'}">${plateHTML(car.plate)}</div>` : '';

function showExhibit(uid) {
  const car = state.museum.find(c => c.uid === uid);
  if (!car) return;
  const d = CAR_BY_ID[car.id];
  openSheet(`${sheetNav('')}
    <div class="car-head">
      <div class="title">${d.name}</div>
      <div class="tags">${clsBadge(d.r)}<span class="chip">${emo(originOf(d).flag, 13)} ${originOf(d).name}</span><span class="chip">${emo('🏛️', 13)} на витрине</span></div>
    </div>
    <div class="exhibit-big" style="--rc:${rc(d.r)}"><div class="spot"></div>${carPicOf(car)}<div class="pedestal"></div></div>
    ${exPlate(car, true)}
    <div class="stats">
      <div class="stat"><div class="v">${carHp(car)}</div><div class="l">л.с.</div></div>
      <div class="stat"><div class="v">${money(carValue(car))}</div><div class="l">стоимость</div></div>
      <div class="stat"><div class="v">${Object.keys(car.parts || {}).length}/8</div><div class="l">тюнинг</div></div>
    </div>
    ${typeof carPlateRow === 'function' && platesOn() ? `<div class="list">${carPlateRow(car)}</div>` : ''}
    <button class="btn" data-act="museum-out" data-uid="${uid}" ${garageFull() ? 'disabled' : ''}>${garageFull() ? 'В гараже нет места' : 'Вернуть в гараж'}</button>
  `);
}

function showExhibitPicker() {
  if (museumFull()) return;
  const rows = [...state.cars].filter(c => !Rules.isBeta(c)).sort((a, b) => carValue(b) - carValue(a)).map(car => {
    const d = CAR_BY_ID[car.id];
    return `<button class="list-row" data-act="museum-in" data-uid="${car.uid}">
      <div class="opp-pic">${carPicOf(car)}</div>
      <div class="info"><div class="t">${d.name}</div><div class="sub">${RARITIES[d.r].name} · ${carHp(car)} л.с.</div></div>
      <div class="r">${CHEVRON_R}</div>
    </button>`;
  }).join('');
  openSheet(`${sheetNav('Выставить на витрину')}
    ${rows ? `<div class="list">${rows}</div>` : `<div class="card" style="text-align:center"><span class="muted">В гараже нет машин</span></div>`}
    <div class="muted small" style="margin:12px 16px">Машина переедет из гаража на витрину. Вернуть её можно в любой момент, если в гараже есть место.</div>`);
}

// ---------- нажатия ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act, uid } = el.dataset;
  if (act === 'paint') { haptic.tap(); showPaint(uid); }
  else if (act === 'paint-pick') { haptic.tick(); showPaint(uid, el.dataset.hex || null); }
  else if (act === 'paint-apply') applyPaint(uid);
  else if (act === 'museum-in') toMuseum(uid);
  else if (act === 'museum-out') fromMuseum(uid);
  else if (act === 'exhibit') { haptic.tap(); showExhibit(uid); }
  else if (act === 'exhibit-add') { haptic.tap(); showExhibitPicker(); }
  else if (act === 'museum-buy') buyMuseumSlot();
});

