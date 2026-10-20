// ===== Контейнеры: аукционы закрытых контейнеров с секретной машиной (плашка сверху экрана кейсов) =====
// Запускает админ (ивент). Что внутри — игроки узнают, только когда победитель откроет контейнер.
// Тестовая версия (в браузере): аукционы хранятся в браузере, соперники — боты (0,5–1,2 стоимости машины).
// С сервером: торги — GET /containers (что внутри приходит только после конца), ставка — действие contBid,
// выигранный контейнер — в state.contWon, открыть — contOpen. Запускает команда из админ-бота.

const AUC_KEY = 'dz_aucs';
const AUC_TICK = 2000;
const AUC_COLORS = ['#c0392b', '#1f6fb2', '#2e8b57', '#d9822b', '#7d3c98', '#5d6d7e'];
// фото контейнера красное — перекрашиваем в цвет контейнера сдвигом оттенка
const AUC_TINT = { '#c0392b': 'none', '#1f6fb2': 'hue-rotate(195deg)', '#2e8b57': 'hue-rotate(115deg) saturate(.8)', '#d9822b': 'hue-rotate(28deg) saturate(1.3) brightness(1.15)',
  '#7d3c98': 'hue-rotate(275deg) saturate(.9)', '#5d6d7e': 'saturate(0) brightness(1.1)' };
let aucs = (() => { try { return JSON.parse(localStorage.getItem(AUC_KEY) || '[]'); } catch { return []; } })();
const saveAucs = () => { try { localStorage.setItem(AUC_KEY, JSON.stringify(aucs.slice(-30))); } catch {} };
const aucActive = a => !a.done;
const aucMine = a => a.leader === 'me';

// ---------- с сервером ----------
const contSrv = { list: null, at: 0, loading: false };
async function contLoad(force) {
  if (MODE !== 'server' || contSrv.loading || !nextOn() || (!force && Date.now() - contSrv.at < 20e3)) return;
  contSrv.loading = true;
  try {
    const d = await (await fetch(API + '/containers', { headers: authHeaders() })).json();
    if (Array.isArray(d.list)) contSrv.list = d.list;
  } catch {}
  contSrv.at = Date.now();
  contSrv.loading = false;
  aucRerender();
}
// торги с сервера + выигранные, но не открытые (state.contWon) — в том же виде, что тестовые
function aucsView() {
  if (MODE !== 'server') return aucs;
  const won = state.contWon || [];
  const list = (contSrv.list || []).map(c => {
    const w = won.find(x => x.id === c.id);
    return { ...c, carId: c.carId || w?.carId, endsAt: c.endsAt, myBidEver: c.myBid > 0 || c.log.some(l => l.who === 'me'),
      won: c.done && c.leader === 'me', claimed: c.done && c.leader === 'me' && !w };
  });
  for (const w of won) if (!list.some(x => x.id === w.id)) list.push({ ...w, start: w.price, leader: 'me', done: true, won: true, claimed: false, log: [], endsAt: w.at });
  return list;
}
const aucById = id => aucsView().find(x => x.id === id);
// новый контейнер — островок один раз
const contSeen = () => { try { return JSON.parse(localStorage.getItem('dz_cont_seen') || '[]'); } catch { return []; } };
const contMarkSeen = id => { try { localStorage.setItem('dz_cont_seen', JSON.stringify([...contSeen(), id].slice(-20))); } catch {} };

// ---------- запуск (админ) ----------
function aucCreate(carId, start, ms) {
  const d = CAR_BY_ID[carId], t = Date.now();
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 4));
  const a = {
    id: t.toString(36) + Math.random().toString(36).slice(2, 6), n: (aucs.reduce((m, x) => Math.max(m, x.n || 0), 0)) + 1, carId,
    color: AUC_COLORS[Math.floor(Math.random() * AUC_COLORS.length)],
    start, price: start, leader: null, myBid: 0, startAt: t, endsAt: t + ms, simAt: t,
    bots: names.map(name => ({ name, max: Math.round(d.price * (0.5 + Math.random() * 0.7) / AUCTION.round) * AUCTION.round })),
    log: [], done: false,
  };
  aucs.push(a);
  saveAucs();
  return a;
}

