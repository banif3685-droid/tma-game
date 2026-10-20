// ===== Гонки с друзьями (релизное обновление): Меню → Гонки → «С друзьями» =====
// Вызываешь друга, который сейчас в игре, ставишь сколько угодно — ставка замораживается у обоих,
// каждый едет свой заезд отдельно (светофор, «Газ») в течение 5 минут — без задержек связи; время соперника скрыто.
// Итог — когда проехали оба (островок «Итог гонки» → повтор заезда обоих и результат), победитель забирает обе ставки.
// Не проехали оба вовремя — ставки возвращаются.
// Свои попытки (DUEL.perDay в день), бензин не тратится. Друзья — приглашённые по ссылке и добавленные по коду.
// Тестовая версия: друзья — боты (localStorage dz_duel_bots), они сами принимают вызов и едут свой заезд.
// С сервером: друзья — GET /duel/friends (приглашённые + по коду), добавить — POST /duel/add, вызов и ответы — действия
// duelCreate/duelTake/… (сервер передаёт вызов другу и его заезд), пока идёт гонка — опрос /state раз в 5 с.
'use strict';

const duelsOn = () => typeof nextOn === 'function' && nextOn();
const myFriendCode = () => 'DZ-' + Number(tgUser()?.id ?? ADMIN_IDS[0]).toString(36).toUpperCase();

