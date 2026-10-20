// ===== DROPZONE: AUTO — профиль: уровень, опыт, задания =====
'use strict';

// цвет кольца по уровню: серый → синий → фиолетовый → оранжевый → золотой
const levelColor = L => L >= 20 ? '#d4a017' : L >= 15 ? RARITIES.A.color : L >= 10 ? RARITIES.B.color : L >= 5 ? RARITIES.C.color : RARITIES.D.color;
const SILHOUETTE = `<svg viewBox="0 0 40 40" class="sil"><circle cx="20" cy="15" r="7.5"/><path d="M6.5 36c1.2-7.6 6.6-11.5 13.5-11.5S32.3 28.4 33.5 36z"/></svg>`;

function avatarHTML(big) {
  const need = xpNeed(state.level);
  const p = Math.min(1, state.xp / need);
  return `<div class="ava${big ? ' big' : ''}" style="--lc:${levelColor(state.level)};--p:${(p * 100).toFixed(1)}%">
    <div class="ava-in">${SILHOUETTE}</div><span class="ava-lv">${state.level}</span></div>`;
}

const questClaimable = () => {
  const nq = Rules.newbieQuest(state);
  if (nq) return nq.done;
  return Rules.dailyQuests(state, now()).some(d => d.done && !d.claimed) || Rules.dailyAllReady(state, now())
    || Rules.weeklyQuests(state, now()).some(w => w.done && !w.claimed);
};
// награда недельного задания — коротко
const weekRewardText = r => [r.money && `+${money(r.money)}`, r.car && `кейс «${CASE_BY_ID[r.car].name}»`, r.parts && `«${CASE_BY_ID[r.parts.case].name}» ×${r.parts.n}`].filter(Boolean).join(' · ');

function updateAvatar() {
  const b = $('#avatar');
  if (!b) return;
  const html = avatarHTML(false);
  if (b.innerHTML !== html) b.innerHTML = html;
  b.classList.toggle('dot', questClaimable());
}

// ---------- окно профиля ----------
function questRow(title, have, need, reward, btn) {
  return `<div class="list-row static quest${btn ? ' ready' : ''}">
    <div class="info"><div class="t">${title}</div>
      <div class="sub">${reward}</div>
      ${have < need ? `<div class="bar goal-bar"><i style="width:${have / need * 100}%"></i></div>` : ''}</div>
    ${btn || `<span class="muted small">${have}/${need}</span>`}
  </div>`;
}

function questsHTML() {
  const nq = Rules.newbieQuest(state);
  if (nq) {
    const { q, have, done } = nq;
    return `<div class="section-h"><span>Задания новичка</span><span>${nq.i + 1} из ${NEWBIE_QUESTS.length}</span></div>
      <div class="list">${questRow(q.title, have, q.need, `+${money(q.money)} · +${q.xp} опыта`,
        done ? `<button class="pill" data-act="quest" data-kind="newbie">Забрать</button>` : '')}</div>`;
  }
  const list = Rules.dailyQuests(state, now());
  const claimedN = list.filter(d => d.claimed).length;
  const allRow = Rules.nextActive() ? `<div class="list-row static quest all${Rules.dailyAllReady(state, now()) ? ' ready' : ''}">
      <div class="ic">${emo('🎁', 24)}</div>
      <div class="info"><div class="t">Бонус за все задания дня</div><div class="sub">Кейс наград сразу · +${DAILY_ALL_BONUS.xp} опыта</div></div>
      ${state.dq.all ? `<span class="muted small">Получено ✓</span>` : Rules.dailyAllReady(state, now()) ? `<button class="pill" data-act="quest" data-kind="dailyAll">Забрать</button>` : `<span class="muted small">${claimedN}/${list.length}</span>`}
    </div>` : '';
  const weekly = Rules.weeklyQuests(state, now());
  const wHTML = weekly.length ? `<div class="section-h"><span>Задания недели</span><span>ещё ${Math.ceil(Rules.msToWeekEnd(now()) / 86400e3)} дн</span></div>
    <div class="list">${weekly.map(w => questRow(w.q.title, w.have, w.q.need, `${weekRewardText(w.q.reward)} · +${WEEKLY_XP} опыта`,
      w.claimed ? `<span class="muted small">Получено ✓</span>` : w.done ? `<button class="pill" data-act="quest" data-kind="weekly" data-id="${w.q.id}">Забрать</button>` : '')).join('')}</div>` : '';
  return `<div class="section-h"><span>Задания на сегодня</span><span>обновятся через <span data-timer="quests">${hhmmss(msToMidnight())}</span></span></div>
    <div class="list">${list.map(d => questRow(d.q.title, d.have, d.q.need, `+${money(d.money)} · +${DAILY_QUEST_XP} опыта`,
      d.claimed ? `<span class="muted small">Получено ✓</span>` : d.done ? `<button class="pill" data-act="quest" data-kind="daily" data-id="${d.q.id}">Забрать</button>` : '')).join('')}${allRow}</div>
    ${wHTML}`;
}

