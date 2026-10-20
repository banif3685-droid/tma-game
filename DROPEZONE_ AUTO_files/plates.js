// ===== Номера: Меню → «Номера» (Кейсы | Купить | Мои) и номер в карточке машины =====
// Пока только в локальном режиме (PLATES_LOCAL_ONLY): на сервере нужен общий список занятых номеров.

const platesOn = () => !PLATES_LOCAL_ONLY || MODE === 'local';
let plateView = 0;                                   // 0 — генерация, 1 — мои
let plateCase = 'pl_basic';
let plateDrop = null;                                // последний выпавший номер (показ под кейсом)

const plateInfo = k => Rules.plateInfo(k);

const plateCar = key => [...state.cars, ...state.museum].find(c => c.plate === key);

// табличка как настоящая: А 123 ВС | 77 RUS. key = null — пустая табличка;
// empty = true — ячейки под символы есть, но пустые (перед прокруткой).
// Большие таблички (big) объёмные: их можно наклонять пальцем, плёнка переливается.
// шрифт настоящих номеров (RoadNumbers, ГОСТ) — с релизным обновлением. В шрифте только латиница:
// буквы номера (кириллица в данных) показываем похожими латинскими — сами номера не меняются
const PL_LAT = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X' };
const plGost = () => typeof nextOn === 'function' && nextOn();
const plG = c => plGost() ? PL_LAT[c] || c : c;
function plateHTML(key, cls = '', empty = false) {
  const p = Rules.plateParse(key) || { l1: ' ', d: '   ', l23: '  ', reg: '  ' };
  const blank = !key || empty;
  const ch = (c, k) => `<span class="pc ${k}">${blank ? '' : plG(c)}</span>`;
  const plate = `<div class="plate ${cls}${blank ? ' blank' : ''}${plGost() ? ' gost' : ''}">
    <div class="pl-main">${ch(p.l1, 'l')}${[...p.d].map(c => ch(c, 'd')).join('')}${[...p.l23].map(c => ch(c, 'l')).join('')}</div>
    <div class="pl-reg"><div class="pl-rn">${[...p.reg].map(c => ch(c, 'r')).join('')}</div><div class="pl-rus">RUS<i class="pl-flag"></i></div></div>
    <div class="pl-sheen"></div>
  </div>`;
  return cls.includes('big') ? `<div class="plate3d">${plate}</div>` : plate;
}

// ---------- 3D: наклон пальцем, плёнка переливается; без касания — лёгкое покачивание ----------
(() => {
  let drag = null;
  const setTilt = (pl, rx, ry) => {
    pl.style.setProperty('--rx', rx.toFixed(1) + 'deg');
    pl.style.setProperty('--ry', ry.toFixed(1) + 'deg');
    pl.style.setProperty('--sx', (50 + ry * 2.2).toFixed(1) + '%');
    pl.style.setProperty('--sy', (50 - rx * 2.2).toFixed(1) + '%');
  };
  document.addEventListener('pointerdown', e => {
    const pl = e.target.closest('.plate3d .plate');
    if (!pl || pl.classList.contains('rolling')) return;
    drag = { pl, x: e.clientX, y: e.clientY, id: e.pointerId };
    pl.classList.add('dragging');
    try { pl.setPointerCapture(e.pointerId); } catch {}
  });
  document.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const clamp = v => Math.max(-38, Math.min(38, v));
    setTilt(drag.pl, clamp(-(e.clientY - drag.y) * 0.35), clamp((e.clientX - drag.x) * 0.35));
  });
  const end = e => {
    if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
    const pl = drag.pl;
    drag = null;
    pl.classList.remove('dragging');
    // плавно возвращается, и только потом снова начинает покачиваться
    pl.classList.add('settling');
    requestAnimationFrame(() => setTilt(pl, 0, 0));
    clearTimeout(pl._settle);
    pl._settle = setTimeout(() => pl.classList.remove('settling'), 1600);
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
})();

function plateInfoHTML(key) {
  const i = plateInfo(key);
  return `<div class="plate-info">
    <div>${clsBadge(i.rarity)}</div>
    <div class="pi-val">${money(i.value)}</div>
    <div class="muted small">${i.tags.length ? i.tags.join(' · ') : 'Обычный номер'}</div>
  </div>`;
}

