// ===== DROPZONE: AUTO — гонки (дрэг 402 м, 1 на 1 с ботом) =====
// Взнос, топливо и исход гонки решает сервер; здесь — экран, светофор и табло.
'use strict';

// два бака: общий (15 на все машины) и у каждой машины свой (5)
const fuelNow = car => Rules.fuelNow(car, now(), state);          // бак машины
const nextFuelMs = car => Rules.nextFuelMs(car, now(), state);
const gFuel = () => Rules.fuelNow(state, now(), state);           // общий бак
const gNextFuelMs = () => Rules.nextFuelMs(state, now(), state);
const { diffOf, racePrize, raceFee, luckK, botStartK } = Rules;
const rand = (a, b) => a + Math.random() * (b - a);

const mmss = ms => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// соперники машины лежат на сервере; если их ещё нет — просим сгенерировать и перерисовываем
let oppsLoading = null;
function opponentsFor(car) {
  const opps = state.raceOpps[car.uid];
  if (!opps && oppsLoading !== car.uid) {
    oppsLoading = car.uid;
    api('raceOpps', { uid: car.uid }).then(() => { oppsLoading = null; if (inRace() && !spinning) render(); });
  }
  return opps || null;
}

// шанс победы при нормальном старте (оценка методом Монте-Карло)
function winChance(myHp, botHp) {
  let w = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) if (myHp * luckK() > botHp * botStartK() * luckK()) w++;
  return Math.round(w / N * 100);
}

// ---------- экран «Гонки» ----------
let raceView = { phase: 'lobby' };
let raceMode = 'bots';   // 'bots' | 'duel' (гонки с друзьями)

function raceCar() {
  const cars = state.cars;
  return cars.find(c => c.uid === prefs.raceCar)
    || [...cars].sort((a, b) => (fuelNow(b) > 0) - (fuelNow(a) > 0) || carHp(b) - carHp(a))[0];
}

function fuelDots(car) {
  const f = fuelNow(car);
  return `<span class="fuel">${Array.from({ length: Rules.carFuelMax(car) }, (_, i) => `<i class="${i < f ? 'on' : ''}"></i>`).join('')}</span>`;
}

function renderRace() {
  if (!state.cars.length) {
    return `<div class="card empty-state">
      ${emo('🏁', 56)}
      <h3>Нет машины для гонки</h3>
      <p class="muted">Открой кейс и получи первую машину</p>
      <button class="btn" data-act="goto" data-tab="cases">К кейсам</button>
    </div>`;
  }
  if (raceView.phase === 'result') return raceResultHTML();
  if (raceView.phase === 'duel-result') return duelResultHTML();
  const seg = typeof duelsOn === 'function' && duelsOn() ? segmented('race-mode', raceMode === 'duel' ? 1 : 0, 'С ботами', 'С друзьями') : '';
  if (seg && raceMode === 'duel') return seg + renderDuels();
  return seg + raceLobbyHTML();
}

