// ===== Апгрейд (релизное обновление): Меню → «Апгрейд» =====
// Ставишь деньги и сам выбираешь шанс (1–75%). Колесо: зелёная дуга — шанс выигрыша, стрелка крутится и останавливается.
// Где остановится стрелка, решает сервер (Rules.actions.upgrade); выигрыш = ставка × 0,95 / шанс.
'use strict';

let upChance = 50, upBet = null, upSpin = 0, upLast = null, upLog = [];

const upMult = () => Rules.upgradeMult(upChance);
const upBetNow = () => Math.max(0, Math.min(upBet ?? Math.min(100e3, Rules.upgradeMaxBet(state)), Rules.upgradeMaxBet(state)));
const fmtMult = m => '×' + (m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace('.', ',');

// дуга выигрыша: от верха по часовой стрелке на chance% окружности
function upArc(chance) {
  const r = 120, c = 140, a = Math.min(99.99, chance) / 100 * 2 * Math.PI;
  const x = c + r * Math.sin(a), y = c - r * Math.cos(a);
  return `M ${c} ${c - r} A ${r} ${r} 0 ${chance > 50 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

function renderUpgrade() {
  const bet = upBetNow(), max = Rules.upgradeMaxBet(state);
  const ticks = Array.from({ length: 40 }, (_, i) => `<i style="transform:rotate(${i * 9}deg)"></i>`).join('');
  const res = upLast ? `<div class="up-res ${upLast.win ? 'win' : 'lose'}">${upLast.win ? `+${money(upLast.prize)}` : `−${money(upLast.bet)}`}</div>` : '';
  return `<div class="up-wrap">
    <div class="up-wheel" id="up-wheel">
      <div class="up-ticks">${ticks}</div>
      <svg viewBox="0 0 280 280">
        <circle cx="140" cy="140" r="120" class="up-track"/>
        <path id="up-arc" d="${upArc(upChance)}" class="up-arc"/>
      </svg>
      <div class="up-needle" id="up-needle" style="transform:rotate(${upSpin}deg)"><i></i></div>
      <div class="up-center">
        <b id="up-chance">${upChance}%</b>
        <span id="up-mult">${fmtMult(upMult())}</span>
        <div id="up-res">${res}</div>
      </div>
    </div>

    <div class="card up-card">
      <div class="row"><span class="muted small">Шанс</span><b id="up-chance2">${upChance}%</b></div>
      <input type="range" id="up-range" min="${UPGRADE.minChance}" max="${UPGRADE.maxChance}" step="1" value="${upChance}">
      <div class="up-chips">${[10, 25, 50, 75].map(c => `<button class="pill gray${c === upChance ? ' on' : ''}" data-act="up-ch" data-v="${c}">${c}%</button>`).join('')}</div>
    </div>

    <div class="card up-card">
      <div class="row"><span class="muted small">Ставка</span><span class="muted small">максимум ${money(max)}</span></div>
      <input id="up-bet" type="number" inputmode="numeric" min="${UPGRADE.minBet}" step="10000" value="${bet}">
      <div class="up-chips">
        <button class="pill gray" data-act="up-bet" data-k="0.5">½</button>
        <button class="pill gray" data-act="up-bet" data-k="2">×2</button>
        <button class="pill gray" data-act="up-bet" data-v="${Math.floor(max * 0.25)}">25%</button>
        <button class="pill gray" data-act="up-bet" data-v="${max}">Макс</button>
      </div>
      <div class="row up-win"><span>Выигрыш</span><b id="up-prize">${money(Math.floor(bet * upMult()))}</b></div>
    </div>

    <button class="btn up-go" data-act="up-go" ${bet >= UPGRADE.minBet ? '' : 'disabled'}>${emo('🎯', 18)} Апгрейд</button>
    <div class="muted small" style="margin:10px 6px;text-align:center">Стрелка в зелёной зоне — выигрыш. Чем меньше шанс, тем больше множитель. Ставка — до половины денег</div>
    ${upLog.length ? `<div class="section-h">Последние</div><div class="up-log">${upLog.map(l => `<span class="${l.win ? 'win' : 'lose'}">${l.chance}% · ${l.win ? '+' + money(l.prize) : '−' + money(l.bet)}</span>`).join('')}</div>` : ''}
  </div>`;
}

// обновить цифры без перерисовки (ползунок, ставка)
function upRefresh() {
  const bet = upBetNow();
  $('#up-arc')?.setAttribute('d', upArc(upChance));
  for (const id of ['up-chance', 'up-chance2']) { const el = document.getElementById(id); if (el) el.textContent = upChance + '%'; }
  const m = document.getElementById('up-mult'); if (m) m.textContent = fmtMult(upMult());
  const p = document.getElementById('up-prize'); if (p) p.textContent = money(Math.floor(bet * upMult()));
  document.querySelectorAll('[data-act="up-ch"]').forEach(b => b.classList.toggle('on', +b.dataset.v === upChance));
  const go = document.querySelector('[data-act="up-go"]'); if (go) go.disabled = bet < UPGRADE.minBet;
}

async function upGo() {
  if (busy || spinning) return;
  const bet = upBetNow();
  busy = true;
  const r = await api('upgrade', { bet, chance: upChance });
  busy = false;
  if (!r) return;
  spinning = true;
  document.body.classList.add('spinning');
  $('#up-res').innerHTML = '';
  haptic.tap();
  // стрелка: несколько оборотов + до точки roll (0–100% окружности от верха)
  const base = Math.ceil(upSpin / 360) * 360;
  upSpin = base + 360 * 5 + r.roll * 3.6;
  const needle = $('#up-needle');
  needle.style.transition = 'transform 4.2s cubic-bezier(.12,.75,.15,1)';
  needle.style.transform = `rotate(${upSpin}deg)`;
  // щелчки вибрацией, пока крутится
  let ticks = 0;
  const tickT = setInterval(() => { if (++ticks < 30) haptic.tick(); }, 140);
  await wait(4300);
  clearInterval(tickT);
  spinning = false;
  document.body.classList.remove('spinning');
  upLast = r;
  upLog = [r, ...upLog].slice(0, 8);
  r.win ? haptic.ok() : haptic.err();
  updateBalance(true);
  if (!$('#up-wheel')) return;   // экран уже закрыт
  $('#up-wheel').classList.add(r.win ? 'win' : 'lose');
  setTimeout(() => $('#up-wheel')?.classList.remove('win', 'lose'), 1200);
  $('#menu-body').innerHTML = renderUpgrade();
  const n = $('#up-needle'); if (n) { n.style.transition = 'none'; n.style.transform = `rotate(${upSpin}deg)`; }
}

document.addEventListener('input', e => {
  if (e.target.id === 'up-range') { upChance = +e.target.value; haptic.tick(); upRefresh(); }
  else if (e.target.id === 'up-bet') { upBet = Math.floor(+e.target.value || 0); upRefresh(); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act^="up-"]');
  if (!el || el.disabled || spinning) return;
  const act = el.dataset.act;
  if (act === 'up-ch') { upChance = +el.dataset.v; const r = $('#up-range'); if (r) r.value = upChance; haptic.tick(); upRefresh(); }
  else if (act === 'up-bet') {
    const cur = upBetNow();
    upBet = el.dataset.v ? +el.dataset.v : Math.floor(cur * +el.dataset.k);
    upBet = Math.min(Math.max(upBet, UPGRADE.minBet), Rules.upgradeMaxBet(state));
    const i = $('#up-bet'); if (i) i.value = upBet;
    haptic.tick(); upRefresh();
  } else if (act === 'up-go') upGo();
});
