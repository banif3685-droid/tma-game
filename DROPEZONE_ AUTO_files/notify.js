// ===== Уведомления сверху («островок» как на iPhone): подарки-кейсы и выдача от админа =====
// Висит, пока игрок не нажмёт «Забрать». Подарок — переход к кейсу с бесплатной прокруткой,
// остальное (деньги, машина, детали…) уже начислено — «Забрать» просто закрывает уведомление.
// Пока игра открыта, сервер опрашивается раз в 30 с — подарок приходит сразу, а не при следующем входе.

const caseName = gf => gf.kind === 'plate' ? `Генерация номера «${Rules.PLATE_CASE_BY_ID[gf.caseId]?.name}»`
  : gf.kind === 'part' ? `Кейс «${CASE_BY_ID[gf.caseId]?.name}»${gf.slot ? ` · ${SLOT_BY_ID[gf.slot]?.name}` : ''}` : `Кейс «${(Rules.caseById(gf.caseId) || gf).name}»`;
const caseIcon = gf => gf.kind === 'plate' ? '🚘' : (Rules.caseById(gf.caseId) || gf).icon || '🎁';

function noticeView(nt) {
  switch (nt.kind) {
    case 'money': return ['💰', `+${money(nt.amount)}`, 'на баланс'];
    case 'car': return ['🚗', CAR_BY_ID[nt.carId]?.name || 'Машина', 'в гараже'];
    case 'part': return ['🔧', `${partName(nt.slot, nt.t)}${nt.n > 1 ? ` ×${nt.n}` : ''}`, 'на складе'];
    case 'partsAll': return ['🔧', 'Комплект деталей Elite', 'на складе'];
    case 'slots': return ['🅿️', `+${nt.n} мест в гараже`, ''];
    case 'xp': return ['⭐', `+${nt.n} опыта`, ''];
    case 'fuel': return ['⛽', 'Полный бак', 'для гонок'];
    case 'fuelN': return ['⛽', `+${nt.n} топлива`, 'в общий бак для гонок'];
    case 'rcase': return ['🎁', 'Кейс наград', 'можно открыть'];
    case 'daily': return ['📅', 'Бонус дня', 'снова доступен'];
    case 'cool': return ['❄️', 'Детали остыли', 'и кейсы деталей доступны'];
    case 'buy': return ['⭐', 'Покупка', 'уже в игре'];
    case 'plate': return ['🚘', `Номер ${String(nt.plate).replace('|', ' ')}`, 'в «Номерах»'];
  }
  return ['🎁', 'Подарок', ''];
}