function raceLobbyHTML() {
  const car = raceCar();
  const d = CAR_BY_ID[car.id];
  const myHp = carHp(car);
  const fuel = gFuel(), carFuel = fuelNow(car);

  const cars = [...state.cars].sort((a, b) => carHp(b) - carHp(a)).map(c => {
    const cd = CAR_BY_ID[c.id];
    return `<button class="rc-card${c.uid === car.uid ? ' on' : ''}" data-act="race-car" data-uid="${c.uid}">
      <span class="cls" style="background:${rc(cd.r)}">${cd.r}</span>
      ${carPicOf(c)}
      <div class="name">${cd.name}</div>
      <div class="sub">${carHp(c)} л.с.</div>
      ${fuelDots(c)}
    </button>`;
  }).join('');

  const list = opponentsFor(car);
  const opps = list ? list.map((o, i) => {
    const od = CAR_BY_ID[o.carId];
    const diff = diffOf(o.diff);
    const ch = winChance(myHp, o.hp);
    return `<button class="list-row opp" data-act="race-go" data-i="${i}">
      <div class="opp-pic">${carPic(od)}</div>
      <div class="info">
        <div class="t">${o.name}</div>
        <div class="sub">${od.name} · ${o.hp} л.с.</div>
        <div class="s"><span class="chip diff" style="--dc:${diff.color}">${diff.name}</span><span class="chip">шанс <b>${ch}%</b></span></div>
      </div>
      <div class="r col"><b class="prize">+${money(racePrize(car, o))}</b><span class="fee">${raceFee(car, o) ? 'взнос ' + money(raceFee(car, o)) : 'без взноса'}</span></div>
    </button>`;
  }).join('') : `<div class="list-row static"><div class="info"><div class="t muted">Ищем соперников…</div></div></div>`;

  const fuelLine = fuel >= RACE.fuelMax
    ? 'Бак полный'
    : `+1 через <span id="fuel-timer">${mmss(gNextFuelMs())}</span>`;

  return `<div class="section-h" style="margin-top:4px"><span>Твоя машина</span><span>${state.cars.length}</span></div>
    <div class="race-cars">${cars}</div>
    <div class="card fuel-card">
      <div class="row"><span>${emo('⛽', 18)} Топливо <b>${fuel}/${RACE.fuelMax}</b></span><span class="muted small">${fuelLine}</span></div>
      <div class="fuel-bar"><i style="width:${fuel / RACE.fuelMax * 100}%"></i></div>
      <div class="row small" style="margin-top:10px"><span>Бак ${d.name}: <b>${carFuel}/${Rules.carFuelMax(car)}</b></span>
        <span class="muted">${carFuel >= Rules.carFuelMax(car) ? 'полный' : `+1 через <span id="car-fuel-timer">${mmss(nextFuelMs(car))}</span>`}</span></div>
      <div class="muted small" style="margin-top:4px">Общий бак — на все машины, и у каждой машины свой${Rules.nextActive() ? ': чем реже машина, тем меньше бак' : ` на ${RACE.carFuelMax} гонок`}</div>
      <div class="muted small" style="margin-top:6px">${d.name} · ${myHp} л.с.${myHp > d.hp ? ` <span class="plus">(+${myHp - d.hp} тюнинг)</span>` : ''}</div>
    </div>
    <div class="section-h"><span>Соперники · класс ${carClass(d)}</span><span>дрэг 402 м</span></div>
    <div class="list">${opps}</div>
    <div class="muted small" style="margin:12px 16px">Нажми на соперника, чтобы начать. На светофоре жми «Газ» ровно на зелёный: идеальный старт даёт +4% мощности, ${Rules.nextActive() ? 'фальстарт — сразу проигрыш' : 'фальстарт — −8%'}. При поражении взнос сгорает.</div>`;
}

// светофор: три жёлтых, пауза, зелёный → { reaction, falseStart }
async function raceLights() {
  const lights = [...$('#lights').children];
  let greenAt = 0, reaction = null, falseStart = false, tapped = false;
  raceTap = () => {
    if (tapped) return;
    tapped = true;
    { const g = $('#go-btn'); if (g) g.disabled = true; }
    if (!greenAt) {
      falseStart = true;
      haptic.err();
      setRaceMsg('Фальстарт!', true);
    } else {
      reaction = Math.round(performance.now() - greenAt);
      haptic.heavy();
    }
  };
  await wait(500);
  for (let k = 0; k < 3; k++) { lights[k].classList.add('on'); haptic.soft(); await wait(450); }
  await wait(rand(600, 1600));
  lights.forEach(l => l.classList.remove('on'));
  lights[3].classList.add('on');
  greenAt = performance.now();
  if (!falseStart) setRaceMsg('ГАЗ!');
  for (let t = 0; t < 1500 && !tapped; t += 20) await wait(20);
  if (!tapped) { tapped = true; reaction = null; { const g = $('#go-btn'); if (g) g.disabled = true; } }
  raceTap = null;
  return { reaction, falseStart };
}

// ---------- заезд ----------
let raceTap = null;   // обработчик нажатия «Газ» во время старта

