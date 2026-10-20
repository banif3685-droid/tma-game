// ===== DROPZONE: AUTO — награды: ежедневный бонус, кейс наград, коллекция, места в гараже =====
'use strict';

// ---------- даты: день считается по Москве (одинаково у всех игроков) ----------
const hhmmss = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const msToMidnight = () => Rules.msToNextDay(now());
const dailyAvailable = () => Rules.dailyAvailable(state, now());
const dailyNextDay = () => Rules.dailyNextDay(state, now());
const rewardCaseReady = () => Rules.rewardCaseReady(state, now());
const collectionGoals = () => Rules.collectionGoals(state);
const claimableGoals = () => collectionGoals().filter(g => g.done && !g.claimed);

// выданное сервером → для показа (машине нужна карточка)
const withDefs = items => items.map(it => it.kind === 'car' ? { ...it, def: CAR_BY_ID[it.id] } : it);
function afterGrant(items) {
  const car = items.find(it => it.kind === 'car' && it.uid);
  if (car) lastNewUid = car.uid;
  updateBalance(true);
  haptic.ok();
}

// ---------- ежедневный бонус, кейс наград, коллекция ----------
async function claimDaily() {
  const r = await api('daily');
  if (!r) return;
  afterGrant(r.items);
  showRewards(rewardFx(withDefs(r.items), `День ${r.day}`));
}

async function openRewardCase() {
  const r = await api('rewardCase');
  if (!r) return;
  afterGrant(r.items);
  showRewards(rewardFx(withDefs(r.items), 'Кейс наград'));
}

async function claimGoal(id) {
  const r = await api('claimGoal', { id });
  if (!r) return;
  afterGrant(r.items);
  if (document.body.classList.contains('sheet-open')) showRewards(rewardFx(withDefs(r.items), r.title));
  else { toast(r.title); render(); }
}

const rewardText = r => [r.money && `+${money(r.money)}`, r.secret && 'секретная машина', r.secretCase && 'секретный кейс 🔐', r.slots && `+${r.slots} ${r.slots === 1 ? 'место' : 'места'} в гараже`].filter(Boolean).join(' · ');

function goalRow(g) {
  const right = g.claimed ? `<span class="muted small">Получено ✓</span>`
    : g.done ? `<button class="pill" data-act="claim-goal" data-id="${g.id}">Забрать</button>`
    : `<span class="muted small">${g.have}/${g.need}</span>`;
  return `<div class="list-row static goal${g.done && !g.claimed ? ' ready' : ''}">
    <div class="ic">${emo(g.icon, 26)}</div>
    <div class="info"><div class="t">${g.title}</div><div class="sub">${rewardText(g.reward)}</div>
      ${g.done ? '' : `<div class="bar goal-bar"><i style="width:${g.have / g.need * 100}%"></i></div>`}</div>
    ${right}
  </div>`;
}

// блок наград в «Коллекции»
let allGoals = false;   // показать все награды коллекции или только первые
function collectionRewardsHTML() {
  const goals = collectionGoals();
  // сначала готовые к получению, потом ближайшие по прогрессу, полученные — в конце
  const order = g => g.done && !g.claimed ? -1 : g.claimed ? 2 : 1 - g.have / g.need;
  const sorted = [...goals].sort((a, b) => order(a) - order(b));
  const n = goals.filter(g => g.done && !g.claimed).length;
  const shown = allGoals ? sorted : sorted.slice(0, Math.max(3, n));
  const more = sorted.length - shown.length;
  return `<div class="section-h"><span>Награды за коллекцию</span><span>${n ? `можно забрать: ${n}` : ''}</span></div>
    <div class="list">${shown.map(goalRow).join('')}
      ${more > 0 || allGoals ? `<button class="list-row more" data-act="all-goals"><div class="info"><div class="t">${allGoals ? 'Свернуть' : `Показать все · ещё ${more}`}</div></div></button>` : ''}
    </div>`;
}

// ---------- места в гараже ----------
const slotPrice = () => Rules.slotPrice(state);

async function buySlot() {
  if (!(await api('buySlot'))) return;
  updateBalance(true);
  haptic.ok();
  toast(`Новое место в гараже · ${state.slots}/${GARAGE.maxSlots}`);
  render();
}

function buySlotCard() {
  if (state.slots >= GARAGE.maxSlots) return '';
  const price = slotPrice();
  const ok = state.money >= price;
  return `<button class="car-card empty buy" data-act="buy-slot" ${ok ? 'data-confirm="Ещё раз — купить"' : 'disabled'}>
    <div><div class="buy-plus">+</div><div>Купить место</div><div class="buy-price">${money(price)}</div></div>
  </button>`;
}