// что сейчас показать: сначала подарки-кейсы (по одному виду), потом остальные уведомления
function islandItem() {
  const gifts = state.gifts || [];
  if (gifts.length) {
    const gf = gifts[0];
    const n = gifts.filter(g => g.kind === gf.kind && g.caseId === gf.caseId && (g.slot || null) === (gf.slot || null)).length;
    if (onGiftScreen(gf)) return null;   // уже на экране этого кейса — там кнопка «Прокрутить бесплатно»
    return { key: 'g' + gf.id, gift: gf, icon: caseIcon(gf), title: `Тебе подарок!${n > 1 ? ` ×${n}` : ''}`, sub: gf.note || caseName(gf) };
  }
  // новый временный кейс — один раз
  const ev = typeof evActive === 'function' && evActive().find(c => !evSeen().includes(c.id));
  if (ev && !(tab === 'cases' && prefs.selCase === ev.id)) {
    return { key: 'e' + ev.id, ev, icon: ev.icon, title: `Новый кейс «${ev.name}»!`, sub: `только ${evLeft(ev)} · ${money(ev.price)}`, btn: 'Открыть' };
  }
  // новый контейнер (с сервером) — один раз
  const ct = MODE === 'server' && typeof contSeen === 'function' && globalThis.contLive;
  if (ct && ct.endsAt > now() && !contSeen().includes(ct.id) && tab !== 'cases') {
    return { key: 'c' + ct.id, contNew: ct, icon: '🚢', title: `Контейнер №${ct.n}: идут торги!`, sub: `старт ${money(ct.start)} · что внутри — секрет`, btn: 'Открыть' };
  }
  // новый уровень пропуска — награда ждёт
  const pp = state.passPending || [];
  if (pp.length) {
    const top = Math.max(...pp);
    return { key: 'p' + pp.join('.'), pass: true, icon: '🎟️', title: `Уровень ${top}!${Rules.passPremOn(state, now()) ? ' · Премиум' : ''}`,
      sub: pp.length > 1 ? `Награды пропуска за ${pp.length} уровня` : 'Награда сезонного пропуска' };
  }
  // итог гонки с другом (соперник проехал или гонка отменилась)
  const dr = state.duelRes;
  if (dr && !(inRace() && raceMode === 'duel')) {
    return dr.refund
      ? { key: 'dr' + dr.id, duelRes: dr, icon: '⏱️', title: dr.declined ? `${dr.opp.name} отказался от гонки` : dr.noAnswer ? `${dr.opp.name} не ответил на вызов` : `Гонка с ${dr.opp.name} отменена`,
          sub: `${dr.declined || dr.noAnswer ? '' : 'не проехали вовремя · '}ставка ${money(dr.bet)} вернулась`, btn: 'Ок' }
      : { key: 'dr' + dr.id, duelRes: dr, icon: '🏁', title: `${dr.opp.name} проехал — итог гонки!`, sub: `на кону ${money(dr.bet * 2)}`, btn: 'Смотреть' };
  }
  // входящий вызов на гонку
  const inv = state.duelIn;
  if (inv && now() - inv.at < DUEL.acceptMs && !(inRace() && raceMode === 'duel')) {
    return { key: 'd' + inv.id, duel: inv, icon: '⚔️', title: `${inv.opp.name} вызывает на гонку`, sub: `ставка ${money(inv.bet)}`, btn: 'Открыть' };
  }
  const nt = (state.notices || [])[0];
  if (!nt) return null;
  const [icon, title, sub] = noticeView(nt);
  return { key: 'n' + nt.id, notice: nt, icon: nt.icon || icon, title: nt.title || `Тебе выдали: ${title}`, sub: nt.sub || (nt.title ? 'спасибо за поддержку ⭐' : sub || 'от DROPEZONE') };
}
function onGiftScreen(gf) {
  if (gf.kind === 'car') return tab === 'cases' && prefs.selCase === gf.caseId;
  if (gf.kind === 'part') return tab === 'shop' && shopView === 0 && prefs.selPartCase === gf.caseId && (prefs.selPartSlot || null) === (gf.slot || null);
  return tab === 'menu' && menuView === 'plates' && plateView === 0 && plateCase === gf.caseId;
}

let islandKey = null, islandTimer = null;
function islandEl() {
  let el = $('#island');
  if (!el) {
    el = document.createElement('div');
    el.id = 'island';
    el.className = 'island';
    document.body.appendChild(el);
  }
  return el;
}
function updateIsland() {
  const it = islandItem();
  const key = it ? it.key : null;
  if (key === islandKey) return;
  const el = islandEl();
  clearTimeout(islandTimer);
  const show = () => {
    islandKey = key;
    if (!it) return;
    el.innerHTML = `<div class="isl-in">
      <span class="isl-ic">${emo(it.gift ? '🎁' : it.icon, 30)}${it.gift ? `<span class="isl-case">${emo(it.icon, 16)}</span>` : ''}</span>
      <span class="isl-txt"><b>${esc(it.title)}</b><span>${esc(it.sub)}</span></span>
      <button class="isl-btn" data-act="island-take">${it.btn || 'Забрать'}</button>
    </div>`;
    el.classList.toggle('pass', !!it.pass);         // цвета пропуска
    el.classList.toggle('prem', !!it.pass && Rules.passPremOn(state, now()));
    el.classList.add('pop');                         // из «таблетки» сверху
    islandTimer = setTimeout(() => { el.classList.add('show'); haptic.soft(); }, 260);   // раскрывается в уведомление
  };
  if (el.classList.contains('pop')) {
    // прячем прежнее: сворачивается обратно в таблетку и уезжает вверх
    el.classList.remove('show');
    islandTimer = setTimeout(() => { el.classList.remove('pop'); islandTimer = setTimeout(show, 380); }, 300);
    islandKey = '…';
  } else show();
}