async function startRace(i) {
  const car = raceCar();
  const opp = car && state.raceOpps[car.uid]?.[i];
  if (!car || !opp || spinning || busy) return;
  if (gFuel() < 1) { haptic.err(); toast(`Общий бак пуст · +1 через ${mmss(gNextFuelMs())}`); return; }
  if (fuelNow(car) < 1) { haptic.err(); toast(`У этой машины пустой бак · +1 через ${mmss(nextFuelMs(car))} — выбери другую`); return; }

  busy = true;
  const started = await api('raceStart', { uid: car.uid, i });
  busy = false;
  if (!started) return;
  updateBalance(true);
  haptic.tap();

  const d = CAR_BY_ID[car.id];
  const od = CAR_BY_ID[opp.carId];
  const myHp = carHp(car);
  spinning = true;
  document.body.classList.add('spinning', 'racing');

  const scr = $('#screen');
  scr.innerHTML = raceBoardHTML(d, od, myHp, opp, car.paint);
  scr.classList.remove('enter'); void scr.offsetWidth; scr.classList.add('enter');

  const { reaction, falseStart } = await raceLights();


  // исход решает сервер, табло его только показывает
  const r = await api('raceFinish', { reaction, falseStart });
  if (!r) {
    spinning = false;
    document.body.classList.remove('spinning', 'racing');
    raceView = { phase: 'lobby' };
    render(true);
    return;
  }
  setRaceMsg(r.start.name + (r.reaction ? ` · ${r.reaction} мс` : ''), falseStart);

  // дисквалификация: заезда нет
  if (r.dq) await wait(1200);
  else await runBoard(
    { T: r.myT, vMax: r.myV / 3.6, row: $('#row-you') },
    { T: r.botT, vMax: r.botV / 3.6, row: $('#row-bot') },
    r.win,
  );

  if (r.win) updateBalance(true);
  raceView = { phase: 'result', ...r, car: d, paint: car.paint, od };
  spinning = false;
  document.body.classList.remove('spinning', 'racing');
  r.win ? haptic.ok() : haptic.err();
  render(true);
}

// ---------- ТВ-табло заезда ----------
const RACE_SECONDS = 4.6;      // сколько реальных секунд длится заезд победителя
const GEARS = [0, 0.27, 0.45, 0.61, 0.76, 0.89];   // переключение передач (доля от скорости на финише)
const fmtT = t => t.toFixed(3).replace('.', ',');

function setRaceMsg(text, bad) {
  const m = $('#race-msg');
  if (!m) return;
  m.textContent = text;
  m.classList.toggle('bad', !!bad);
}

function raceBoardHTML(d, od, myHp, opp, paint) {
  const ticks = [18, 201].map(m => `<i class="tick" style="left:${m / 402 * 100}%"></i>`).join('');
  const row = (id, def, who, hp, p) => `<div class="tv-row" id="${id}">
      <div class="tv-car">${carPic(def, false, p)}</div>
      <div class="tv-info">
        <div class="tv-top"><b>${who}</b><span class="tv-v">${hp} л.с.</span></div>
        <div class="tv-bar">${ticks}<i class="fill"></i></div>
      </div>
    </div>`;
  return `<div class="race">
    <div class="tvb">
      <div class="tv-head">
        <div class="tv-col"><span class="tv-l">Время</span><b id="tv-time">0,000</b></div>
        <div class="tv-col r"><span class="tv-l">Разрыв</span><b id="tv-gap">—</b></div>
      </div>
      ${row('row-you', d, 'Ты', myHp, paint)}
      ${row('row-bot', od, esc(opp.name), opp.hp, opp.paint)}
      <div class="tv-marks"><span style="left:${18 / 402 * 100}%">18 м</span><span style="left:${201 / 402 * 100}%">201 м</span><span style="left:100%">402 м</span></div>
    </div>
    <div class="lights" id="lights"><i></i><i></i><i></i><i class="g"></i></div>
    <div class="hud">
      <div class="speed"><b id="spd">0</b><span>км/ч</span></div>
      <div class="rpm"><i id="rpm"></i></div>
      <div class="gear"><span>Передача</span><b id="gear">N</b></div>
    </div>
    <div class="race-msg" id="race-msg">Жми «Газ», когда загорится зелёный</div>
    <button class="btn go" id="go-btn" data-act="race-tap">ГАЗ!</button>
  </div>`;
}