// ---------- экран ----------
function renderPlates() {
  const tabs = segmented('pseg', plateView, 'Генерация', `Мои${state.plates.length ? ' · ' + state.plates.length : ''}`);
  return `${tabs}<div>${plateBody()}</div>`;
}
const plateBody = () => plateView === 0 ? renderPlateCases() : renderMyPlates();

// выбор региона (с релизом, только «Обычная» генерация): prefs.plateRegion; цена — Rules.plateRegionPrice
const plateRegionOn = cs => nextOn() && cs.id === PLATE_REGION_PICK.caseId;
const plateRegion = cs => plateRegionOn(cs) && prefs.plateRegion && Rules.plateRegionOk(cs, prefs.plateRegion) ? prefs.plateRegion : null;
const plateGenPrice = cs => plateRegion(cs) ? Rules.plateRegionPrice(plateRegion(cs)) : Rules.plateCasePrice(cs);
function plateRegionRows(q = '') {
  const cs = Rules.PLATE_CASE_BY_ID[PLATE_REGION_PICK.caseId], cur = plateRegion(cs);
  q = q.trim().toLowerCase();
  const list = Rules.plateRegions().filter(r => Rules.plateRegionPrice(r) > 0)
    .map(r => ({ r, name: Rules.plateRegionName(r), price: Rules.plateRegionPrice(r) }))
    .filter(x => !q || x.r.startsWith(q) || x.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.r.length - b.r.length || a.r.localeCompare(b.r));
  const any = !q ? `<button class="list-row" data-act="pl-region-set" data-r="">
      <div class="info"><div class="t">Любой регион</div><div class="sub">случайный, как обычно</div></div>
      <div class="r">${money(Rules.plateCasePrice(cs))}<span class="check">${cur ? '' : '✓'}</span></div></button>` : '';
  return any + list.map(x => `<button class="list-row" data-act="pl-region-set" data-r="${x.r}">
      <div class="ic"><span class="pl-reg-code">${x.r}</span></div><div class="info"><div class="t">${esc(x.name)}</div></div>
      <div class="r">${money(x.price)}<span class="check">${x.r === cur ? '✓' : ''}</span></div></button>`).join('')
    || '<div class="empty-state small">Ничего не нашлось</div>';
}
function showPlateRegions() {
  openSheet(`${sheetNav('Регион номера')}
    <input id="pl-reg-q" class="admin-input" type="search" inputmode="search" autocomplete="off" placeholder="Код или название, например 77 или Татарстан" style="width:100%;margin-bottom:10px">
    <div class="muted small" style="margin:0 4px 10px">Только в «Обычной» генерации. Цена зависит от региона — Москва дороже</div>
    <div class="list" id="pl-reg-list">${plateRegionRows()}</div>`);
}
document.addEventListener('input', e => {
  if (e.target.id === 'pl-reg-q') $('#pl-reg-list').innerHTML = plateRegionRows(e.target.value);
});