// ---------- друзья-боты (тест) ----------
const DUEL_BOTS_KEY = 'dz_duel_bots';
function duelBots() {
  let list = null;
  try { list = JSON.parse(localStorage.getItem(DUEL_BOTS_KEY)); } catch {}
  if (!Array.isArray(list)) {
    list = ['Лёха_2107', 'Ника_STI', 'Максон'].map((name, i) => duelBotMake(name, i === 0 ? 'invited' : i === 1 ? 'inviter' : 'code'));
    duelBotsSave(list);
  }
  return list;
}
function duelBotsSave(list) { try { localStorage.setItem(DUEL_BOTS_KEY, JSON.stringify(list)); } catch {} }
// машина бота — примерно как лучшая у игрока (±30%), немного тюнинга
function duelBotMake(name, how) {
  const best = Math.max(150, ...state.cars.map(c => carHp(c)));
  const pool = Rules.baseCars().filter(c => c.hp > best * 0.6 && c.hp < best * 1.2);
  const d = pool[Math.floor(Math.random() * pool.length)] || Rules.baseCars()[0];
  const paint = Math.random() < 0.4 ? PAINTS[Math.floor(Math.random() * PAINTS.length)]?.id || null : null;
  return { id: 'b' + Math.random().toString(36).slice(2, 8), name, how, carId: d.id, hp: Math.round(d.hp * (1 + Math.random() * 0.35)), paint, at: Date.now() };
}
// «в сети» — у бота меняется раз в 5 минут
const duelOnline = id => {
  let h = 2166136261;
  for (const c of id + Math.floor(Date.now() / 300e3)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 100 < 65;
};
const oppOf = b => ({ id: b.id, name: b.name, carId: b.carId, hp: b.hp, paint: b.paint });

// ---------- друзья с сервера ----------
let duelFr = { list: null, at: 0, loading: false };
async function duelFriendsLoad(force) {
  if (MODE !== 'server' || duelFr.loading || (!force && Date.now() - duelFr.at < 15e3)) return;
  duelFr.loading = true;
  try {
    const d = await (await fetch(API + '/duel/friends', { headers: authHeaders() })).json();
    if (Array.isArray(d.friends)) duelFr.list = d.friends;
  } catch {}
  duelFr.at = Date.now();
  duelFr.loading = false;
  if (inRace() && raceMode === 'duel' && raceView.phase === 'lobby' && !spinning && !document.querySelector('.sheet.open')) render();
}
const duelList = () => MODE === 'server' ? duelFr.list || [] : duelBots();
const friendOnline = b => MODE === 'server' ? !!b.online && !b.busy : duelOnline(b.id);
const HOW = { invited: 'пригласил ты', inviter: 'пригласил тебя', code: 'по коду' };

// ---------- экран ----------
const leftMs = (from, span) => Math.max(0, from + span - now());

function renderDuels() {
  const left = Rules.duelLeft(state, now());
  const bots = duelList();
  duelFriendsLoad();
  const d = state.duel, inv = state.duelIn;
  let active = '';
  if (inv && leftMs(inv.at, DUEL.acceptMs) > 0) {
    const od = CAR_BY_ID[inv.opp.carId];
    active = `<div class="card duel-active in">
      <div class="duel-vs">${carPic(od, false, inv.opp.paint)}</div>
      <b>${esc(inv.opp.name)} вызывает тебя на гонку!</b>
      <div class="muted small">${od.name} · ${inv.opp.hp} л.с. · ставка <b>${money(inv.bet)}</b></div>
      <div class="muted small">Ответить: <span data-duel-timer="${inv.at + DUEL.acceptMs}">${mmss(leftMs(inv.at, DUEL.acceptMs))}</span></div>
      <div class="row-btns"><button class="btn" data-act="duel-accept">Принять</button><button class="btn gray" data-act="duel-decline">Отказаться</button></div>
    </div>`;
  }
  const dr = state.duelRes;
  if (dr && !dr.refund) {
    active += `<div class="card duel-active go">
      <div class="duel-vs">${CAR_BY_ID[dr.carId] ? carPic(CAR_BY_ID[dr.carId], false, dr.paint) : ''}<span class="vs">VS</span>${carPic(CAR_BY_ID[dr.opp.carId], false, dr.opp.paint)}</div>
      <b>${esc(dr.opp.name)} проехал — итог готов!</b>
      <div class="muted small">На кону <b>${money(dr.bet * 2)}</b></div>
      <button class="btn" data-act="duel-res">${emo('🏁', 18)} Смотреть итог</button>
    </div>`;
  } else if (dr) {
    active += `<div class="card duel-active">
      <b>${dr.declined ? `${esc(dr.opp.name)} отказался от гонки` : dr.noAnswer ? `${esc(dr.opp.name)} не ответил на вызов` : `Гонка с ${esc(dr.opp.name)} отменена`}</b>
      <div class="muted small">${dr.declined || dr.noAnswer ? '' : `${dr.iRan ? `${esc(dr.opp.name)} не проехал` : 'Заезд не состоялся'} за ${DUEL.runMs / 60e3} мин · `}ставка <b>${money(dr.bet)}</b> вернулась</div>
      <button class="btn gray" data-act="duel-res-ok">Понятно</button>
    </div>`;
  }
  if (d) {
    const od = CAR_BY_ID[d.opp.carId];
    const mine = state.cars.find(c => c.uid === d.uid);
    const timer = `<span data-duel-timer="${d.goAt + DUEL.runMs}">${mmss(leftMs(d.goAt, DUEL.runMs))}</span>`;
    active += d.status === 'go' && d.my
      ? `<div class="card duel-active go">
        <div class="duel-vs">${mine ? carPicOf(mine) : ''}<span class="vs">VS</span>${carPic(od, false, d.opp.paint)}</div>
        <b>Ты проехал: ${d.my.dq ? 'фальстарт' : `${fmtT(d.my.T)} с`}</b>
        <div class="muted small">Ждём заезд ${esc(d.opp.name)}… <span class="duel-wait-dots"></span> осталось ${timer}</div>
        <div class="muted small">Время соперника откроется, когда он проедет. Можно играть дальше — итог придёт сверху</div>
      </div>`
      : d.status === 'wait'
      ? `<div class="card duel-active">
        <div class="duel-vs">${carPic(od, false, d.opp.paint)}</div>
        <b>Ждём ответа от ${esc(d.opp.name)}…</b>
        <div class="muted small">Ставка <b>${money(d.bet)}</b> заморожена · вернётся, если откажется</div>
        <button class="btn gray" data-act="duel-cancel">Отменить вызов</button>
      </div>`
      : `<div class="card duel-active go">
        <div class="duel-vs">${mine ? carPicOf(mine) : ''}<span class="vs">VS</span>${carPic(od, false, d.opp.paint)}</div>
        <b>${d.role === 'from' ? `${esc(d.opp.name)} принял вызов!` : `Гонка с ${esc(d.opp.name)}`}</b>
        <div class="muted small">На кону <b>${money(d.bet * 2)}</b> · проехать за ${timer}</div>
        <div class="muted small">Свой заезд у каждого — соперник едет отдельно</div>
        <button class="btn" data-act="duel-go">${emo('🏁', 18)} Ехать!</button>
      </div>`;
  }
  const busyDuel = !!d || !!dr;
  const rows = bots.map(b => {
    const on = friendOnline(b), bd = CAR_BY_ID[b.carId];
    return `<div class="list-row static duel-friend">
      <div class="ic duel-ava">${emo('🏎️', 22)}<i class="dot${on ? ' on' : ''}"></i></div>
      <div class="info"><div class="t">${esc(b.name)}</div>
        <div class="sub">${b.busy ? 'в гонке' : on ? '<span class="ok">в сети</span>' : 'не в сети'} · ${bd?.name || ''} · ${b.hp} л.с.${MODE === 'server' && HOW[b.how] ? ` · ${HOW[b.how]}` : ''}</div></div>
      <button class="pill" data-act="duel-call" data-id="${b.id}" ${!on || busyDuel || !left ? 'disabled' : ''}>Вызвать</button>
    </div>`;
  }).join('');
  const log = (state.duelLog || []).slice(0, 10).map(l => `<div class="list-row static">
      <div class="ic">${emo(l.refund ? '⏱️' : l.draw ? '🤝' : l.win ? '🏆' : l.dq ? '🚫' : '💨', 22)}</div>
      <div class="info"><div class="t">${esc(l.name)}</div><div class="sub">${new Date(l.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${l.refund ? ' · не проехали вовремя' : l.draw ? ' · оба фальстарт' : l.dq ? ' · фальстарт' : l.oppDq ? ' · соперник фальстартовал' : ''}</div></div>
      <div class="r"><b class="${l.refund || l.draw ? 'muted' : l.win ? 'ok' : 'bad'}">${l.refund || l.draw ? 'возврат' : (l.win ? '+' : '−') + money(l.bet)}</b></div>
    </div>`).join('');

  return `${active}
    <div class="card duel-head">
      <div class="row"><b>${emo('⚔️', 20)} Гонки с друзьями</b><span class="muted small">попыток <b>${left}/${DUEL.perDay}</b></span></div>
      <div class="muted small" style="margin-top:6px">Вызови друга, который сейчас в игре. Ставку забирает победитель — у каждого свой заезд, бензин не тратится</div>
      <div class="duel-code"><span class="muted small">Твой код</span><b>${myFriendCode()}</b>
        <button class="pill gray" data-act="duel-code-copy">Скопировать</button></div>
    </div>
    <div class="section-h"><span>Друзья</span><button class="link-btn" data-act="duel-add">+ Добавить по коду</button></div>
    <div class="list">${rows || `<div class="list-row static"><div class="info muted">${MODE === 'server' && !duelFr.list ? 'Загружаем друзей…' : 'Пока никого — пригласи друга или добавь по коду'}</div></div>`}</div>
    ${typeof gameAdmin === 'function' && gameAdmin() ? `<button class="pill gray" style="margin:10px 4px" data-act="duel-test-in">Тест: вызов от друга</button>` : ''}
    ${log ? `<div class="section-h">История</div><div class="list">${log}</div>` : ''}`;
}

// ---------- вызов: выбор машины и ставки ----------
let duelPick = null;   // { opp, uid, accept }
function duelSheet(opp, accept) {
  duelPick = duelPick?.opp?.id === opp.id && duelPick.accept === accept ? duelPick : { opp, uid: raceCar()?.uid, accept };
  const p = duelPick;
  const car = state.cars.find(c => c.uid === p.uid) || raceCar();
  if (!car) { toast('Нужна машина'); return; }
  p.uid = car.uid;
  const od = CAR_BY_ID[opp.carId];
  const cars = [...state.cars].sort((a, b) => carHp(b) - carHp(a)).map(c => `<button class="rc-card${c.uid === car.uid ? ' on' : ''}" data-act="duel-car" data-uid="${c.uid}">
      <span class="cls" style="background:${rc(CAR_BY_ID[c.id].r)}">${CAR_BY_ID[c.id].r}</span>${carPicOf(c)}
      <div class="name">${CAR_BY_ID[c.id].name}</div><div class="sub">${carHp(c)} л.с.</div></button>`).join('');
  const ch = winChance(carHp(car), opp.hp);
  openSheet(`${sheetNav(accept ? 'Принять вызов' : 'Вызов на гонку')}
    <div class="duel-vs big">${carPicOf(car)}<span class="vs">VS</span>${carPic(od, false, opp.paint)}</div>
    <div class="duel-names"><span>Ты · ${carHp(car)} л.с.</span><span>${esc(opp.name)} · ${opp.hp} л.с.</span></div>
    <div class="muted small" style="text-align:center;margin:6px 0 10px">Шанс победы при нормальном старте ~<b>${ch}%</b></div>
    <div class="section-h">Твоя машина</div>
    <div class="race-cars">${cars}</div>
    ${accept ? `<div class="card duel-bet-fixed"><span class="muted">Ставка</span><b>${money(accept.bet)}</b></div>
      <button class="btn" data-act="duel-take" ${state.money < accept.bet ? 'disabled' : ''}>${state.money < accept.bet ? 'Не хватает денег' : `Принять · ${money(accept.bet)}`}</button>`
    : `<div class="section-h">Ставка</div>
      <div class="card duel-bet">
        <input id="duel-bet" type="number" inputmode="numeric" min="${DUEL.minBet}" step="10000" value="${p.bet || Math.min(state.money, 100e3)}">
        <div class="duel-quick">${[100e3, 1e6, 10e6].map(v => `<button class="pill gray" data-act="duel-bet" data-v="${v}" ${state.money < v ? 'disabled' : ''}>${money(v)}</button>`).join('')}
          <button class="pill gray" data-act="duel-bet" data-v="${state.money}">Всё</button></div>
        <div class="muted small">Ставка замораживается у обоих, победитель забирает обе. От ${money(DUEL.minBet)}</div>
      </div>
      <button class="btn" data-act="duel-send">${emo('⚔️', 18)} Вызвать</button>`}`);
}

async function duelSend() {
  const p = duelPick;
  const bet = Math.floor(+($('#duel-bet')?.value || 0));
  if (!p || busy) return;
  busy = true;
  const r = await api('duelCreate', { opp: p.opp, uid: p.uid, bet });
  busy = false;
  if (!r) return;
  haptic.ok();
  updateBalance(true);
  closeSheet();
  toast(`Вызов отправлен ${p.opp.name}`);
  if (MODE === 'server') { duelFr.at = 0; return; }   // ответ друга придёт с сервера (опрос раз в 5 с)
  // тест: бот принимает через пару секунд
  const id = state.duel.id;
  setTimeout(async () => {
    if (state.duel?.id !== id || state.duel.status !== 'wait') return;
    if (!await api('duelAcceptLocal')) return;
    haptic.ok();
    toast(`${p.opp.name} принял вызов — езжай!`);
    if (inRace() && !spinning) render();
  }, 2000 + Math.random() * 3000);
}

// ---------- заезд: свой, отдельно от соперника ----------
async function duelGo() {
  const d = state.duel;
  const car = d && state.cars.find(c => c.uid === d.uid);
  if (!car || spinning || busy) return;
  const dd = CAR_BY_ID[car.id], od = CAR_BY_ID[d.opp.carId];
  spinning = true;
  document.body.classList.add('spinning', 'racing');
  const scr = $('#screen');
  scr.innerHTML = raceBoardHTML(dd, od, carHp(car), d.opp, car.paint);
  const ghost = $('#row-bot');   // соперник едет отдельно — его заезд скрыт
  ghost.classList.add('ghost');
  ghost.querySelector('.tv-v').textContent = 'едет отдельно';
  scr.classList.remove('enter'); void scr.offsetWidth; scr.classList.add('enter');
  const { reaction, falseStart } = await raceLights();
  const r = await api('duelRun', { reaction, falseStart });
  if (!r) {
    spinning = false;
    document.body.classList.remove('spinning', 'racing');
    render(true);
    return;
  }
  setRaceMsg(r.my.start.name + (r.my.reaction ? ` · ${r.my.reaction} мс` : ''), r.my.dq);
  if (r.my.dq) await wait(1200);
  else await runBoard({ T: r.my.T, vMax: r.my.V / 3.6, row: $('#row-you') }, null, true);
  spinning = false;
  document.body.classList.remove('spinning', 'racing');
  if (r.done && state.duelRes && !state.duelRes.refund) return duelShowRes();   // соперник уже проехал — сразу итог
  haptic.tap();
  raceView = { phase: 'lobby' };
  render(true);
}

// итог: повтор заездов обоих и результат
async function duelShowRes() {
  const dr = state.duelRes;
  if (!dr || dr.refund || spinning) return;
  const dd = CAR_BY_ID[dr.carId] || CAR_BY_ID[dr.opp.carId], od = CAR_BY_ID[dr.opp.carId];
  spinning = true;
  document.body.classList.add('spinning', 'racing');
  const scr = $('#screen');
  scr.innerHTML = raceBoardHTML(dd, od, dr.my.hp, dr.opp, dr.paint);
  $('#go-btn')?.remove();
  scr.classList.remove('enter'); void scr.offsetWidth; scr.classList.add('enter');
  setRaceMsg('Итог гонки');
  await wait(700);
  if (dr.my.dq || dr.oppRun.dq) { setRaceMsg(dr.my.dq ? 'Твой фальстарт' : `${dr.opp.name}: фальстарт`, true); await wait(1200); }
  else await runBoard({ T: dr.my.T, vMax: dr.my.V / 3.6, row: $('#row-you') }, { T: dr.oppRun.T, vMax: dr.oppRun.V / 3.6, row: $('#row-bot') }, dr.win);
  raceView = { phase: 'duel-result', ...dr, car: dd, od };
  await api('duelResSeen');
  updateBalance(true);
  updateIsland?.();
  spinning = false;
  document.body.classList.remove('spinning', 'racing');
  dr.win ? haptic.ok() : dr.draw ? haptic.tap() : haptic.err();
  render(true);
}

function duelResultHTML() {
  const v = raceView, my = v.my, op = v.oppRun;
  const why = v.draw ? 'оба фальстартовали — ставки вернулись' : my.dq ? 'фальстарт — дисквалификация' : op.dq ? `${esc(v.opp.name)} фальстартовал`
    : `${v.win ? 'быстрее' : 'медленнее'} на ${Math.abs(my.T - op.T).toFixed(3).replace('.', ',')} с`;
  const row = (me, def, name, run, p) => `<div class="list-row static rr-row${!v.draw && me === v.win ? ' first' : ''}">
      <div class="opp-pic">${carPic(def, false, p)}</div>
      <div class="info"><div class="t">${name}${!v.draw && me === v.win ? ' ' + emo('🏆', 15) : ''}</div><div class="sub">${def.name}${run.reaction ? ` · реакция ${run.reaction} мс` : ''}</div></div>
      <div class="r col"><b>${run.dq ? 'DQ' : fmtT(run.T) + ' с'}</b><span class="fee">${run.dq ? 'фальстарт' : run.V + ' км/ч'}</span></div>
    </div>`;
  return `<div class="race-result ${v.win ? 'win' : 'lose'}">
    <div class="rr-title">${v.draw ? 'Ничья' : v.win ? 'Победа!' : my.dq ? 'Фальстарт' : 'Поражение'}</div>
    <div class="muted">${why}</div>
    <div class="rr-money">${v.draw ? money(0) : v.win ? `+${money(v.bet)}` : `−${money(v.bet)}`}</div>
    <div class="muted small">${v.draw ? 'никто не потерял' : v.win ? `забираешь ставку ${esc(v.opp.name)}` : `ставка ушла ${esc(v.opp.name)}`}</div>
  </div>
  <div class="list">${row(true, v.car, 'Ты', my, v.paint)}${row(false, v.od, esc(v.opp.name), op, v.opp.paint)}</div>
  <button class="btn" data-act="duel-back">К друзьям</button>`;
}

// ---------- нажатия ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act^="duel-"]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  if (act === 'duel-call') {
    const b = duelList().find(x => x.id === el.dataset.id);
    if (!b) return;
    if (b.busy) { toast('Друг сейчас в другой гонке'); return; }
    if (!friendOnline(b)) { toast('Друг сейчас не в игре'); return; }
    haptic.tap(); duelPick = null; duelSheet(oppOf(b));
  } else if (act === 'duel-car') {
    duelPick.uid = el.dataset.uid; duelPick.bet = +($('#duel-bet')?.value || 0) || undefined;
    haptic.tick(); duelSheet(duelPick.opp, duelPick.accept);
  } else if (act === 'duel-bet') {
    const i = $('#duel-bet'); if (i) i.value = Math.floor(+el.dataset.v); haptic.tick();
  } else if (act === 'duel-send') duelSend();
  else if (act === 'duel-go') { haptic.tap(); duelGo(); }
  else if (act === 'duel-res') { haptic.tap(); duelShowRes(); }
  else if (act === 'duel-res-ok') { if (await api('duelResSeen')) { updateIsland?.(); render(); } }
  else if (act === 'duel-back') { raceView = { phase: 'lobby' }; raceMode = 'duel'; haptic.tap(); render(true); }
  else if (act === 'duel-cancel') { if (await api('duelCancel')) { updateBalance(true); toast('Вызов отменён, ставка вернулась'); render(); } }
  else if (act === 'duel-decline') { if (await api('duelDecline')) { render(); updateIsland?.(); } }
  else if (act === 'duel-accept') { const inv = state.duelIn; if (inv) { haptic.tap(); duelPick = null; duelSheet(inv.opp, inv); } }
  else if (act === 'duel-take') {
    if (busy) return;
    busy = true;
    const r = await api('duelTake', { uid: duelPick.uid });
    busy = false;
    if (!r) return;
    haptic.ok(); updateBalance(true); closeSheet(); updateIsland?.();
  } else if (act === 'duel-code-copy') {
    try { await navigator.clipboard.writeText(myFriendCode()); haptic.ok(); toast('Код скопирован'); } catch { toast(myFriendCode()); }
  } else if (act === 'duel-add') {
    haptic.tap();
    openSheet(`${sheetNav('Добавить друга')}
      <div class="muted small" style="margin:0 4px 10px">Попроси у друга его код (Меню → Гонки → С друзьями) и введи сюда</div>
      <input id="duel-code" class="promo-input" placeholder="DZ-…" autocomplete="off" style="text-transform:uppercase">
      <button class="btn" style="margin-top:12px" data-act="duel-add-go">Добавить</button>`);
  } else if (act === 'duel-add-go') {
    const code = ($('#duel-code')?.value || '').trim().toUpperCase();
    if (!/^DZ-[0-9A-Z]{3,12}$/.test(code)) { haptic.err(); toast('Код вида DZ-XXXXX'); return; }
    if (code === myFriendCode()) { toast('Это твой код'); return; }
    if (MODE === 'server') {
      if (busy) return;
      busy = true;
      let d = {};
      try { d = await (await fetch(API + '/duel/add', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })).json(); }
      catch { d = { error: 'Нет связи с сервером' }; }
      busy = false;
      if (d.error) { haptic.err(); toast(d.error); return; }
      haptic.ok(); closeSheet(); toast(`${d.name} теперь в друзьях`);
      duelFriendsLoad(true);
      return;
    }
    // тест: по любому коду добавляется друг-бот
    const list = duelBots();
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    list.push(duelBotMake(name, 'code'));
    duelBotsSave(list);
    haptic.ok(); closeSheet(); toast(`${name} теперь в друзьях`);
  } else if (act === 'duel-test-in') {
    const on = duelBots().filter(b => duelOnline(b.id));
    const b = on[Math.floor(Math.random() * on.length)] || duelBots()[0];
    if (await api('duelIncomingLocal', { opp: oppOf(b), bet: [100e3, 500e3, 1e6][Math.floor(Math.random() * 3)] })) { render(); updateIsland?.(); }
  }
});