// ---------- окно «Награды» ----------
function rewardIcon(it) {
  if (it.kind === 'scase') return `<div class="rw-emo">${emo('🔐', 40)}</div>`;
  if (it.kind === 'plate') return `<div class="rw-emo">${plateHTML(it.plate, 'mini')}</div>`;
  if (it.kind === 'money') return `<div class="rw-emo">${emo('💰', 40)}</div>`;
  if (it.kind === 'fuel') return `<div class="rw-emo">${emo('⛽', 40)}</div>`;
  if (it.kind === 'slots') return `<div class="rw-emo">${emo('🅿️', 40)}</div>`;
  if (it.kind === 'xp') return `<div class="rw-emo">${emo('⭐', 40)}</div>`;
  if (it.kind === 'rcase') return `<div class="rw-emo">${emo('🎁', 40)}</div>`;
  if (it.kind === 'part') return `<div class="rw-pic part">${partPic(it.slot)}</div>`;
  return `<div class="rw-pic">${carPic(it.def)}</div>`;
}

function rewardLabel(it) {
  if (it.kind === 'scase') return '<b>Секретный кейс</b><span>крути на экране кейсов</span>';
  if (it.kind === 'plate') return `<b>Номер</b><span>${clsBadge(plateInfo(it.plate).rarity)}</span>`;
  if (it.kind === 'money') return `<b>+${money(it.amount)}</b>`;
  if (it.kind === 'fuel') return '<b>Полный бак</b><span>для гонок</span>';
  if (it.kind === 'slots') return `<b>+${it.n} ${it.n === 1 ? 'место' : 'места'}</b><span>в гараже</span>`;
  if (it.kind === 'xp') return `<b>+${it.n}</b><span>опыта</span>`;
  if (it.kind === 'rcase') return '<b>Кейс наград</b><span>можно открыть</span>';
  if (it.kind === 'part') return `<b>${partName(it.slot, it.t)}${it.n > 1 ? ` ×${it.n}` : ''}</b><span>${tierBadge(it.t)}</span>`;
  return `<b>${it.def.name}</b><span>${it.sold ? `гараж полон · продано +${money(it.sold)}` : it.waiting ? 'гараж полон · ждёт в 🎁' : clsBadge(it.def.r)}</span>`;
}

// показ полученного: плитки появляются по очереди
function rewardFx(items, title) {
  return `<div class="rw-fx">
    ${title ? `<div class="rw-title">${title}</div>` : ''}
    <div class="rw-items">${items.map((it, i) => {
      const t = it.kind === 'scase' ? 'X' : it.kind === 'part' ? it.t : it.kind === 'car' ? it.def.r : it.kind === 'plate' ? plateInfo(it.plate).rarity : 'C';
      return `<div class="rw-item" style="--rc:${rc(t)};animation-delay:${i * 0.18}s">${rewardIcon(it)}<div class="rw-l">${rewardLabel(it)}</div></div>`;
    }).join('')}</div>
  </div>`;
}