function showProfile(fx = '') {
  const u = tg?.initDataUnsafe?.user;
  const need = xpNeed(state.level);
  const gift = Rules.levelGift(state.level + 1);
  const giftText = [`+${money(gift.money)}`, gift.car && `машина «${CASE_BY_ID[gift.car].name}»`, gift.parts && `детали ×${gift.parts.n}`, gift.slots && `+${gift.slots} место`].filter(Boolean).join(' · ');
  const st = state.stats;
  const base = Rules.baseCars();
  const garageValue = [...state.cars, ...state.museum].reduce((s, c) => s + carValue(c), 0);
  const html = `${sheetNav('Профиль')}${fx}
    <div class="prof-head">
      ${avatarHTML(true)}
      <div class="prof-name">${u?.first_name ? u.first_name.replace(/[<>&]/g, '') : 'Гонщик'}${Rules.vipOn(state, now()) ? ' <span class="vip-badge">VIP</span>' : ''}</div>
      <div class="muted small">Уровень ${state.level}${u?.id ? ` · <span class="prof-id" data-act="copy-id" data-id="${+u.id}">ID ${+u.id}</span>` : ''}</div>
      ${founderBadge(state.founder, hasBeta(state), Rules.nextActive() && state.awards)}
      ${(state.badges || []).length ? `<div class="prof-badges">${state.badges.map(b => `<span class="prof-badge" title="Сезон ${b.season}">${emo(b.place === 1 ? '🏆' : b.place <= 3 ? '🥈' : '🏅', 14)} S${b.season} · #${b.place}</span>`).join('')}</div>` : ''}
      <div class="bar prof-bar" style="--lc:${levelColor(state.level)}"><i style="width:${state.xp / need * 100}%"></i></div>
      <div class="muted small">${state.xp} / ${need} опыта · на ${state.level + 1} уровне: ${giftText}</div>
      ${Rules.passOn() ? `<button class="btn pass-open${Rules.passPremOn(state, now()) ? ' prem' : ''}" data-act="pass-open">${emo('🎟️', 18)} Сезонный пропуск · ${Math.min(state.level, PASS.levels)}/${PASS.levels}</button>` : ''}
      <div class="muted small">Опыт за кейсы, номера и детали сегодня: ${XP_GRIND_DAY - Rules.grindXpLeft(state, now())}/${XP_GRIND_DAY}</div>
    </div>
    ${questsHTML()}
    <div class="section-h"><span>Статистика</span></div>
    <div class="card admin-stats prof-stats">
      <div><b>${state.cars.length}</b><span>в гараже</span></div>
      <div><b>${state.discovered.filter(id => !CAR_BY_ID[id]?.secret).length}/${base.length}</b><span>коллекция</span></div>
      <div><b>${money(garageValue).replace(' ₽', '')}</b><span>стоимость, ₽</span></div>
      <div><b>${st.opened}</b><span>кейсов</span></div>
      <div><b>${st.wins}/${st.races}</b><span>побед / гонок</span></div>
      <div><b>${st.merged}</b><span>слияний</span></div>
    </div>
    <div class="muted small" style="margin:12px 16px">Опыт дают гонки (победы больше), новые машины в коллекции, ежедневный бонус и задания — без ограничений. Кейсы, номера, слияние и установка деталей — до ${XP_GRIND_DAY} опыта в день.</div>`;
  const body = $('#sheet-body');
  if (document.body.classList.contains('sheet-open') && body.querySelector('.prof-head')) {
    const sheet = $('#sheet'), h0 = sheet.offsetHeight;
    body.innerHTML = html;
    body.scrollTop = 0;
    sheetResize(sheet, h0);
  } else openSheet(html);
  updateAvatar();
}