// ---------- ставки ----------
const aucNeed = a => a.next ?? (a.leader ? Rules.aucNext(a.price) : a.start);
function placeBid(a, who, amount, t) {
  a.price = amount;
  a.leader = who;
  a.log.unshift({ who, amount, at: t });
  a.log.length = Math.min(a.log.length, 20);
  if (a.endsAt - t < AUCTION.extendMs) a.endsAt = t + AUCTION.extendMs;   // ставка в конце продлевает торги
}

// боты: пока лидер ты — отвечают быстро (в конце — ещё быстрее), иначе понемногу поднимают цену
function botStep(a, t, refunds) {
  if (a.done) return;
  if (t >= a.endsAt) { a.done = true; a.won = aucMine(a); return; }
  const need = aucNeed(a);
  const cands = a.bots.filter(b => b.name !== a.leader && b.max >= need);
  if (!cands.length) return;
  const p = aucMine(a) ? (a.endsAt - t < 5 * 60e3 ? 0.35 : 0.12) : 0.012;
  if (Math.random() >= p) return;
  const b = cands[Math.floor(Math.random() * cands.length)];
  const amount = Math.min(b.max, Math.ceil(need * (1 + Math.random() * 0.08) / AUCTION.round) * AUCTION.round);
  if (aucMine(a)) { refunds.push({ a, amount: a.myBid }); a.myBid = 0; }
  placeBid(a, b.name, amount, t);
}

let aucBusy = false;
async function aucSim() {
  if (aucBusy || !aucs.some(aucActive)) return;
  aucBusy = true;
  const t = Date.now(), refunds = [];
  let changed = false;
  for (const a of aucs.filter(aucActive)) {
    const before = a.log.length + (a.done ? 1 : 0);
    // догоняем время, пока игра была закрыта (не больше ~3 ч шагов)
    let s = Math.max(a.simAt, t - 5400 * AUC_TICK);
    for (; s + AUC_TICK <= t && !a.done; s += AUC_TICK) botStep(a, s, refunds);
    if (!a.done && t >= a.endsAt) botStep(a, t, refunds);
    a.simAt = a.done ? t : s;
    if (a.log.length + (a.done ? 1 : 0) !== before) changed = true;
  }
  saveAucs();
  for (const r of refunds) {
    if (r.amount) await api('aucRefund', { amount: r.amount });
    toast(`Тебя перебили · контейнер №${r.a.n}`);
    haptic.err();
  }
  if (refunds.length) updateBalance(true);
  aucBusy = false;
  if (changed) aucRerender();
}
setInterval(() => { if (MODE === 'local') aucSim(); }, AUC_TICK);
// с сервером: открыт контейнер — обновляем раз в 3 с, на экране кейсов — раз в 20 с
setInterval(() => {
  if (MODE !== 'server' || spinning || document.hidden || !nextOn()) return;
  const open = document.body.classList.contains('sheet-open') && aucSheetId && document.querySelector('#sheet-body .auc-stage');
  if (open) contLoad(true); else if (tab === 'cases') contLoad();
}, 3000);
setInterval(aucTimers, 1000);

// ---------- как выглядит контейнер (спереди: две двери с запорами) ----------
// фото img/container.webp (если есть), иначе нарисованный контейнер.
// side — вид сбоку (окно аукциона): фото img/container_side.webp или нарисованный длинный рифлёный бок
function containerHTML(a, cls = '') {
  if (cls.includes('side')) return `<div class="cont ${cls}" style="--cc:${a.color};--tint:${AUC_TINT[a.color] || 'none'}">
    <div class="cont-ribs"></div><i class="cont-corner tl"></i><i class="cont-corner tr"></i><i class="cont-corner bl"></i><i class="cont-corner br"></i>
    <img class="cont-photo" src="img/container_side.webp" alt="" draggable="false" onload="this.parentElement.classList.add('has-photo')" onerror="this.remove()">
    <b class="cont-no">№${a.n}</b>
  </div>`;
  return `<div class="cont ${cls}" style="--cc:${a.color};--tint:${AUC_TINT[a.color] || 'none'}">
    <div class="cont-door l"><i></i><i></i></div>
    <div class="cont-door r"><i></i><i></i><span class="cont-lock">${emo('🔒', 18)}</span></div>
    <img class="cont-photo" src="img/container.webp" alt="" draggable="false" onload="this.parentElement.classList.add('has-photo')" onerror="this.remove()">
    <b class="cont-no">№${a.n}</b>
  </div>`;
}
// машина из контейнера: серый силуэт под контейнером, после открытия — в цвете
const aucCarHTML = (a, shown) => `<div class="auc-car${shown ? ' shown' : ''}"><i class="auc-glow"></i>${carPic(CAR_BY_ID[a.carId], !shown)}</div>`;
const leftHMS = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); return `${h ? h + ':' : ''}${String(Math.floor(s % 3600 / 60)).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`; };

