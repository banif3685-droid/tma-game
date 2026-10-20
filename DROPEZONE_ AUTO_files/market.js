// ===== Торговая площадка: Меню → «Торговая площадка» (Рынок | Мои лоты) =====
// Тестовая версия (в браузере): другие продавцы и покупатели — боты.
// С сервером: лоты всех игроков — GET /market (фильтр, сортировка, поиск — на сервере), купить — marketBuy,
// ставка — marketBid (замораживается, перебили — вернётся), итог аукциона и деньги продавцу приходят сами (островок + бот).

let mkView = 0;                                     // 0 — рынок, 1 — мои лоты
let mkKind = 'all';                                 // all | car | part | plate
let mkSort = 'new';                                 // new | cheap | dear | deal
let mkQuery = '';
let mkDraft = null;                                 // выставляемая вещь: { kind, uid | slot,t,n | plate, pct }

const MK_KINDS = [['all', 'Все'], ['auc', 'Аукционы'], ['car', 'Машины'], ['part', 'Детали'], ['plate', 'Номера']];
const MK_SORTS = [['new', 'Новые'], ['cheap', 'Дешевле'], ['dear', 'Дороже'], ['deal', 'Выгодные']];

// ---------- лоты ботов (тестовая версия): набор меняется каждые 10 минут ----------
const MK_WINDOW = 10 * 60e3;
const mkBought = (() => { try { return new Set(JSON.parse(localStorage.getItem('dz_mk_bought') || '[]')); } catch { return new Set(); } })();
const saveBought = () => { try { localStorage.setItem('dz_mk_bought', JSON.stringify([...mkBought].slice(-300))); } catch {} };
function seeded(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
let botCache = { w: null, lots: [] };
function botLots() {
  const w = Math.floor(now() / MK_WINDOW);
  if (botCache.w !== w) {
    const rnd = seeded(w * 7919), pick = a => a[Math.floor(rnd() * a.length)];
    // дешёвых машин на рынке больше, гиперкаров — редкость
    const byR = { D: 30, C: 26, B: 20, A: 14, S: 10 };
    const carPool = Rules.baseCars().flatMap(c => Array((byR[c.r] || 5)).fill(c));
    const cars = carPool, tiers = ['D', 'D', 'D', 'C', 'C', 'B', 'B', 'A', 'S'];
    const lots = [];
    for (let i = 0; i < 30; i++) {
      const r = rnd(), id = `b${w}_${i}`, lot = { id, seller: pick(BOT_NAMES), at: (w * MK_WINDOW) - Math.floor(rnd() * 6 * 3600e3) };
      if (r < 0.45) {
        const parts = {};
        const carDef = pick(cars);
        Rules.carSlots({ id: carDef.id }).forEach(s => { if (rnd() < 0.35) parts[s.id] = pick(tiers); });
        lot.kind = 'car';
        lot.car = { id: carDef.id, parts };
        if (rnd() < 0.25) lot.car.plate = Rules.genPlate(rnd, pick(['D', 'C', 'C', 'B', 'A']), () => false);
      } else if (r < 0.8) {
        lot.kind = 'part';
        Object.assign(lot, { slot: pick(Rules.allSlots()).id, t: pick(tiers), n: rnd() < 0.7 ? 1 : 2 + Math.floor(rnd() * 4) });
      } else {
        lot.kind = 'plate';
        lot.plate = Rules.genPlate(rnd, pick(['D', 'C', 'B', 'B', 'A', 'S']), () => false);
      }
      lot.value = Rules.lotValue(lot);
      const k = rnd() < 0.18 ? 0.7 + rnd() * 0.25 : 0.95 + rnd() * 0.75;
      lot.price = Math.max(1000, Math.round(lot.value * k / 1000) * 1000);
      lot.until = lot.at + MARKET.ttlMs;
      // каждый четвёртый лот бота — аукцион: старт 50–90% стоимости, иногда «купить сразу»
      if (rnd() < 0.25) {
        const hours = pick(MARKET_AUC.hours);
        lot.at = w * MK_WINDOW - Math.floor(rnd() * Math.min(hours * 3600e3 * 0.7, MK_WINDOW * 3));
        lot.until = lot.at + hours * 3600e3;
        lot.price = Math.max(1000, Math.round(lot.value * (0.5 + rnd() * 0.4) / 1000) * 1000);
        lot.auc = { start: lot.price, buyout: rnd() < 0.5 ? Math.round(lot.value * (1.3 + rnd() * 0.6) / 1000) * 1000 : null, hours,
          botMax: Math.round(lot.price * (1.1 + rnd() * 0.9)) };
      }
      lots.push(lot);
    }
    botCache = { w, lots };
  }
  return [...botCache.lots, ...mkAucKept()].filter(l => !mkBought.has(l.id) && !(l.kind === 'plate' && state.plates.includes(l.plate))
    && !(l.car?.plate && state.plates.includes(l.car.plate)) && (!l.auc || mkAucLive(l) || mkAucMine(l)));
}

// ---------- лоты с сервера ----------
const mkSrv = { lots: null, at: 0, loading: false, key: '' };
const mkLots = () => MODE === 'server' ? mkSrv.lots || [] : botLots();
async function mkLoad(force) {
  if (MODE !== 'server' || mkSrv.loading) return;
  const key = `${mkKind}|${mkSort}|${mkQuery.trim()}`;
  if (!force && key === mkSrv.key && Date.now() - mkSrv.at < 20e3) return;
  mkSrv.loading = true;
  try {
    const d = await (await fetch(`${API}/market?kind=${mkKind}&sort=${mkSort}&q=${encodeURIComponent(mkQuery.trim())}`, { headers: authHeaders() })).json();
    if (Array.isArray(d.lots)) { mkSrv.lots = d.lots; mkSrv.key = key; }
    if (d.now) clockOffset = d.now - Date.now();
  } catch {}
  mkSrv.at = Date.now();
  mkSrv.loading = false;
  if (tab !== 'menu' || menuView !== 'market' || spinning) return;
  if ($('#mk-list')) $('#mk-list').innerHTML = mkListHTML();
  if (mkAucOpen && document.body.classList.contains('sheet-open') && $('#sheet-body .mk-auc-now')) showLot(mkAucOpen);
}
let mkSearchT = 0;

// ---------- аукционы ботов (тест): торги идут в браузере, моя ставка замораживается (aucBid/aucRefund) ----------
// состояние торгов — localStorage dz_mk_aucs: { [id]: { lot, bid, bids, bidder, until, nextAt, myBid, done, claimed } }
let mkAucs = (() => { try { return JSON.parse(localStorage.getItem('dz_mk_aucs')) || {}; } catch { return {}; } })();
const saveMkAucs = () => { try { localStorage.setItem('dz_mk_aucs', JSON.stringify(mkAucs)); } catch {} };
// чужие торги, в которых я не участвовал, через час после конца забываются
for (const [id, a] of Object.entries(mkAucs)) if ((!a.mine || a.claimed) && a.until < Date.now() - 3600e3) delete mkAucs[id];
// лоты, в которых я участвовал, остаются видны и после смены набора ботов
const mkAucKept = () => Object.values(mkAucs).filter(a => a.myBid || a.mine).map(a => a.lot).filter(l => !botCache.lots.some(x => x.id === l.id));
function mkAucSt(l) {
  if (MODE === 'server') {   // торги ведёт сервер: лидер, ставка, срок — из лота
    const lead = !!l.auc.leader;
    return { lot: l, bid: l.auc.bid, bids: l.auc.bids, bidder: lead ? 'me' : l.auc.bidder, until: l.until, done: l.until <= now(), myBid: lead ? l.auc.bid : 0 };
  }
  let a = mkAucs[l.id];
  if (!a) a = mkAucs[l.id] = { lot: l, bid: 0, bids: 0, bidder: null, until: l.until, nextAt: l.at + Math.round((l.until - l.at) * 0.08), myBid: 0 };
  mkAucSim(a);
  return a;
}
const mkAucLive = l => mkAucSt(l).until > now() && !mkAucSt(l).done;
const mkAucMine = l => { const a = mkAucs[l.id]; return a && (a.myBid || a.mine) && !a.claimed; };
const mkAucLeader = a => a.bidder === 'me';
const mkAucNext = a => a.bids ? Math.ceil(a.bid * (1 + MARKET_AUC.stepK) / 1000) * 1000 : a.lot.auc.start;
// боты перебивают ставки до своего максимума; ставка в последние 2 мин продлевает торги
function mkAucSim(a) {
  const t = now(), l = a.lot, botMax = l.auc.botMax;
  let changed = false;
  while (!a.done && a.nextAt && a.nextAt <= t && a.nextAt < a.until) {
    const next = mkAucNext(a);
    if (next > botMax) { a.nextAt = 0; break; }
    if (mkAucLeader(a)) { a.refund = (a.refund || 0) + a.myBid; a.myBid = 0; a.outbid = true; }
    a.bid = next; a.bids++; a.bidder = BOT_NAMES[(a.bids * 7 + l.id.length) % BOT_NAMES.length];
    if (a.until - a.nextAt < MARKET_AUC.extendMs) a.until = a.nextAt + MARKET_AUC.extendMs;
    a.nextAt += Math.round((l.until - l.at) * (0.05 + Math.random() * 0.15));
    changed = true;
  }
  if (!a.done && t >= a.until) { a.done = true; changed = true; }
  if (changed) saveMkAucs();
}
function mkAucMyBid(a) {
  return a.myBid ? `<div class="card auc-lead">${emo(mkAucLeader(a) ? '🏆' : '😬', 20)} ${mkAucLeader(a) ? `Ты лидер — ставка ${money(a.myBid)} заморожена. Перебьют — деньги вернутся` : 'Тебя перебили'}</div>` : '';
}

// ---------- как показать вещь ----------
function lotName(l) {
  if (l.kind === 'car') return CAR_BY_ID[l.car.id].name;
  if (l.kind === 'part') return `${partName(l.slot, l.t)}${l.n > 1 ? ` ×${l.n}` : ''}`;
  return 'Номер';
}
function lotSub(l) {
  if (l.kind === 'car') {
    const n = Object.keys(l.car.parts || {}).length;
    return `${Rules.carHp(l.car)} л.с.${n ? ` · деталей ${n}` : ''}${l.car.plate ? ' · с номером' : ''}`;
  }
  if (l.kind === 'part') return `${l.t} · ${PART_TIERS[l.t].name}`;
  const i = plateInfo(l.plate);
  return i.tags.length ? i.tags.join(' · ') : 'Обычный номер';
}
function lotPic(l) {
  if (l.kind === 'car') return `<div class="mk-pic">${carPic(CAR_BY_ID[l.car.id])}</div>`;
  if (l.kind === 'part') return `<div class="ic part-ic" style="--rc:${rc(l.t)}">${partPic(l.slot)}</div>`;
  return `<div class="mk-pic plate-pic">${plateHTML(l.plate, 'mini')}</div>`;
}
const lotRarity = l => l.kind === 'car' ? CAR_BY_ID[l.car.id].r : l.kind === 'part' ? l.t : plateInfo(l.plate).rarity;
// цена относительно стоимости: −20% — выгодно (зелёный), +40% — дорого
function lotDelta(l) {
  const d = Math.round((l.price / l.value - 1) * 100);
  if (Math.abs(d) < 3) return '<span class="mk-d">по стоимости</span>';
  return `<span class="mk-d ${d < 0 ? 'good' : 'bad'}">${d > 0 ? '+' : '−'}${Math.abs(d)}%</span>`;
}
const leftText = ms => ms <= 0 ? 'время вышло' : ms < 3600e3 ? `${Math.ceil(ms / 60e3)} мин` : `${Math.floor(ms / 3600e3)} ч ${Math.floor(ms % 3600e3 / 60e3)} мин`;

function lotRow(l, act = 'mk-lot') {
  return `<button class="list-row mk-row" data-act="${act}" data-id="${l.id}" style="--rc:${rc(lotRarity(l))}">
    ${lotPic(l)}
    <div class="info"><div class="t">${lotName(l)}</div><div class="sub">${lotSub(l)}</div>
      ${l.kind === 'car' && l.car.plate ? `<div class="mk-plate">${plateHTML(l.car.plate, 'mini')}</div>` : ''}</div>
    <div class="r col"><b>${money(l.price)}</b>${lotDelta(l)}</div>
  </button>`;
}

// квадратная плитка лота на рынке (по 2 в ряд)
function lotCard(l, i) {
  if (l.auc) {
    const a = mkAucSt(l);
    const pic = l.kind === 'car' ? carPic(CAR_BY_ID[l.car.id]) : l.kind === 'part' ? partPic(l.slot) : plateHTML(l.plate, 'mini');
    return `<button class="mk-card auc k-${l.kind}" data-act="mk-lot" data-id="${l.id}" style="--rc:${rc(lotRarity(l))};--i:${Math.min(i, 12)}">
      <span class="mk-auc-tag">${emo('🔨', 12)} Аукцион</span>
      <div class="mk-card-pic">${pic}</div>
      <div class="mk-card-t">${l.kind === 'plate' ? (plateInfo(l.plate).tags[0] || 'Номер') : lotName(l)}</div>
      <div class="mk-card-s">${a.done ? 'торги окончены' : `ещё <span data-mk-left="${l.id}">${leftHMS(a.until - now())}</span>`}${a.myBid ? (mkAucLeader(a) ? ' · ты лидер' : '') : ''}</div>
      <div class="mk-card-p"><b>${money(a.bids ? a.bid : l.auc.start)}</b><span class="mk-d">${a.bids ? `${a.bids} ставок` : 'старт'}</span></div>
    </button>`;
  }
  const pic = l.kind === 'car' ? carPic(CAR_BY_ID[l.car.id]) : l.kind === 'part' ? partPic(l.slot) : plateHTML(l.plate, 'mini');
  return `<button class="mk-card k-${l.kind}" data-act="mk-lot" data-id="${l.id}" style="--rc:${rc(lotRarity(l))};--i:${Math.min(i, 12)}">
    <span class="mk-dot"></span>
    <div class="mk-card-pic">${pic}</div>
    ${l.kind === 'car' && l.car.plate ? `<div class="mk-card-plate">${plateHTML(l.car.plate, 'mini')}</div>` : ''}
    <div class="mk-card-t">${l.kind === 'plate' ? (plateInfo(l.plate).tags[0] || 'Номер') : lotName(l)}</div>
    <div class="mk-card-s">${l.kind === 'plate' ? clsBadge(plateInfo(l.plate).rarity) : lotSub(l)}</div>
    <div class="mk-card-p"><b>${money(l.price)}</b>${lotDelta(l)}</div>
  </button>`;
}

// ---------- экран ----------
function renderMarket() {
  const active = state.lots.length;
  return `${segmented('mseg', mkView, 'Рынок', `Мои лоты${active ? ' · ' + active : ''}`)}<div>${mkBody()}</div>`;
}
const mkBody = () => mkView === 0 ? renderMkMarket() : renderMkMine();

function renderMkMarket() {
  return `<div class="mk-filters">
      <input id="mk-search" class="promo-input mk-search" placeholder="Поиск: BMW, турбина, 777…" value="${esc(mkQuery)}" autocomplete="off" spellcheck="false">
      <div class="mk-chips">${MK_KINDS.map(([id, n]) => `<button class="${mkKind === id ? 'on' : ''}" data-act="mk-kind" data-id="${id}">${n}</button>`).join('')}</div>
      <div class="mk-chips sm">${MK_SORTS.map(([id, n]) => `<button class="${mkSort === id ? 'on' : ''}" data-act="mk-sort" data-id="${id}">${n}</button>`).join('')}</div>
    </div>
    <div id="mk-list">${mkListHTML()}</div>`;
}

function mkListHTML() {
  const q = mkQuery.trim().toLowerCase();
  if (MODE === 'server') { mkLoad(); if (!mkSrv.lots) return `<div class="card empty-state"><div class="muted">Загружаем лоты…</div></div>`; }
  let list = mkLots().filter(l => mkKind === 'all' || (mkKind === 'auc' ? !!l.auc : l.kind === mkKind));
  if (q) list = list.filter(l => `${lotName(l)} ${lotSub(l)} ${l.plate || l.car?.plate || ''} ${l.seller}`.toLowerCase().replace(/\|/g, ' ').includes(q));
  const cur = l => l.auc ? (mkAucSt(l).bid || l.auc.start) : l.price;
  const sorts = { new: (a, b) => b.at - a.at, cheap: (a, b) => cur(a) - cur(b), dear: (a, b) => cur(b) - cur(a), deal: (a, b) => cur(a) / a.value - cur(b) / b.value };
  list.sort(sorts[mkSort]);
  if (!list.length) return `<div class="card empty-state"><div class="muted">${MODE === 'server' && !q && mkKind === 'all' ? 'Пока лотов нет — выставь свои в «Мои лоты»' : 'Ничего не нашлось'}</div></div>`;
  return `<div class="mk-grid">${list.map((l, i) => lotCard(l, i)).join('')}</div>
    ${MODE === 'local' ? '<div class="muted small" style="margin:12px 16px">Тестовая версия: продавцы — боты, лоты обновляются каждые 10 минут.</div>' : ''}`;
}

function renderMkMine() {
  const t = now(), lim = Rules.marketLimit(state, t);
  const act = state.lots.filter(l => l.until > t), done = state.lots.filter(l => l.until <= t);
  const rows = l => l.auc ? `<div class="list-row static mk-row" style="--rc:${rc(lotRarity(l))}">
      ${lotPic(l)}
      <div class="info"><div class="t">${emo('🔨', 13)} ${lotName(l)}</div>
        <div class="sub">${l.until > t ? `${l.auc.bids ? `${l.auc.bids} ставок · лидер ${esc(l.auc.bidder)}` : 'ставок пока нет'} · ещё <span data-mk-left="${l.id}">${leftHMS(l.until - t)}</span>` : 'Ставок не было — забери вещь'}
          ${l.auc.buyout ? ` · выкуп ${money(l.auc.buyout)}` : ''}</div></div>
      <div class="r col"><b>${money(l.auc.bids ? l.auc.bid : l.auc.start)}</b>
        ${l.until > t && l.auc.bids ? '<span class="mk-d good">идут торги</span>'
          : `<button class="pill gray" data-act="mk-cancel" data-id="${l.id}" ${l.until > t ? 'data-confirm="Снять?"' : ''}>${l.until > t ? 'Снять' : 'Забрать'}</button>`}</div>
    </div>` : `<div class="list-row static mk-row" style="--rc:${rc(lotRarity(l))}">
      ${lotPic(l)}
      <div class="info"><div class="t">${lotName(l)}</div>
        <div class="sub">${l.until > t ? `${emo('⏳', 12)} ещё ${leftText(l.until - t)} · получишь ${money(Rules.lotGot(l.price))}` : 'Не продано — забери вещь'}</div></div>
      <div class="r col"><b>${money(l.price)}</b>
        <button class="pill gray" data-act="mk-cancel" data-id="${l.id}" ${l.until > t ? 'data-confirm="Снять?"' : ''}>${l.until > t ? 'Снять' : 'Забрать'}</button></div>
    </div>`;
  const log = state.marketLog.slice(0, 15).map(e => {
    const l = { ...e, car: e.car && { ...e.car, parts: {} } };
    return `<div class="list-row static mk-row">
      ${lotPic(l)}
      <div class="info"><div class="t">${lotName(l)}</div><div class="sub">${e.side === 'sell' ? 'Продано' : `Куплено у ${esc(e.seller || 'игрока')}`} · ${new Date(e.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
      <div class="r col"><b class="${e.side === 'sell' ? 'plus' : ''}">${e.side === 'sell' ? '+' + money(e.got) : '−' + money(e.price)}</b></div>
    </div>`;
  }).join('');
  return `<button class="btn" data-act="mk-new" ${act.length >= lim ? 'disabled' : ''}>${act.length >= lim ? `Лотов максимум ${lim}` : 'Выставить на продажу'}</button>
    <div class="muted small" style="margin:8px 4px 0">Лотов ${act.length}/${lim}${Rules.vipOn(state, t) ? ' (VIP)' : ` · у VIP — ${MARKET.vipLots}`} · лот висит ${MARKET.ttlMs / 3600e3} ч · комиссия ${MARKET.feeK * 100}%</div>
    ${done.length ? `<div class="section-h"><span>Не продано</span></div><div class="list">${done.map(rows).join('')}</div>` : ''}
    ${act.length ? `<div class="section-h"><span>На продаже</span></div><div class="list">${act.map(rows).join('')}</div>` : ''}
    ${log ? `<div class="section-h"><span>История</span></div><div class="list">${log}</div>` : ''}
    ${!act.length && !done.length && !log ? `<div class="card empty-state" style="margin-top:14px">${emo('🏪', 40)}<div class="muted">Выставь машину, деталь или номер — их купят другие игроки</div></div>` : ''}`;
}

function rerenderMarket() {
  if (tab !== 'menu' || menuView !== 'market' || spinning) return;
  const seg = $('#mseg');
  if (seg?.nextElementSibling) seg.nextElementSibling.innerHTML = mkBody();
  const b = seg?.querySelector('[data-v="1"]');
  if (b) b.textContent = `Мои лоты${state.lots.length ? ' · ' + state.lots.length : ''}`;
}

// ---------- карточка лота (рынок) ----------
function showLot(id) {
  const l = mkLots().find(x => x.id === id);
  if (!l) { toast('Лот уже купили'); rerenderMarket(); return; }
  let pic = '', extra = '';
  if (l.kind === 'car') {
    const d = CAR_BY_ID[l.car.id];
    pic = `<div class="mk-big">${carPic(d)}</div>${l.car.plate ? `<div class="car-plate">${plateHTML(l.car.plate)}</div>` : ''}`;
    const parts = Rules.carSlots(l.car).filter(s => l.car.parts[s.id]).map(s => `<span class="chip">${s.name} ${tierBadge(l.car.parts[s.id])}</span>`).join('');
    extra = `<div class="stats">
        <div class="stat"><div class="v">${Rules.carHp(l.car)}</div><div class="l">л.с.</div></div>
        <div class="stat"><div class="v">${clsBadge(d.r)}</div><div class="l">класс</div></div>
        <div class="stat"><div class="v">${state.discovered.includes(d.id) ? '✓' : '—'}</div><div class="l">${state.discovered.includes(d.id) ? 'в коллекции' : 'не засчитается'}</div></div>
      </div>${parts ? `<div class="mk-parts">${parts}</div>` : ''}`;
  } else if (l.kind === 'part') {
    pic = `<div class="mk-big part" style="--rc:${rc(l.t)}">${partPic(l.slot)}</div>`;
    extra = `<div class="mk-center">${tierBadge(l.t)}${l.n > 1 ? ` <span class="chip">×${l.n}</span>` : ''}</div>`;
  } else {
    pic = `<div class="plate-stage lit sheet" style="--rc:${rc(plateInfo(l.plate).rarity)}">${plateHTML(l.plate, 'big')}</div>`;
    extra = `<div class="mk-center">${clsBadge(plateInfo(l.plate).rarity)}</div>`;
  }
  if (l.auc) return showAucLot(l, pic, extra);
  const no = l.kind === 'plate' && Rules.plateRoom(state, now()).full ? 'Лимит номеров' : state.money < l.price ? 'Не хватает денег' : '';
  openSheet(`${sheetNav(lotName(l))}
    ${pic}${extra}
    <div class="list" style="margin-top:12px">
      <div class="list-row static"><div class="info"><div class="t">Стоимость в игре</div></div><div class="r">${money(l.value)}</div></div>
      <div class="list-row static"><div class="info"><div class="t">Цена</div></div><div class="r"><b>${money(l.price)}</b>&nbsp;${lotDelta(l)}</div></div>
      <div class="list-row static"><div class="info"><div class="t">Продавец</div></div><div class="r">${esc(l.seller)}</div></div>
      <div class="list-row static"><div class="info"><div class="t">До конца</div></div><div class="r">${leftText(l.until - now())}</div></div>
    </div>
    <button class="btn" style="margin-top:14px" data-act="mk-buy" data-id="${l.id}" ${no ? 'disabled' : `data-confirm="Купить за ${money(l.price)}?"`}>${no || `Купить за ${money(l.price)}`}</button>`);
}

// аукцион бота: ставки, «купить сразу», забрать выигрыш
let mkAucOpen = null;
function showAucLot(l, pic, extra) {
  const a = mkAucSt(l);
  mkAucOpen = l.id;
  const next = mkAucNext(a), have = state.money + (a.myBid || 0);
  const plateFull = l.kind === 'plate' && Rules.plateRoom(state, now()).full;
  const won = a.done && mkAucLeader(a);
  const bids = a.done ? '' : [next, Math.ceil(next * 1.1 / 1000) * 1000, Math.ceil(next * 1.25 / 1000) * 1000].map((b, i) =>
    `<button class="pill${i ? ' gray' : ''}" data-act="mk-abid" data-id="${l.id}" data-v="${b}" ${have < b || plateFull ? 'disabled' : `data-confirm="Ставка ${money(b)}?"`}>${i ? `+${i === 1 ? 10 : 25}% · ` : 'Ставка · '}${money(b)}</button>`).join('');
  const html = `${sheetNav(lotName(l))}
    ${pic}${extra}
    <div class="card mk-auc-now">
      <div class="row"><span class="muted small">${a.bids ? `Ставка · ${a.bids}` : 'Стартовая цена'}</span><span class="muted small">${a.done ? 'торги окончены' : `ещё <b data-mk-left="${l.id}">${leftHMS(a.until - now())}</b>`}</span></div>
      <div class="mk-auc-price">${money(a.bids ? a.bid : l.auc.start)}</div>
      <div class="muted small">${a.bids ? `Лидер: ${mkAucLeader(a) ? 'ты' : esc(a.bidder)}` : 'Ставок ещё нет'} · стоимость в игре ${money(l.value)} · продавец ${esc(l.seller)}</div>
    </div>
    ${mkAucMyBid(a)}
    ${won ? `<button class="btn gold" data-act="mk-aclaim" data-id="${l.id}">${emo('🏆', 18)} Забрать — выиграл за ${money(a.myBid)}</button>`
      : a.done ? `<div class="card" style="text-align:center"><span class="muted">Торги окончены${a.bids ? ` · победил ${esc(a.bidder)}` : ''}</span></div>`
      : `<div class="pills wrap mk-auc-bids">${bids}</div>
        ${l.auc.buyout ? `<button class="btn gold" style="margin-top:10px" data-act="mk-abuy" data-id="${l.id}" ${have < l.auc.buyout || plateFull ? 'disabled' : `data-confirm="Купить сразу за ${money(l.auc.buyout)}?"`}>Купить сразу · ${money(l.auc.buyout)}</button>` : ''}
        <div class="muted small" style="margin:10px 4px">Шаг ставки +${MARKET_AUC.stepK * 100}%. Ставка в последние 2 минуты продлевает торги на 2 минуты. Ставка замораживается, если перебьют — вернётся.</div>`}`;
  const body = $('#sheet-body');
  if (document.body.classList.contains('sheet-open') && body.querySelector('.mk-auc-now')) body.innerHTML = html; else openSheet(html);
}

async function mkAucBid(id, amount, buyout) {
  const l = mkLots().find(x => x.id === id);
  if (!l || busy) return;
  if (MODE === 'server') {
    busy = true;
    const r = await api('marketBid', { id, amount });
    busy = false;
    await mkLoad(true);
    if (!r) return;
    haptic.ok(); updateBalance(true);
    if (r.won) { closeSheet(); toast(`🏆 Твоё: ${lotName(l)}`); rerenderMarket(); }
    else toast(`Ставка ${money(r.bid)} — ты лидер`);
    return;
  }
  const a = mkAucSt(l);
  if (a.done) { toast('Торги окончены'); return; }
  busy = true;
  const r = await api('aucBid', { amount, refund: a.myBid || 0 });
  busy = false;
  if (!r) return;
  a.myBid = amount; a.bid = amount; a.bids++; a.bidder = 'me'; a.mine = true;
  if (buyout) { a.done = true; a.until = now(); }
  else {
    if (a.until - now() < MARKET_AUC.extendMs) a.until = now() + MARKET_AUC.extendMs;
    // если бот готов дать больше — ответит в течение минуты, иначе ставок больше не будет
    a.nextAt = mkAucNext(a) <= l.auc.botMax ? now() + 15e3 + Math.random() * 40e3 : 0;
  }
  saveMkAucs();
  haptic.ok(); updateBalance(true);
  if (buyout) return mkAucClaim(id);
  showLot(id); $('#mk-list') && ($('#mk-list').innerHTML = mkListHTML());
}

async function mkAucClaim(id) {
  if (MODE === 'server') { closeSheet(); toast('Выигрыш уже у тебя'); return; }   // сервер выдаёт сам
  const a = mkAucs[id];
  if (!a || a.claimed || busy) return;
  busy = true;
  const r = await api('marketBuyLocal', { lot: a.lot, prepaid: true, price: a.myBid });
  busy = false;
  if (!r) return;
  a.claimed = true; mkBought.add(id); saveBought(); saveMkAucs();
  haptic.ok(); closeSheet();
  toast(a.lot.kind === 'car' ? (r.waiting ? `${lotName(a.lot)} ждёт в 🎁 — в гараже нет места` : `${lotName(a.lot)} — в гараже`) : a.lot.kind === 'part' ? 'Деталь на складе' : 'Номер твой');
  rerenderMarket();
}

// с сервером: пока открыт рынок — обновляем лоты (открыт аукцион — чаще, раз в 5 с)
setInterval(() => {
  if (MODE !== 'server' || spinning || document.hidden || tab !== 'menu' || menuView !== 'market' || mkView !== 0) return;
  const aucOpen = mkAucOpen && document.body.classList.contains('sheet-open') && $('#sheet-body .mk-auc-now');
  if (aucOpen || !document.body.classList.contains('sheet-open')) mkLoad(!!aucOpen);
  document.querySelectorAll('[data-mk-left]').forEach(el => {
    const l = mkSrv.lots?.find(x => x.id === el.dataset.mkLeft) || state.lots.find(x => x.id === el.dataset.mkLeft);
    if (l) el.textContent = leftHMS(l.until - now());
  });
}, 5000);

// фоном: торги ботов идут, перебитые ставки возвращаются, таймеры тикают
setInterval(async () => {
  if (MODE !== 'local' || spinning) return;
  for (const a of Object.values(mkAucs)) {
    if (a.claimed) continue;
    mkAucSim(a);
    if (a.refund && !busy) {
      const amount = a.refund; a.refund = 0; saveMkAucs();
      busy = true; await api('aucRefund', { amount }); busy = false;
      updateBalance(true);
      haptic.err(); toast(`😬 Тебя перебили: ${lotName(a.lot)} · ставка вернулась`);
    }
  }
  document.querySelectorAll('[data-mk-left]').forEach(el => {
    const a = mkAucs[el.dataset.mkLeft] || state.lots.find(x => x.id === el.dataset.mkLeft);
    if (a) el.textContent = leftHMS(a.until - now());
  });
  if (mkAucOpen && document.body.classList.contains('sheet-open') && $('#sheet-body .mk-auc-now')) {
    const l = botLots().find(x => x.id === mkAucOpen);
    if (l) { const a = mkAucs[l.id], sig = `${a.bids}|${a.done}|${a.myBid}`; if (sig !== a.sig) { a.sig = sig; showLot(l.id); } }
  }
}, 2000);

async function buyLot(id) {
  const l = mkLots().find(x => x.id === id);
  if (!l || busy) return;
  busy = true;
  const r = MODE === 'server' ? await api('marketBuy', { id }) : await api('marketBuyLocal', { lot: l });
  busy = false;
  if (MODE === 'server') { mkSrv.lots = (mkSrv.lots || []).filter(x => x.id !== id); if (!r) { closeSheet(); mkLoad(true); } }
  if (!r) return;
  if (MODE === 'local') { mkBought.add(id); saveBought(); }
  haptic.ok();
  updateBalance(true);
  closeSheet();
  toast(l.kind === 'car' ? (r.waiting ? `${lotName(l)} ждёт в 🎁 — в гараже нет места` : `${lotName(l)} — в гараже`) : l.kind === 'part' ? 'Деталь на складе' : 'Номер твой');
}

// ---------- выставить: выбор вещи ----------
let mkPickKind = 'car';
function showMkPick() {
  const t = now();
  const cars = state.cars.filter(c => !CAR_BY_ID[c.id].secret && state.race?.uid !== c.uid).sort((a, b) => carValue(b) - carValue(a));
  const parts = Object.keys(state.inv).map(k => { const [slot, tr] = k.split(':'); return { slot, t: tr, free: Rules.invFree(state, slot, tr, t) }; })
    .filter(p => p.free > 0).sort((a, b) => PART_TIERS[b.t].price - PART_TIERS[a.t].price);
  const onCar = new Set([...state.cars, ...state.museum].map(c => c.plate).filter(Boolean));
  const plates = state.plates.filter(k => !onCar.has(k)).sort((a, b) => plateInfo(b).value - plateInfo(a).value);
  const empty = txt => `<div class="card empty-state"><div class="muted">${txt}</div></div>`;
  const body = mkPickKind === 'car' ? (cars.length ? cars.map(c => `<button class="list-row" data-act="mk-pick" data-kind="car" data-uid="${c.uid}">
        <div class="mk-pic">${carPicOf(c)}</div><div class="info"><div class="t">${CAR_BY_ID[c.id].name}</div>
        <div class="sub">${carHp(c)} л.с.${c.plate ? ' · с номером' : ''}</div></div><div class="r">${money(carValue(c))}${CHEVRON_R}</div></button>`).join('') : empty('Нет машин для продажи'))
    : mkPickKind === 'part' ? (parts.length ? parts.map(p => `<button class="list-row" data-act="mk-pick" data-kind="part" data-slot="${p.slot}" data-t="${p.t}">
        <div class="ic part-ic" style="--rc:${rc(p.t)}">${partPic(p.slot)}</div><div class="info"><div class="t">${partName(p.slot, p.t)}</div>
        <div class="sub">свободно ${p.free}</div></div><div class="r">${money(PART_TIERS[p.t].price)}${CHEVRON_R}</div></button>`).join('') : empty('На складе нет свободных деталей'))
    : (plates.length ? plates.map(k => `<button class="list-row pl-row" data-act="mk-pick" data-kind="plate" data-plate="${k}">
        ${plateHTML(k, 'mini')}<div class="info"></div><div class="r">${money(plateInfo(k).value)}${CHEVRON_R}</div></button>`).join('') : empty('Нет свободных номеров (номер на машине продаётся вместе с ней)'));
  openSheet(`${sheetNav('Что продаём?')}
    <div class="mk-chips">${[['car', 'Машины'], ['part', 'Детали'], ['plate', 'Номера']].map(([id, n]) => `<button class="${mkPickKind === id ? 'on' : ''}" data-act="mk-pick-kind" data-id="${id}">${n}</button>`).join('')}</div>
    <div class="list">${body}</div>`);
}

// ---------- выставить: цена ----------
function draftLot() {
  const d = mkDraft;
  if (d.kind === 'car') { const car = state.cars.find(c => c.uid === d.uid); return car && { kind: 'car', car }; }
  if (d.kind === 'part') return { kind: 'part', slot: d.slot, t: d.t, n: d.n };
  return { kind: 'plate', plate: d.plate };
}
// как быстро купят: та же формула, что у ботов в правилах (в среднем)
function speedHint(k) {
  const m = 4 * Math.exp(3.2 * (k - 1));
  return m < 10 ? ['Купят очень быстро', 'good'] : m < 60 ? ['Купят быстро', 'good'] : m < 600 ? ['Купят не сразу', ''] : m < 2880 ? ['Купят нескоро', 'bad'] : ['Скорее всего, не купят', 'bad'];
}

function showMkPrice(fromCard) {
  const l = draftLot();
  if (!l) return closeSheet();
  const value = Rules.lotValue(l), [lo, hi] = Rules.lotRange(value);
  const pct = mkDraft.pct, price = Math.min(hi, Math.max(lo, Math.round(value * pct / 100)));
  const [sp, cls] = speedHint(price / value);
  const free = l.kind === 'part' ? Rules.invFree(state, l.slot, l.t, now()) : 1;
  const preview = l.kind === 'car' ? `<div class="mk-big">${carPicOf(l.car)}</div>${l.car.plate ? `<div class="car-plate">${plateHTML(l.car.plate)}</div>` : ''}`
    : l.kind === 'part' ? `<div class="mk-big part" style="--rc:${rc(l.t)}">${partPic(l.slot)}</div>`
    : `<div class="plate-stage lit sheet" style="--rc:${rc(plateInfo(l.plate).rarity)}">${plateHTML(l.plate, 'big')}</div>`;
  openSheet(`${sheetNav('Цена', fromCard ? null : { act: 'mk-new', label: 'Назад' })}
    ${preview}
    <div class="mk-center"><b>${lotName(l)}</b><div class="muted small">стоимость в игре ${money(value)}</div></div>
    ${l.kind === 'part' && free > 1 ? `<div class="mk-qty"><button class="pill gray" data-act="mk-n" data-d="-1" ${l.n <= 1 ? 'disabled' : ''}>−</button>
      <b>${l.n} шт.</b><button class="pill gray" data-act="mk-n" data-d="1" ${l.n >= free ? 'disabled' : ''}>+</button></div>` : ''}
    ${typeof nextOn === 'function' && nextOn() ? segmented('mk-mode', mkDraft.auc ? 1 : 0, 'Фиксированная цена', 'Аукцион') : ''}
    ${mkDraft.auc ? `<div class="muted small" style="margin:8px 4px 0">Цена ниже — стартовая. Игроки поднимают ставки (+${MARKET_AUC.stepK * 100}%), по окончании продаётся лучшей ставке. Нет ставок — вещь вернётся без комиссии</div>` : ''}
    <div class="card mk-price">
      ${mkDraft.auc ? '<div class="muted small">Стартовая цена</div>' : ''}
      <div class="mk-price-v" id="mk-price">${money(price)}</div>
      <div class="mk-price-k"><span id="mk-pct">${pct}%</span> от стоимости · <span id="mk-speed" class="mk-d ${cls}">${sp}</span></div>
      <input type="range" id="mk-range" min="${MARKET.minK * 100}" max="${MARKET.maxK * 100}" step="5" value="${pct}">
      <div class="mk-range-l"><span>${MARKET.minK * 100}%</span><span>100%</span><span>${MARKET.maxK * 100}%</span></div>
      <div class="list-row static"><div class="info"><div class="t">Комиссия ${MARKET.feeK * 100}%</div></div><div class="r" id="mk-fee">−${money(price - Rules.lotGot(price))}</div></div>
      <div class="list-row static"><div class="info"><div class="t">${mkDraft.auc ? 'Получишь минимум' : 'Получишь'}</div></div><div class="r"><b id="mk-got">${money(Rules.lotGot(price))}</b></div></div>
    </div>
    ${mkDraft.auc ? `<div class="card mk-price">
      <div class="muted small">Сколько идут торги</div>
      <div class="pills wrap" style="margin-top:6px">${MARKET_AUC.hours.map(h => `<button class="pill${mkDraft.hours === h ? '' : ' gray'}" data-act="mk-hours" data-v="${h}">${h} ч</button>`).join('')}</div>
      <div class="muted small" style="margin-top:10px">«Купить сразу» — необязательно (% от стоимости)</div>
      <div class="mk-buyout"><input id="mk-buyout" class="promo-input" type="number" inputmode="numeric" min="0" placeholder="нет" value="${mkDraft.buyoutPct || ''}"><span>%</span>
        <b id="mk-buyout-v">${mkDraft.buyoutPct ? money(Math.round(value * mkDraft.buyoutPct / 100)) : '—'}</b></div>
    </div>` : ''}
    <button class="btn" data-act="mk-list" data-confirm="${mkDraft.auc ? `Начать аукцион на ${mkDraft.hours} ч?` : `Выставить? Вещь уйдёт на ${MARKET.ttlMs / 3600e3} ч`}">${mkDraft.auc ? `${emo('🔨', 18)} Начать аукцион` : 'Выставить'}</button>
    ${l.kind === 'car' ? '<div class="muted small" style="margin:10px 4px">Пока машина на продаже, её нет в гараже: она не приносит доход и не ездит в гонки. Номер и детали продаются вместе с ней.</div>' : ''}`);
}

function updatePriceUI() {
  const l = draftLot(), value = Rules.lotValue(l), [lo, hi] = Rules.lotRange(value);
  const price = Math.min(hi, Math.max(lo, Math.round(value * mkDraft.pct / 100)));
  const [sp, cls] = speedHint(price / value);
  $('#mk-price').textContent = money(price);
  $('#mk-pct').textContent = mkDraft.pct + '%';
  const s = $('#mk-speed'); s.textContent = sp; s.className = 'mk-d ' + cls;
  $('#mk-fee').textContent = '−' + money(price - Rules.lotGot(price));
  $('#mk-got').textContent = money(Rules.lotGot(price));
}

async function listDraft() {
  if (busy || !mkDraft) return;
  const l = draftLot();
  if (!l) return;
  const value = Rules.lotValue(l), [lo, hi] = Rules.lotRange(value);
  const price = Math.min(hi, Math.max(lo, Math.round(value * mkDraft.pct / 100)));
  busy = true;
  const auc = mkDraft.auc ? { hours: mkDraft.hours, buyout: mkDraft.buyoutPct ? Math.min(hi, Math.round(value * mkDraft.buyoutPct / 100)) : null } : undefined;
  const r = await api('marketList', { kind: l.kind, uid: mkDraft.uid, slot: l.slot, t: l.t, n: l.n, plate: l.plate, price, auc });
  busy = false;
  if (!r) return;
  haptic.ok();
  mkDraft = null;
  closeSheet();
  toast(auc ? 'Аукцион начался' : 'Лот выставлен');
  if (tab === 'menu' && menuView === 'market') { mkView = 1; render(); }
}

// открыть выставление сразу из карточки машины / склада / номера
function mkSellFrom(d) {
  if (Rules.marketLimit(state, now()) <= state.lots.filter(l => l.until > now()).length) { haptic.err(); toast('Лотов уже максимум'); return; }
  mkDraft = { pct: 100, n: 1, ...d };
  showMkPrice(true);
}

// ---------- боты покупают мои лоты ----------
function noteMarketSold(sold) {
  if (!sold?.length) return;
  haptic.ok();
  sold.forEach((s, i) => setTimeout(() => toast(`${s.lot.auc ? '🔨 Аукцион: продано' : '🤝 Купили'}: ${lotName(s.lot)} · +${money(s.got)}`, 3000), i * 3200));
  updateBalance(true);
  rerenderMarket();
}
setInterval(async () => {
  if (MODE !== 'local' || busy || spinning || !state.lots?.some(l => (l.botAt && l.botAt <= now() && l.until > now())
    || (l.auc && ((l.auc.nextAt && l.auc.nextAt <= now()) || (l.auc.bids && l.until <= now()))))) return;
  const r = await api('marketTick');
  noteMarketSold(r?.sold);
}, 3000);
setInterval(() => { if (tab === 'menu' && menuView === 'market' && mkView === 1 && !document.body.classList.contains('sheet-open')) rerenderMarket(); }, 30e3);

// ---------- нажатия ----------
document.addEventListener('input', e => {
  if (e.target.id === 'mk-search') {
    mkQuery = e.target.value;
    if (MODE === 'server') { clearTimeout(mkSearchT); mkSearchT = setTimeout(() => mkLoad(true), 350); }
    else $('#mk-list').innerHTML = mkListHTML();
  }
  if (e.target.id === 'mk-range' && mkDraft) { mkDraft.pct = +e.target.value; updatePriceUI(); if (+e.target.value === 100) haptic.tick(); }
  if (e.target.id === 'mk-buyout' && mkDraft) {
    mkDraft.buyoutPct = Math.max(0, Math.floor(+e.target.value || 0));
    const l = draftLot(), v = $('#mk-buyout-v');
    if (l && v) v.textContent = mkDraft.buyoutPct ? money(Math.round(Rules.lotValue(l) * mkDraft.buyoutPct / 100)) : '—';
  }
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act^="mk-"], [data-act="mseg"]');
  if (!el || el.disabled) return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'mseg': mkView = +el.dataset.v; switchSegment('mseg', mkView, mkBody()); break;
    case 'mk-kind': mkKind = id; haptic.tick(); if (MODE === 'server') mkLoad(true); $('#mk-list').innerHTML = mkListHTML(); el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); break;
    case 'mk-sort': mkSort = id; haptic.tick(); if (MODE === 'server') mkLoad(true); $('#mk-list').innerHTML = mkListHTML(); el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el)); break;
    case 'mk-lot': haptic.tap(); showLot(id); break;
    case 'mk-buy': buyLot(id); break;
    case 'mk-new': haptic.tap(); showMkPick(); break;
    case 'mk-pick-kind': mkPickKind = id; haptic.tick(); showMkPick(); break;
    case 'mk-pick': {
      haptic.tap();
      const k = el.dataset.kind;
      mkDraft = { kind: k, pct: 100, n: 1, uid: el.dataset.uid, slot: el.dataset.slot, t: el.dataset.t, plate: el.dataset.plate };
      showMkPrice(false);
      break;
    }
    case 'mk-n': mkDraft.n += +el.dataset.d; haptic.tick(); showMkPrice(!!mkDraft.fromCard); break;
    case 'mk-list': listDraft(); break;
    case 'mk-mode': mkDraft.auc = +el.dataset.v === 1; if (mkDraft.auc) { mkDraft.hours = mkDraft.hours || 6; mkDraft.pct = Math.min(mkDraft.pct, 100); } haptic.tick(); showMkPrice(!!mkDraft.fromCard); break;
    case 'mk-hours': mkDraft.hours = +el.dataset.v; haptic.tick(); showMkPrice(!!mkDraft.fromCard); break;
    case 'mk-abid': mkAucBid(id, +el.dataset.v); break;
    case 'mk-abuy': { const l = mkLots().find(x => x.id === id); if (l) mkAucBid(id, l.auc.buyout, true); break; }
    case 'mk-aclaim': mkAucClaim(id); break;
    case 'mk-cancel': (async () => {
      if (busy) return;
      busy = true;
      const r = await api('marketCancel', { id });
      busy = false;
      if (!r) return;
      haptic.tap();
      toast(r.waiting ? 'Гараж полон — машина ждёт в 🎁' : 'Вещь вернулась');
      updateRewardBadge();
      rerenderMarket();
    })(); break;
    case 'mk-sell-car': mkSellFrom({ kind: 'car', uid: el.dataset.uid, fromCard: true }); break;
    case 'mk-sell-part': mkSellFrom({ kind: 'part', slot: el.dataset.slot, t: el.dataset.t, fromCard: true }); break;
    case 'mk-sell-plate': mkSellFrom({ kind: 'plate', plate: el.dataset.plate, fromCard: true }); break;
  }
});