function renderPlateCases() {
  const cs = Rules.PLATE_CASE_BY_ID[plateCase];
  const drop = plateDrop;
  const rarity = drop ? plateInfo(drop).rarity : null;
  const rows = PLATE_CASES.map(c => `<button class="list-row" data-act="pl-case" data-id="${c.id}">
      <div class="ic">${emo(c.icon, 28)}</div>
      <div class="info"><div class="t">${c.name}</div><div class="s">${RARITY_ORDER.filter(r => Rules.plateDrops(c)[r]).map(r =>
        `<span class="chip"><span class="dot" style="background:${rc(r)}"></span>${pct(Rules.plateDrops(c)[r] * 100)}</span>`).join('')}</div></div>
      <div class="r">${money(plateGenPrice(c))}<span class="check">${c.id === plateCase ? '✓' : ''}</span></div>
    </button>`).join('');
  return `<div class="plate-stage${drop ? ' lit' : ''}" id="pl-stage" style="--rc:${rarity ? rc(rarity) : 'transparent'}">
      ${plateHTML(drop, 'big')}
    </div>
    <div id="pl-result">${drop ? plateResultHTML(drop) : ''}</div>
    ${Rules.plateRoom(state, now()).full
      ? `<button class="btn" disabled>${Rules.nextActive() ? 'Запас номеров полон' : `Номеров максимум ${Rules.plateLimit(state)}`}</button>
         <div class="note">${Rules.nextActive() ? `В запасе — ${Rules.plateStoreCap(state, now())} номеров (номера на машинах не считаются). Повесь номер на машину, продай лишний или докупи место в Магазине` : `Лимит — сколько у тебя машин + ${PLATE_LIMIT_EXTRA}. Продай лишние номера или добавь машин`}</div>`
      : plateGift(cs) ? `<button class="btn gold" data-act="pl-open">${emo('🎁', 18)} Сгенерировать бесплатно</button>
         <div class="note">${plateGift(cs).note ? esc(plateGift(cs).note) : 'Подарок от DROPEZONE'}</div>`
      : `<button class="btn" data-act="pl-open" ${state.money < plateGenPrice(cs) ? 'disabled' : ''}>${drop ? 'Ещё раз' : 'Сгенерировать'} · ${cs.name} · ${money(plateGenPrice(cs))}</button>
    ${state.money < plateGenPrice(cs) ? `<div class="note">Не хватает ${money(plateGenPrice(cs) - state.money)}</div>` : ''}`}
    ${plateRegionOn(cs) && !plateGift(cs) ? `<div class="list" style="margin-top:12px"><button class="list-row" data-act="pl-region">
      <div class="ic">${emo('📍', 24)}</div><div class="info"><div class="t">Регион</div>
      <div class="sub">${plateRegion(cs) ? `${plateRegion(cs)} · ${esc(Rules.plateRegionName(plateRegion(cs)))}` : 'любой — случайный'}</div></div><div class="r">›</div></button></div>` : ''}
    ${nextOn() ? `<div class="list" style="margin-top:12px"><div class="list-row setting static"><div class="info"><div class="t">Быстрое открытие</div>
      <div class="sub">Все символы сразу — и для кейсов</div></div><button class="switch${prefs.fastOpen ? ' on' : ''}" data-act="fast" aria-label="Быстрое открытие"></button></div></div>` : ''}
    <div class="section-h">Генерация номера</div>
    <div class="list">${rows}</div>
    <div class="muted small" style="margin:10px 16px">Каждый номер существует в одном экземпляре. Номер на машине прибавляет свою цену к стоимости машины — и к доходу.</div>`;
}

function plateResultHTML(key) {
  const on = plateCar(key);
  return `${plateInfoHTML(key)}
    <div class="btn-row">
      <button class="btn gray" data-act="pl-attach" data-plate="${key}">${on ? 'Переставить' : 'Повесить на машину'}</button>
      <button class="btn danger" data-act="pl-sell" data-plate="${key}" data-confirm="Нажми ещё раз">Продать · ${money(plateInfo(key).value)}</button>
    </div>`;
}

function renderMyPlates() {
  if (!state.plates.length) {
    return `<div class="card empty-state">${emo('🚘', 52)}<h3>Пока нет номеров</h3>
      <p class="muted">Сгенерируй номер во вкладке «Генерация»</p></div>`;
  }
  const list = [...state.plates].sort((a, b) => plateInfo(b).value - plateInfo(a).value);
  const total = list.reduce((s, k) => s + plateInfo(k).value, 0);
  return `<div class="section-h"><span>${Rules.nextActive() ? `Номера ${list.length} · в запасе ${Rules.platesSpare(state)}/${Rules.plateStoreCap(state, now())}` : `Номера ${list.length}/${Rules.plateLimit(state)}`}</span><span>${money(total)}</span></div>
    <div class="list">${list.map(k => {
      const i = plateInfo(k), car = plateCar(k);
      return `<button class="list-row pl-row" data-act="pl-open-one" data-plate="${k}">
        ${plateHTML(k, 'mini')}
        <div class="info"><div class="t" style="color:${rc(i.rarity)}">${RARITIES[i.rarity].name}</div>
          <div class="sub">${car ? `на ${CAR_BY_ID[car.id].name}` : 'не установлен'}</div></div>
        <div class="r">${money(i.value)}${CHEVRON_R}</div></button>`;
    }).join('')}</div>`;
}