function aucStatus(a) {
  if (!a.done) return aucMine(a) ? '<span class="auc-st good">Ты лидер</span>' : a.myBidEver ? '<span class="auc-st bad">Тебя перебили</span>' : a.leader ? `<span class="auc-st">Лидер: ${esc(a.leader)}</span>` : '<span class="auc-st">Ставок ещё нет</span>';
  if (a.won) return a.claimed ? '<span class="auc-st good">Твой</span>' : '<span class="auc-st good">Ты выиграл!</span>';
  return a.leader ? `<span class="auc-st">Выиграл ${esc(a.leader)}</span>` : '<span class="auc-st">Без ставок</span>';
}

// ---------- плашки на экране кейсов: идущие торги и выигранные, но не открытые ----------
function aucBannersHTML() {
  if (!nextOn()) return '';
  contLoad();
  const list = aucsView().filter(a => !a.done || (a.won && !a.claimed));
  return list.map(a => {
    const sub = a.done ? 'Ты выиграл — открой контейнер!'
      : `${aucMine(a) ? 'ты лидер' : a.myBidEver ? 'тебя перебили' : a.leader ? 'идут торги' : 'ставок ещё нет'} · ещё <span data-auc-left="${a.id}">${leftHMS(a.endsAt - Date.now())}</span>`;
    return `<button class="auc-banner${a.done ? ' won' : aucMine(a) ? ' lead' : ''}" data-act="auc-open" data-id="${a.id}" style="--cc:${a.color}">
      <span class="auc-b-ic">${containerHTML(a, 'tiny')}</span>
      <span class="auc-b-txt"><b>Контейнер №${a.n} · <em>${money(a.leader ? a.price : a.start)}</em></b>
        <span>${sub}</span></span>
      ${CHEVRON_R}
    </button>`;
  }).join('');
}

function showAuc(id) {
  const a = aucById(id);
  if (!a) return;
  aucSheetId = id;
  if (a.done && a.won && !a.claimed) return showAucOpen(a);
  const need = aucNeed(a);
  const bids = [need, Math.ceil(need * 1.1 / AUCTION.round) * AUCTION.round, Math.ceil(need * 1.25 / AUCTION.round) * AUCTION.round];
  const log = a.log.slice(0, 8).map(l => `<div class="list-row static"><div class="info"><div class="t">${l.who === 'me' ? '<b>Ты</b>' : esc(l.who)}</div>
      <div class="sub">${new Date(l.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div></div><div class="r"><b>${money(l.amount)}</b></div></div>`).join('');
  openSheet(`${sheetNav(`Контейнер №${a.n}`)}
    <div class="auc-stage">${a.claimed ? aucCarHTML(a, true) : containerHTML(a, 'side')}</div>
    <div class="auc-now">
      <div class="muted small">${a.leader ? 'Текущая ставка' : 'Стартовая цена'}</div>
      <div class="auc-price" id="auc-price">${money(a.leader ? a.price : a.start)}</div>
      <div>${aucStatus(a)}</div>
      ${a.done ? `<div class="muted small" style="margin-top:6px">Внутри был: <b>${CAR_BY_ID[a.carId].name}</b></div>`
        : `<div class="auc-time big">${emo('⏱️', 16)} <span data-auc-left="${a.id}">${leftHMS(a.endsAt - Date.now())}</span></div>`}
    </div>
    ${a.done ? '' : MODE === 'server' && (state.level || 1) < AUCTION.minLevel
      ? `<div class="card auc-lead">${emo('🔒', 20)} Ставки на контейнеры — с ${AUCTION.minLevel} уровня. Сейчас у тебя ${state.level || 1}</div>`
      : aucMine(a)
      ? `<div class="card auc-lead">${emo('🏆', 22)} Ты лидер — твоя ставка ${money(a.myBid)} заморожена. Если перебьют, деньги вернутся.</div>`
      : `<div class="auc-bids">${bids.map((b, i) => `<button class="btn${i ? ' gray' : ''}" data-act="auc-bid" data-id="${a.id}" data-amount="${b}"
          ${state.money + (a.myBid || 0) < b ? 'disabled' : `data-confirm="Ставка ${money(b)}?"`}>${i ? `+${i === 1 ? 10 : 25}% · ` : 'Ставка · '}${money(b)}</button>`).join('')}</div>
        <div class="muted small" style="margin:6px 4px 0">Деньги ставки замораживаются. Перебьют — вернутся на баланс.</div>`}
    ${log ? `<div class="section-h"><span>Ставки</span></div><div class="list">${log}</div>` : ''}`);
}