// таймеры (ответ на вызов, время на заезд)
setInterval(() => {
  document.querySelectorAll('[data-duel-timer]').forEach(el => {
    const ms = Math.max(0, +el.dataset.duelTimer - now());
    el.textContent = mmss(ms);
  });
  // входящий вызов истёк — убираем
  if (state?.duelIn && now() - state.duelIn.at > DUEL.acceptMs && !busy) {
    api('duelDecline').then(() => { if (inRace() && !spinning) render(); updateIsland?.(); });
  }
}, 1000);

// с сервером: пока идёт гонка (или открыт экран друзей) — раз в 5 с забираем прогресс: ответ друга, его заезд, итог
const duelKey = st => JSON.stringify([st.duel?.id, st.duel?.status, !!st.duel?.my, st.duelIn?.id, st.duelRes?.id, st.money]);
setInterval(async () => {
  if (MODE !== 'server' || !state || busy || spinning || document.hidden) return;
  const lobby = inRace() && raceMode === 'duel' && raceView.phase === 'lobby';
  if (!state.duel && !lobby) return;
  try {
    const data = await (await fetch(API + '/state', { headers: authHeaders() })).json();
    if (!data.state || busy || spinning) return;
    const before = duelKey(state);
    state = Rules.migrate(data.state);
    if (data.now) clockOffset = data.now - Date.now();
    if (duelKey(state) === before) return;
    if (state.duel?.status === 'go' && !state.duel.my) { haptic.ok(); toast(`${state.duel.opp.name} принял вызов — езжай!`); }
    updateBalance(true);
    updateIsland?.();
    if (lobby && !document.querySelector('.sheet.open')) render();
  } catch {}
}, 5000);

// время вышло (друг не ответил / не проехал) — итог считают правила: просим сервер пересчитать
setInterval(async () => {
  const d = state?.duel;
  if (!d || busy || spinning) return;
  const late = d.status === 'wait' ? now() > d.at + DUEL.acceptMs + 16e3 : now() > d.goAt + DUEL.runMs + 1e3;
  if (MODE === 'server' && !late) return;
  if (MODE !== 'server' && (d.status !== 'go' || !(d.my || late))) return;
  const r = await api('duelTick');
  if (!r || state.duel) return;
  haptic.ok();
  updateBalance(true);
  updateIsland?.();
  if (inRace() && raceMode === 'duel' && raceView.phase === 'lobby' && !spinning) render();
}, 5000);