function showRewards(fx = '') {
  const today = dailyNextDay();
  const avail = dailyAvailable();
  const list = Rules.dailyList();
  const tiles = list.map((r, i) => {
    const day = i + 1;
    const taken = avail ? day < today : day <= today;
    const cur = avail && day === today;
    const big = day % 7 === 0;
    const icon = r.car ? (r.car === 'elite' ? '👑' : '🚗') : r.parts ? '🔧' : '💰';
    const label = r.car ? `Машина${big ? ` «${CASE_BY_ID[r.car].name}»` : ''}` : r.parts ? `Детали ×${r.parts.n}` : money(r.money).replace(' ₽', '');
    return `<div class="day${taken ? ' taken' : ''}${cur ? ' cur' : ''}${big ? ' big' : ''}">
      <span class="dn">День ${day}</span>${emo(icon, big ? 30 : 24)}<span class="dl">${label}</span>${taken ? '<span class="tick">✓</span>' : ''}
    </div>`;
  }).join('');
  const dailyBtn = avail
    ? `<button class="btn" data-act="claim-daily">Забрать · день ${today}</button>`
    : `<button class="btn" disabled>Следующий через <span data-timer="daily">${hhmmss(msToMidnight())}</span></button>`;
  const caseReady = rewardCaseReady();
  const goals = claimableGoals();

  const full = Rules.garageFull(state);
  const waiting = (state.waiting || []).map(c => {
    const d = CAR_BY_ID[c.id];
    return `<div class="list-row static">
      <div class="mk-pic">${carPic(d)}</div>
      <div class="info"><div class="t">${d.name}</div><div class="sub">${clsBadge(d.r)}${c.plate ? ' · с номером' : ''}</div></div>
      <div class="pills"><button class="pill" data-act="wait-take" data-uid="${c.uid}" ${full ? 'disabled' : ''}>В гараж</button>
        ${d.secret ? '' : `<button class="pill gray" data-act="wait-sell" data-uid="${c.uid}" data-confirm="Ещё раз">${money(Rules.sellPrice(c))}</button>`}</div>
    </div>`;
  }).join('');
  const html = `${sheetNav('Награды')}${fx}
    ${waiting ? `<div class="section-h"><span>Ждут места в гараже</span><span>${state.waiting.length}</span></div>
      <div class="list">${waiting}</div>
      <div class="muted small" style="margin:8px 4px 0">${full ? 'Гараж полон — продай машину или купи место, чтобы забрать.' : 'Место есть — забирай!'}</div>` : ''}
    <div class="section-h"><span>Ежедневный бонус</span><span>${Rules.nextActive() ? 'день' : 'серия:'} ${avail ? today - 1 : today} из ${list.length}</span></div>
    <div class="card">
      <div class="days">${tiles}</div>
      <div class="muted small" style="margin:10px 2px 12px">${Rules.nextActive()
        ? 'Заходи каждый день: на 7-й день — «Спорткар», на 14-й — «Элита». Пропустил день — ничего не сгорает, продолжишь с того же места. В новом сезоне — заново.'
        : 'Заходи каждый день — на 7-й день машина из «Спорткара». Пропустил день — серия начнётся заново.'}</div>
      ${dailyBtn}
    </div>
    <div class="section-h"><span>Кейс наград</span><span>раз в 4 часа</span></div>
    <div class="list"><div class="list-row static">
      <div class="ic">${emo('🎁', 30)}</div>
      <div class="info"><div class="t">Кейс наград</div><div class="sub">Деньги, деталь, полный бак или машина</div></div>
      ${caseReady ? `<button class="pill" data-act="open-reward-case">Открыть</button>`
        : `<span class="muted small" data-timer="rcase">${hhmmss(state.rewardCaseAt - now())}</span>`}
    </div></div>
    <div class="section-h"><span>Коллекция</span><span>${goals.length ? `можно забрать: ${goals.length}` : ''}</span></div>
    ${goals.length ? `<div class="list">${goals.map(goalRow).join('')}</div>`
      : `<div class="list"><button class="list-row" data-act="goto-collection"><div class="ic">${emo('📒', 26)}</div>
          <div class="info"><div class="t">Награды за коллекцию</div><div class="sub">Собирай машины и целые страны</div></div><div class="r">${CHEVRON_R}</div></button></div>`}`;
  const body = $('#sheet-body');
  if (document.body.classList.contains('sheet-open')) {
    body.innerHTML = html;
    body.scrollTop = 0;
  } else openSheet(html);
  updateRewardBadge();
}

// красная точка на кнопке 🎁, если есть что забрать
const anyReward = () => (state.waiting?.length > 0) || (state.gifts?.length > 0) || dailyAvailable() || rewardCaseReady() || claimableGoals().length > 0;
function updateRewardBadge() {
  const b = $('#gift');
  if (b) b.classList.toggle('dot', anyReward());
}

// ---------- нажатия ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act } = el.dataset;
  if (act === 'rewards') { haptic.tap(); showRewards(); }
  if (act === 'wait-take' || act === 'wait-sell') (async () => {
    if (busy) return;
    busy = true;
    const r = await api(act === 'wait-take' ? 'waitTake' : 'waitSell', { uid: el.dataset.uid });
    busy = false;
    if (!r) return;
    haptic.ok();
    updateBalance(act === 'wait-sell');
    toast(act === 'wait-take' ? 'Машина в гараже' : `Продано · +${money(r.price)}`);
    showRewards();
  })();
  else if (act === 'claim-daily') claimDaily();
  else if (act === 'open-reward-case') openRewardCase();
  else if (act === 'claim-goal') claimGoal(el.dataset.id);
  else if (act === 'goto-collection') { closeSheet(); switchTab('menu', 'collection'); }
  else if (act === 'buy-slot') buySlot();
  else if (act === 'all-goals') { allGoals = !allGoals; haptic.tick(); render(); }
});

// таймеры в окне наград и точка на кнопке
setInterval(() => {
  const d = document.querySelector('[data-timer="daily"]');
  if (d) { const ms = msToMidnight(); if (ms < 1000) showRewards(); else d.textContent = hhmmss(ms); }
  const c = document.querySelector('[data-timer="rcase"]');
  if (c) { const ms = state.rewardCaseAt - now(); if (ms <= 0) showRewards(); else c.textContent = hhmmss(ms); }
  updateRewardBadge();
}, 1000);

// при входе (когда прогресс загружен): если ежедневный бонус не забран — окно наград выезжает само
document.addEventListener('game-ready', () => {
  updateRewardBadge();
  if (dailyAvailable()) setTimeout(() => { if (!document.body.classList.contains('sheet-open')) showRewards(); }, 700);
});