// ---------- шторки ----------
function showPlate(key) {
  const car = plateCar(key);
  openSheet(`${sheetNav('Номер')}
    <div class="plate-stage lit sheet" style="--rc:${rc(plateInfo(key).rarity)}">${plateHTML(key, 'big')}</div>
    ${plateInfoHTML(key)}
    <div class="list">
      ${car ? `<div class="list-row static"><div class="ic">${emo('🚗', 22)}</div><div class="info"><div class="t">${CAR_BY_ID[car.id].name}</div><div class="sub">Номер установлен</div></div>
        <button class="pill gray" data-act="pl-remove" data-uid="${car.uid}">Снять</button></div>` : ''}
    </div>
    <div class="btn-row" style="margin-top:12px">
      <button class="btn gray" data-act="pl-attach" data-plate="${key}">${car ? 'Переставить' : 'Повесить на машину'}</button>
      <button class="btn danger" data-act="pl-sell" data-plate="${key}" data-confirm="Нажми ещё раз">Продать · ${money(plateInfo(key).value)}</button>
    </div>
    ${typeof nextOn === 'function' && nextOn() && !car ? `<button class="btn gray" style="margin-top:10px" data-act="mk-sell-plate" data-plate="${key}">${emo('🏪', 18)} На торговую площадку</button>` : ''}`);
}

// выбрать машину для номера
function showPlateCars(key) {
  if (!state.cars.length) { toast('В гараже нет машин'); return; }
  const rows = [...state.cars].sort((a, b) => carValue(b) - carValue(a)).map(c => `<button class="list-row" data-act="pl-set" data-plate="${key}" data-uid="${c.uid}">
      <div class="ic car-ic">${carPicOf(c)}</div>
      <div class="info"><div class="t">${CAR_BY_ID[c.id].name}</div><div class="sub">${c.plate ? 'сейчас: ' + c.plate.replace('|', ' ') : 'без номера'}</div></div>
      <div class="r">${CHEVRON_R}</div></button>`).join('');
  openSheet(`${sheetNav('На какую машину?', { act: 'pl-open-one', attrs: `data-plate="${key}"`, label: 'Назад' })}
    <div class="plate-stage lit sheet" style="--rc:${rc(plateInfo(key).rarity)}">${plateHTML(key, 'big')}</div>
    <div class="muted small" style="margin:0 16px 10px">Цена номера прибавится к стоимости машины и её доходу. Старый номер машины вернётся к тебе.</div>
    <div class="list">${rows}</div>`);
}

// номер из карточки машины: выбрать из своих
const backToCar = uid => state.museum.some(c => c.uid === uid) ? showExhibit(uid) : showCar(uid);

function showCarPlates(uid) {
  const car = [...state.cars, ...state.museum].find(c => c.uid === uid);
  if (!car) return;
  const list = [...state.plates].sort((a, b) => plateInfo(b).value - plateInfo(a).value);
  const rows = list.map(k => {
    const on = plateCar(k);
    return `<button class="list-row pl-row" data-act="pl-set" data-plate="${k}" data-uid="${uid}" ${on === car ? 'disabled' : ''}>
      ${plateHTML(k, 'mini')}
      <div class="info"><div class="t" style="color:${rc(plateInfo(k).rarity)}">${money(plateInfo(k).value)}</div>
        <div class="sub">${on === car ? 'стоит на этой машине' : on ? `на ${CAR_BY_ID[on.id].name}` : 'свободен'}</div></div></button>`;
  }).join('');
  const back = state.museum.includes(car) ? 'exhibit' : 'car';
  openSheet(`${sheetNav('Номер', { act: back, attrs: `data-uid="${uid}"`, label: 'Назад' })}
    ${car.plate ? `<div class="plate-stage lit sheet" style="--rc:${rc(plateInfo(car.plate).rarity)}">${plateHTML(car.plate, 'big')}</div>
      <button class="btn gray" data-act="pl-remove" data-uid="${uid}">Снять номер</button>` : ''}
    <div class="section-h">Мои номера</div>
    ${rows ? `<div class="list">${rows}</div>` : `<div class="card" style="text-align:center"><span class="muted">Номеров нет — они в Меню → «Номера»</span>
      <button class="btn gray" style="margin-top:12px" data-act="pl-goto">К номерам</button></div>`}`);
}