async function claimQuest(kind, id) {
  const r = await api('questClaim', { kind, id });
  if (!r) return;
  updateBalance(true);
  haptic.ok();
  showProfile(rewardFx([...withDefs(r.items), { kind: 'xp', n: r.xp }], r.title));
}

// ---------- сезонный пропуск (релизное обновление) ----------
const passText = r => [r.money && money(r.money), r.car && `«${CASE_BY_ID[r.car].name}»`,
  r.cars && `«${CASE_BY_ID[r.cars.case].name}»${r.cars.n > 1 ? ` ×${r.cars.n}` : ''}`,
  r.parts && `детали ${emo(CASE_BY_ID[r.parts.case].icon, 13)} ×${r.parts.n}`, r.slots && `+${r.slots} место`, r.secretRandom && 'секретная машина', r.passCar && (Rules.passCar(state, now())?.name || 'машина сезона')].filter(Boolean).join(' + ');
const passIcon = r => r.passCar ? '🏎️' : r.secretRandom ? '🔐' : r.car || r.cars ? '🚗' : r.parts ? '🔧' : '💰';

function showPass(fx = '') {
  const prem = Rules.passPremOn(state, now());
  const lv = state.level, need = xpNeed(lv);
  const rows = Array.from({ length: PASS.levels - 1 }, (_, i) => {
    const L = i + 2, got = lv >= L && !(state.passPending || []).includes(L), free = Rules.levelGift(L), pr = passPrem(L), big = L % 5 === 0;
    return `<div class="pass-row${got ? ' got' : ''}${L === lv + 1 ? ' next' : ''}${big ? ' big' : ''}">
      <span class="pass-lv">${L}</span>
      <div class="pass-cell">${emo(passIcon(free), 18)}<span>${passText(free)}</span>${got ? '<i class="pass-ok">✓</i>' : ''}</div>
      <div class="pass-cell prem${prem ? '' : ' locked'}">${emo(prem ? passIcon(pr) : '🔒', 18)}<span>${passText(pr)}</span>${got && prem ? '<i class="pass-ok">✓</i>' : ''}</div>
    </div>`;
  }).join('');
  const html = `${sheetNav('Сезонный пропуск')}${fx}
    <div class="card pass-head${prem ? ' prem' : ''}">
      <div class="row"><b>${emo('🎟️', 20)} Сезон ${Rules.seasonId(now(), state)}</b><span class="muted small">уровень <b>${Math.min(lv, PASS.levels)}/${PASS.levels}</b></span></div>
      <div class="bar prof-bar" style="margin:10px 0 6px"><i style="width:${lv >= PASS.levels ? 100 : state.xp / need * 100}%"></i></div>
      <div class="muted small">Уровни — это твой уровень в сезоне: опыт за гонки, кейсы, задания. На новом уровне сверху появится уведомление — нажми «Забрать»</div>
      ${prem ? `<div class="pass-prem-on">${emo('👑', 16)} Премиум активен до конца сезона</div>`
        : `<button class="btn gold" style="margin-top:12px" data-act="pass-buy" data-confirm="Купить премиум за ${PASS.stars} ⭐?">${emo('👑', 18)} Премиум · ${emo('⭐', 16)} ${PASS.stars}</button>
           <div class="muted small" style="margin-top:6px;text-align:center">Награды правой колонки за пройденные уровни — сразу. На ${PASS.levels} уровне — секретная машина</div>`}
    </div>
    ${(state.passPending || []).length ? `<button class="btn pass-open" data-act="pass-claim">${emo('🎁', 18)} Забрать награды · ${state.passPending.length === 1 ? `уровень ${state.passPending[0]}` : `${state.passPending.length} уровня`}</button>` : ''}
    <div class="pass-cols"><span></span><span>Бесплатно</span><span>${emo('👑', 13)} Премиум</span></div>
    <div class="pass-list">${rows}</div>`;
  const body = $('#sheet-body');
  if (document.body.classList.contains('sheet-open') && body.querySelector('.pass-head')) { body.innerHTML = html; body.scrollTop = 0; }
  else openSheet(html);
  setTimeout(() => $('.pass-row.next')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
}

// забрать награды за новые уровни (из уведомления сверху или с экрана пропуска)
async function passClaim() {
  if (busy) return;
  busy = true;
  const r = await api('passClaim');
  busy = false;
  if (!r) return;
  haptic.ok();
  updateBalance(true);
  updateIsland();
  showPass(rewardFx(withDefs(r.items), r.levels.length > 1 ? `Уровни ${r.levels.join(', ')}` : `Уровень ${r.levels[0]}`));
}

function passBuy() {
  starChoice(PASS.stars, 'Премиум-пропуск', () => passBuyDo(true), () => MODE === 'server' ? payStars('pass') : passBuyDo(false));
}
async function passBuyDo(useStars) {
  if (busy) return;
  busy = true;
  const r = await api('shopBuy', { item: 'pass', useStars });
  busy = false;
  if (!r) return;
  haptic.ok();
  updateBalance(true);
  showPass(r.items.length ? rewardFx(withDefs(r.items), 'Премиум-пропуск: награды за пройденные уровни') : '');
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act="pass-open"], [data-act="pass-buy"], [data-act="pass-claim"]');
  if (!el || el.disabled) return;
  haptic.tap();
  if (el.dataset.act === 'pass-open') showPass(); else if (el.dataset.act === 'pass-claim') passClaim(); else passBuy();
});