// кадр анимации; таймер — запасной вариант, если окно свёрнуто и кадры не рисуются
const frame = () => new Promise(r => { let done = false; const go = () => { if (!done) { done = true; r(performance.now()); } }; requestAnimationFrame(go); setTimeout(go, 50); });

// расстояние по времени: d = 402·(t/T)^p, где p подобрано так, чтобы скорость на финише была реальной
const distAt = (c, t) => t <= 0 ? 0 : Math.min(402, 402 * Math.pow(t / c.T, c.p));
const speedAt = (c, t) => t <= 0 ? 0 : 402 * c.p * Math.pow(Math.min(t, c.T), c.p - 1) / Math.pow(c.T, c.p);

// bot = null — заезд в одиночку (гонка с другом: соперник едет отдельно)
async function runBoard(you, bot, win) {
  const cars = [you, bot].filter(Boolean);
  for (const c of cars) {
    c.p = Math.max(1.05, c.vMax * c.T / 402);
    c.fill = c.row.querySelector('.fill');
    c.v = c.row.querySelector('.tv-v');
  }
  const lead = win || !bot ? you : bot, last = !bot ? you : win ? bot : you;
  const els = { time: $('#tv-time'), gap: $('#tv-gap'), spd: $('#spd'), gear: $('#gear'), rpm: $('#rpm') };
  const speedup = lead.T / RACE_SECONDS;     // сколько секунд заезда проходит за 1 реальную секунду
  $('#lights').classList.add('gone');

  const endT = bot ? Math.min(last.T, lead.T * 1.25) : you.T;   // отставшего не ждём слишком долго
  let simT = 0, prev = performance.now(), gear = 1;
  while (true) {
    const now = await frame();
    simT = Math.min(simT + Math.min(0.05, (now - prev) / 1000) * speedup, endT);
    prev = now;

    for (const c of cars) {
      const dist = distAt(c, simT);
      c.fill.style.width = `${dist / 402 * 100}%`;
      if (simT >= c.T && !c.done) {
        c.done = true;                         // финишировал: показываем его время
        c.v.textContent = `${fmtT(c.T)} с`;
        c.row.classList.add('finished', c === lead ? 'winner' : 'loser');
        if (c === lead) haptic.heavy();
      } else if (!c.done) {
        c.v.textContent = `${Math.round(speedAt(c, simT) * 3.6)} км/ч`;
      }
    }
    els.time.textContent = fmtT(Math.min(simT, lead.T));
    if (bot) {
    const gapM = distAt(you, simT) - distAt(bot, simT);
    const avgV = Math.max(5, (speedAt(you, simT) + speedAt(bot, simT)) / 2);
    const gapS = lead.done ? Math.abs(you.T - bot.T) : Math.abs(gapM) / avgV;
    const ahead = lead.done ? win : gapM >= 0;
    els.gap.textContent = !lead.done && Math.abs(gapM) < 0.3 ? '0,00' : `${ahead ? '+' : '−'}${gapS.toFixed(2).replace('.', ',')}`;
    els.gap.className = ahead ? 'ahead' : 'behind';
    }

    // спидометр и передачи — твоей машины
    const v = speedAt(you, simT);
    els.spd.textContent = Math.round(v * 3.6);
    const frac = v / you.vMax;
    const g = GEARS.filter(x => frac >= x).length;
    if (g !== gear) { gear = g; tg?.HapticFeedback?.impactOccurred('medium'); }
    els.gear.textContent = simT > 0 ? gear : 'N';
    const lo = GEARS[gear - 1], hi = GEARS[gear] || 1.02;
    els.rpm.style.width = `${(35 + 65 * Math.min(1, (frac - lo) / (hi - lo))).toFixed(0)}%`;

    if (simT >= endT) break;
  }
  if (bot && !last.done) {
    last.v.textContent = `${fmtT(last.T)} с`;
    last.row.classList.add('finished', 'loser');
  }
  await wait(1300);
}