// строка «Номер» в карточке машины
function carPlateRow(car) {
  if (!platesOn()) return '';
  return `<button class="list-row" data-act="pl-car" data-uid="${car.uid}">
    <div class="ic">${emo('🚘', 24)}</div><div class="info"><div class="t">Номер</div>
      ${car.plate ? `<div class="sub">+${money(plateInfo(car.plate).value)} к стоимости</div>` : ''}</div>
    <div class="r">${car.plate ? plateHTML(car.plate, 'mini') : 'Нет'}${CHEVRON_R}</div></button>`;
}

// ---------- открытие кейса: каждая буква и цифра прокручивается по очереди ----------
// Барабан как в будильнике iPhone: символы на цилиндре, соседние уходят вверх/вниз с наклоном и тают.
const REEL_LEN = 16;
const easeOut = t => 1 - Math.pow(1 - t, 4);

function spinDrum(cell, chars, ms) {
  cell.innerHTML = `<span class="drum">${chars.map(c => `<b>${c}</b>`).join('')}</span>`;
  const items = [...cell.querySelectorAll('.drum b')];
  const last = chars.length - 1, R = 1.05, STEP = 24;   // радиус цилиндра (em) и угол между символами
  let lastIdx = -1;
  return new Promise(done => {
    const t0 = performance.now();
    const frame = t => {
      const k = Math.min(1, (t - t0) / ms);
      const pos = easeOut(k) * last;
      items.forEach((it, j) => {
        const a = (j - pos) * STEP;
        // виден только символ у центра — соседние полностью исчезают
        if (Math.abs(a) > STEP * 0.6) { it.style.opacity = 0; return; }
        const rad = a * Math.PI / 180;
        it.style.opacity = (1 - Math.abs(a) / (STEP * 0.6)) ** 1.5;
        it.style.transform = `translateY(${(R * Math.sin(rad)).toFixed(3)}em) translateZ(${(R * (Math.cos(rad) - 1)).toFixed(3)}em) rotateX(${(-a).toFixed(1)}deg)`;
      });
      const idx = Math.round(pos);
      if (idx !== lastIdx && k > 0.55) { lastIdx = idx; haptic.tick(); }   // щелчки, когда барабан замедляется
      if (k < 1) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });
}
// быстрое открытие (то же, что у кейсов) — с релизным обновлением: все барабаны сразу, коротко
const plateFastOn = () => nextOn() && prefs.fastOpen;
const plateGift = cs => (state.gifts || []).find(g => g.kind === 'plate' && g.caseId === cs.id);
async function openPlateCase() {
  const cs = Rules.PLATE_CASE_BY_ID[plateCase];
  if (spinning || busy) return;
  busy = true;
  const gift = plateGift(cs);
  const r = gift ? await api('giftOpen', { id: gift.id }) : await api('openPlateCase', plateRegion(cs) ? { caseId: cs.id, region: plateRegion(cs) } : { caseId: cs.id });
  if (gift && typeof updateIsland === 'function') updateIsland();
  busy = false;
  if (!r) return;
  const key = r.plate;
  const info = plateInfo(key);
  updateBalance(true);
  spinning = true;
  document.body.classList.add('spinning');
  plateDrop = null;
  $('#pl-result').innerHTML = '';
  const btn = document.querySelector('[data-act="pl-open"]');
  if (btn) btn.disabled = true;

  const stage = $('#pl-stage');
  stage.classList.remove('lit');
  // пустая табличка с ячейками под символы выпавшего номера
  stage.innerHTML = plateHTML(key, 'big', true);
  const plate = stage.querySelector('.plate');
  plate.classList.add('rolling');
  const cells = [...stage.querySelectorAll('.pc')];
  const p = Rules.plateParse(key);
  const finals = [p.l1, ...p.d, ...p.l23, ...p.reg];
  const rndOf = cell => cell.classList.contains('l') ? PLATE_LETTERS[Math.floor(Math.random() * PLATE_LETTERS.length)] : String(Math.floor(Math.random() * 10));
  await nextFrame();
  // барабаны запускаются по очереди, каждый плавно замедляется на своём символе (быстро — все сразу, коротко)
  const fast = plateFastOn();
  const spins = cells.map((cell, i) => wait(fast ? i * 25 : i * 300).then(() =>
    spinDrum(cell, [...Array.from({ length: fast ? 6 : REEL_LEN }, () => rndOf(cell)), finals[i]].map(plG), fast ? 550 : 1300)));
  await Promise.all(spins);
  await wait(fast ? 60 : 200);
  // символы «проявляются» в выдавленный шрифт настоящего номера
  cells.forEach((cell, i) => { cell.innerHTML = `<span class="real" style="--i:${i}">${plG(finals[i])}</span>`; });
  plate.classList.remove('rolling', 'blank');
  plate.classList.add('stamped');
  await wait(fast ? 250 : 650);
  // номер собран: неон цвета редкости и вибрация по силе редкости
  stage.style.setProperty('--rc', rc(info.rarity));
  stage.classList.add('lit', 'flash');
  await plateHaptic(info.rarity);
  plateDrop = key;
  spinning = false;
  document.body.classList.remove('spinning');
  $('#menu-body').innerHTML = renderPlates();
  updatePlateSeg();
}

async function plateHaptic(r) {
  const n = { D: 0, C: 1, B: 2, A: 3, S: 5 }[r];
  if (!n) { haptic.tap(); return; }
  if (r === 'C') { haptic.ok(); return; }
  for (let i = 0; i < n; i++) { haptic.heavy(); await wait(110); }
  if (r === 'S') haptic.ok();
}

const updatePlateSeg = () => {
  const b = document.querySelector('#pseg button[data-v="1"]');
  if (b) b.textContent = `Мои${state.plates.length ? ' · ' + state.plates.length : ''}`;
};
const rerenderPlates = () => {
  if (tab === 'menu' && menuView === 'plates' && $('#menu-body')) {
    const body = $('#pseg')?.nextElementSibling;
    if (body) body.innerHTML = plateBody(); else $('#menu-body').innerHTML = renderPlates();
    updatePlateSeg();
  }
};

// ---------- нажатия ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act^="pl-"], [data-act="pseg"]');
  if (!el || el.disabled) return;
  const { act, plate, uid } = el.dataset;
  switch (act) {
    case 'pseg':
      plateView = +el.dataset.v;
      switchSegment('pseg', plateView, plateBody());
      break;
    case 'pl-case': plateCase = el.dataset.id; haptic.tick(); rerenderPlates(); break;
    case 'pl-open': openPlateCase(); break;
    case 'pl-region': haptic.tap(); showPlateRegions(); break;
    case 'pl-region-set': prefs.plateRegion = el.dataset.r || null; savePrefs(); haptic.tick(); closeSheet(); rerenderPlates(); break;
    case 'pl-open-one': haptic.tap(); showPlate(plate); break;
    case 'pl-attach': haptic.tap(); showPlateCars(plate); break;
    case 'pl-car': haptic.tap(); showCarPlates(uid); break;
    case 'pl-goto': closeSheet(); switchTab('menu', 'plates'); break;
    case 'pl-set':
      if (await api('setPlate', { plate, uid })) {
        haptic.ok();
        toast(`Номер ${plate.replace('|', ' ')} на ${CAR_BY_ID[[...state.cars, ...state.museum].find(c => c.uid === uid).id].name}`);
        backToCar(uid);
        rerenderPlates();
      }
      break;
    case 'pl-remove':
      if (await api('removePlate', { uid })) { haptic.tap(); toast('Номер снят'); backToCar(uid); rerenderPlates(); }
      break;
    case 'pl-sell': {
      const r = await api('sellPlate', { plate });
      if (!r) break;
      haptic.ok();
      updateBalance(true);
      toast(`Номер продан · +${money(r.value)}`);
      if (plateDrop === plate) plateDrop = null;
      if (document.body.classList.contains('sheet-open')) closeSheet();
      rerenderPlates();
      break;
    }
  }
});