// победитель открывает контейнер
function showAucOpen(a) {
  aucSheetId = null;
  openSheet(`${sheetNav(`Контейнер №${a.n}`)}
    <div class="auc-stage big auc-reveal">${aucCarHTML(a, false)}${containerHTML(a, 'side')}</div>
    <div class="auc-now" id="auc-reveal"><div class="auc-price">Твой контейнер!</div><div class="muted small">Выиграл за ${money(a.price)}</div></div>
    <button class="btn gold" id="auc-open-btn" data-act="auc-claim" data-id="${a.id}">Открыть контейнер</button>`);
}

async function claimAuc(id) {
  const a = aucById(id);
  if (!a || a.claimed || busy) return;
  busy = true;
  const r = MODE === 'server' ? await api('contOpen', { id }) : await api('aucWin', { carId: a.carId, price: a.price });
  busy = false;
  if (!r) return;
  a.claimed = true;
  if (MODE === 'server') a.carId = r.carId; else saveAucs();
  const ban = $('#auc-banners');
  if (ban) ban.innerHTML = aucBannersHTML();
  spinning = true;
  $('#auc-open-btn')?.remove();
  const stage = document.querySelector('.auc-reveal');
  const d = CAR_BY_ID[a.carId];
  // контейнер очень плавно тает → за ним серый силуэт → через секунду машина проявляется
  haptic.heavy();
  stage.classList.add('vanish');
  await wait(2600);
  haptic.soft();
  stage.querySelector('.auc-car .pic').classList.remove('locked');
  stage.querySelector('.auc-car').classList.add('shown');
  await wait(700);
  haptic.ok();
  $('#auc-reveal').innerHTML = `<div class="auc-x">${clsBadge(d.r)}</div><div class="auc-price">${d.name}</div>
    <div class="muted small">${d.hp} л.с. · секретная машина · ${r.waiting ? 'гараж полон — ждёт в 🎁' : 'уже в гараже'}</div>`;
  spinning = false;
  updateRewardBadge();
}

function aucTimers() {
  document.querySelectorAll('[data-auc-left]').forEach(el => {
    const a = aucById(el.dataset.aucLeft);
    if (a) el.textContent = a.done ? 'завершён' : leftHMS(a.endsAt - Date.now());
  });
}

let aucSheetId = null;   // какой контейнер открыт в шторке (обновляем её при новых ставках)
function aucRerender() {
  if (spinning) return;
  const sheetOpen = document.body.classList.contains('sheet-open');
  const ban = $('#auc-banners');
  if (ban) ban.innerHTML = aucBannersHTML();
  if (sheetOpen && aucSheetId && document.querySelector('#sheet-body .auc-stage') && !armed) showAuc(aucSheetId);
}

async function bidAuc(id, amount) {
  const a = aucById(id);
  if (!a || a.done || busy) return;
  if (amount < aucNeed(a)) { toast('Цена уже выросла'); return showAuc(id); }
  if (MODE === 'server') {
    busy = true;
    const r = await api('contBid', { id, amount });
    busy = false;
    await contLoad(true);
    if (!r) return showAuc(id);
    haptic.ok(); updateBalance(true);
    return showAuc(id);
  }
  busy = true;
  const r = await api('aucBid', { amount, refund: a.myBid || 0 });
  busy = false;
  if (!r) return;
  haptic.ok();
  placeBid(a, 'me', amount, Date.now());
  a.myBid = amount;
  a.myBidEver = true;
  saveAucs();
  updateBalance(true);
  aucRerender();
  showAuc(id);
}