function raceResultHTML() {
  const v = raceView;
  const gap = Math.abs(v.myT - v.botT).toFixed(3);
  const reac = v.reaction ? ` · ${v.reaction} мс` : '';
  if (v.dq) return `<div class="race-result lose">
    <div class="rr-title">Фальстарт</div>
    <div class="muted">дисквалификация — газ раньше зелёного</div>
    ${v.fee ? `<div class="rr-money">−${money(v.fee)}</div>` : ''}
    <div class="muted small">${v.fee ? 'взнос сгорел · ' : ''}опыта нет</div>
  </div>
  <div class="card" style="margin-top:12px;text-align:center"><span class="muted">Жми только когда загорится зелёный ${emo('🟢', 15)}</span></div>
  <button class="btn" data-act="race-again">${v.fuel > 0 ? `Ещё гонка · топливо ${v.fuel}/${RACE.fuelMax}` : 'К гонкам'}</button>`;
  return `<div class="race-result ${v.win ? 'win' : 'lose'}">
    <div class="rr-title">${v.win ? 'Победа!' : 'Поражение'}</div>
    <div class="muted">${v.win ? 'быстрее' : 'медленнее'} на ${gap.replace('.', ',')} с</div>
    <div class="rr-money">${v.win ? `+${money(v.prize)}` : `−${money(v.fee)}`}</div>
    <div class="muted small">${!v.fee ? (v.win ? 'приз' : 'без взноса — ничего не потерял') : v.win ? `приз · взнос ${money(v.fee)} вернулся` : 'взнос сгорел'}</div>
  </div>
  <div class="list">
    <div class="list-row static rr-row${v.win ? ' first' : ''}">
      <div class="opp-pic">${carPic(v.car, false, v.paint)}</div>
      <div class="info"><div class="t">Ты${v.win ? ' ' + emo('🏆', 15) : ''}</div><div class="sub">${v.car.name}</div></div>
      <div class="r col"><b>${v.myT.toFixed(3).replace('.', ',')} с</b><span class="fee">${v.myV} км/ч</span></div>
    </div>
    <div class="list-row static rr-row${v.win ? '' : ' first'}">
      <div class="opp-pic">${carPic(v.od)}</div>
      <div class="info"><div class="t">${v.opp.name}${v.win ? '' : ' ' + emo('🏆', 15)}</div><div class="sub">${v.od.name}</div></div>
      <div class="r col"><b>${v.botT.toFixed(3).replace('.', ',')} с</b><span class="fee">${v.botV} км/ч</span></div>
    </div>
  </div>
  <div class="card" style="margin-top:12px;text-align:center"><span class="muted">${v.start.name}${reac}</span></div>
  <button class="btn" data-act="race-again">${v.fuel > 0 ? `Ещё гонка · топливо ${v.fuel}/${RACE.fuelMax}` : 'К гонкам'}</button>`;
}

// ---------- нажатия ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act } = el.dataset;
  if (act === 'race-car') {
    prefs.raceCar = el.dataset.uid;
    savePrefs();
    haptic.tick();
    render();
  } else if (act === 'race-go') {
    startRace(+el.dataset.i);
  } else if (act === 'race-tap') {
    raceTap?.();
  } else if (act === 'race-mode') {
    raceMode = +el.dataset.v === 1 ? 'duel' : 'bots';
    haptic.tick();
    render();
  } else if (act === 'race-again') {
    raceView = { phase: 'lobby' };
    haptic.tap();
    render(true);
  }
});

// нажатие «Газ» срабатывает сразу при касании, без задержки click
document.addEventListener('pointerdown', e => {
  if (e.target.closest('#go-btn')) { e.preventDefault(); raceTap?.(); }
});

// таймер топлива в лобби
setInterval(() => {
  if (!inRace() || raceView.phase !== 'lobby' || spinning) return;
  const car = raceCar();
  if (!car) return;
  // общий бак и бак машины — свои таймеры; перерисовка только когда реально прибавилось топливо
  for (const [id, ms] of [['fuel-timer', gNextFuelMs()], ['car-fuel-timer', nextFuelMs(car)]]) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (ms <= 1000) return render();
    el.textContent = mmss(ms);
  }
}, 1000);