async function takeIsland() {
  const it = islandItem();
  if (!it) return;
  haptic.tap();
  if (it.gift) {
    const gf = it.gift;
    closeSheet();
    if (gf.kind === 'car') { prefs.selCase = gf.caseId; savePrefs(); caseView.car.phase = 'idle'; switchTab('cases'); }
    else if (gf.kind === 'part') { prefs.selPartCase = gf.caseId; prefs.selPartSlot = gf.slot || null; savePrefs(); shopView = 0; caseView.part.phase = 'idle'; switchTab('shop'); }
    else { plateView = 0; plateCase = gf.caseId; plateDrop = null; switchTab('menu', 'plates'); }
    updateIsland();
    return;
  }
  if (it.pass) return passClaim();
  if (it.contNew) {
    contMarkSeen(it.contNew.id);
    closeSheet();
    switchTab('cases');
    updateIsland();
    await contLoad(true);
    showAuc(it.contNew.id);
    return;
  }
  if (it.ev) {
    evMarkSeen(it.ev.id);
    closeSheet();
    prefs.selCase = it.ev.id; savePrefs(); caseView.car = { phase: 'idle' };
    switchTab('cases');
    updateIsland();
    return;
  }
  if (it.duelRes) {
    closeSheet();
    if (it.duelRes.refund) { if (await api('duelResSeen')) { updateIsland(); if (inRace() && !spinning) render(); } return; }
    raceMode = 'duel'; raceView = { phase: 'lobby' };
    switchTab('menu', 'race');
    updateIsland();
    duelShowRes();
    return;
  }
  if (it.duel) {
    closeSheet();
    raceMode = 'duel'; raceView = { phase: 'lobby' };
    switchTab('menu', 'race');
    updateIsland();
    return;
  }
  if (busy) return;
  busy = true;
  const r = await api('noticeAck', { id: it.notice.id });
  busy = false;
  if (!r) return;
  haptic.ok();
  updateBalance(true);
  if (typeof updateRewardBadge === 'function') updateRewardBadge();
  updateIsland();
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-act="island-take"]')) takeIsland();
});

// пока игра открыта — раз в 30 с узнаём, не прислал ли админ что-нибудь (только если игрок сам ничего не делает)
async function pollGifts() {
  if (MODE !== 'server' || document.hidden || busy || spinning || Date.now() - lastApiAt < 25e3) return;
  try {
    const res = await fetch(API + '/state', { headers: authHeaders() });
    const data = await res.json();
    if (!data.state || busy || spinning) return;
    const key = st => JSON.stringify([st.gifts, st.notices, st.money, st.duelIn?.id, st.duelRes?.id]);
    const before = key(state);
    state = Rules.migrate(data.state);
    if (data.now) clockOffset = data.now - Date.now();
    if (data.ecases) { const was = (globalThis.EVENT_CASES || []).map(c => c.id).join(); globalThis.EVENT_CASES = data.ecases; if (data.ecases.map(c => c.id).join() !== was) { updateIsland(); if (tab === 'cases' && !spinning) render(); } }
    const ct = data.cont || null, ctNew = ct?.id !== globalThis.contLive?.id;
    globalThis.contLive = ct;
    if (ctNew) { updateIsland(); if (typeof contLoad === 'function') contLoad(true); }
    if (key(state) !== before) {
      updateBalance(true);
      if (typeof updateRewardBadge === 'function') updateRewardBadge();
      updateIsland();
    }
  } catch {}
}
setInterval(pollGifts, 30e3);