// ---------- поздравление с новым уровнем ----------
function showLevelUps() {
  if (!levelUpQueue.length || spinning || document.body.classList.contains('sheet-open')) return;
  const ups = levelUpQueue.splice(0);
  const top = ups[ups.length - 1].level;
  const items = withDefs(ups.flatMap(u => u.items));
  haptic.ok();
  openSheet(`${sheetNav('')}
    <div class="lvl-up" style="--lc:${levelColor(top)}">
      <div class="lvl-burst">${avatarHTML(true)}</div>
      <div class="lvl-title">Уровень ${top}!</div>
      <div class="muted">${ups.length > 1 ? `Сразу +${ups.length} уровня — ` : ''}подарок уже у тебя</div>
    </div>
    ${rewardFx(items, '')}
    <button class="btn" data-act="close" style="margin-top:14px">Отлично</button>`);
  updateAvatar();
}

// ---------- нажатия и таймеры ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const { act } = el.dataset;
  if (act === 'profile') { haptic.tap(); showProfile(); }
  else if (act === 'copy-id') {   // ID игрока — нажатие копирует (для поддержки)
    haptic.tap();
    navigator.clipboard?.writeText(el.dataset.id).then(() => toast('ID скопирован'), () => toast('ID ' + el.dataset.id));
  }
  else if (act === 'quest') claimQuest(el.dataset.kind, el.dataset.id);
});

setInterval(() => {
  const t = document.querySelector('[data-timer="quests"]');
  if (t) t.textContent = hhmmss(msToMidnight());
  updateAvatar();
  showLevelUps();
}, 1000);

document.addEventListener('game-ready', updateAvatar);

// наградные плашки: «Основатель» (награда донатерам, цвет по уровню DONOR_TIERS) и «Бета-тестер» (получил бета-машину)
const AWARD_METAL = { 1: '#f5c542', 2: '#aeb6c2', 3: '#cd7f32' };
function founderBadge(id, beta, awards) {
  const t = id && typeof DONOR_TIERS !== 'undefined' && DONOR_TIERS.find(x => x.id === id);
  const aw = (awards || []).map(x => { const a = typeof AWARDS !== 'undefined' && AWARDS[x.k]; return a &&
    `<span class="award founder" style="--fc:${AWARD_METAL[x.p] || '#0a84ff'}">${emo(a.icon, 15)} ${esc(a.name)}${x.k === 'champ' ? ` #${x.p}` : ''}</span>`; });
  const items = [
    t && `<span class="award founder" style="--fc:${t.color}">${emo('👑', 15)} ${esc(t.name)}</span>`,
    ...aw,
    beta && `<span class="award beta">${emo('🏁', 15)} Бета-тестер</span>`,
  ].filter(Boolean);
  return items.length ? `<div class="prof-badges awards">${items.join('')}</div>` : '';
}
const hasBeta = S => !!BETA_CAR && Rules.nextActive() && (S.cars || []).some(c => c.id === BETA_CAR.id);