// ---------- админ: запуск ивента ----------
function showAucAdmin() {
  aucSheetId = null;
  const opts = `<optgroup label="Эксклюзивные">${EXCL_CARS.map(c => `<option value="${c.id}">${c.name} · ~${money(c.price)}</option>`).join('')}</optgroup>
    <optgroup label="Секретные">${SECRET_CARS.map(c => `<option value="${c.id}">${c.name} · ${money(c.price)}</option>`).join('')}</optgroup>`;
  const durs = [[10, '10 минут'], [30, '30 минут'], [60, '1 час'], [120, '2 часа'], [360, '6 часов'], [1440, '24 часа']];
  const act = aucs.filter(aucActive).map(a => `<div class="list-row static"><div class="info"><div class="t">№${a.n} · ${CAR_BY_ID[a.carId].name}</div>
      <div class="sub">${a.leader ? `${money(a.price)} · ${a.leader === 'me' ? 'ты' : esc(a.leader)}` : 'без ставок'} · ещё ${leftHMS(a.endsAt - Date.now())}</div></div>
      <div class="pills"><button class="pill gray" data-act="auc-adm-end" data-id="${a.id}" data-confirm="Завершить?">Завершить</button>
      <button class="pill danger" data-act="auc-adm-del" data-id="${a.id}" data-confirm="Удалить?">✕</button></div></div>`).join('');
  openSheet(`${sheetNav('Контейнеры', { act: 'adm-back', label: 'Админка' })}
    <div class="muted small admin-note">Тестовая версия: аукционы живут в этом браузере, соперники — боты.</div>
    <div class="section-h">Новый контейнер</div>
    <div class="card admin-card">
      <div class="muted small">Что внутри (игроки не видят)</div>
      <select id="auc-car" class="admin-input">${opts}</select>
      <div class="muted small" style="margin-top:8px">Стартовая цена, ₽</div>
      <input id="auc-start" class="admin-input" type="number" inputmode="numeric" value="${AUCTION.defStart}">
      <div class="muted small" style="margin-top:8px">Сколько идут торги</div>
      <select id="auc-dur" class="admin-input">${durs.map(([m, n]) => `<option value="${m}"${m === AUCTION.defMs / 60e3 ? ' selected' : ''}>${n}</option>`).join('')}</select>
      <button class="btn" style="margin-top:12px" data-act="auc-adm-new">Запустить контейнер</button>
    </div>
    ${act ? `<div class="section-h">Идут торги</div><div class="list">${act}</div>` : ''}`);
}

// ---------- нажатия ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act^="auc-"]');
  if (!el || el.disabled) return;
  const { act, id } = el.dataset;
  switch (act) {
    case 'auc-open': haptic.tap(); showAuc(id); break;
    case 'auc-bid': bidAuc(id, +el.dataset.amount); break;
    case 'auc-claim': claimAuc(id); break;
    case 'auc-admin': haptic.tap(); showAucAdmin(); break;
    case 'auc-adm-new': {
      const start = Math.max(AUCTION.round, Math.round(+$('#auc-start').value / AUCTION.round) * AUCTION.round);
      const a = aucCreate($('#auc-car').value, start, +$('#auc-dur').value * 60e3);
      haptic.ok();
      toast(`Контейнер №${a.n} запущен`);
      aucRerender();
      showAucAdmin();
      break;
    }
    case 'auc-adm-end': { const a = aucs.find(x => x.id === id); if (a) { a.endsAt = Date.now(); saveAucs(); aucSim().then(showAucAdmin); } break; }
    case 'auc-adm-del': {
      const a = aucs.find(x => x.id === id);
      if (!a) break;
      if (aucMine(a) && a.myBid) api('aucRefund', { amount: a.myBid }).then(() => updateBalance(true));
      aucs = aucs.filter(x => x !== a);
      saveAucs();
      showAucAdmin();
      break;
    }
  }
});
