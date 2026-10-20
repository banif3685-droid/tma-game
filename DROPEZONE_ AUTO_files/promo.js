// ===== Промокоды: ввод игроком (раздел «Меню») и управление в админ-панели =====
// Проверяет и выдаёт награду только сервер; в локальном режиме промокоды не работают.

const CHANNEL_LINK = 'https://t.me/channel_guardian_bot?start=CHK-1004402834072';   // вход в канал через проверку «не бот»
let promoFx = '';   // показ полученной награды под полем ввода

function renderPromo() {
  return `<div class="card promo-card">
    <div class="promo-hero">${emo('🎟️', 52)}</div>
    <h3>Промокод</h3>
    <p class="muted">Свежие коды — в канале <button class="link" data-act="open-channel">@dropezone_game</button></p>
    <input id="promo-input" class="promo-input" placeholder="Введи промокод" maxlength="32"
      autocomplete="off" autocapitalize="characters" spellcheck="false">
    <button class="btn" data-act="promo-redeem">Активировать</button>
  </div>
  <div id="promo-result">${promoFx}</div>`;
}

async function redeemPromo() {
  const input = $('#promo-input');
  const code = input?.value.trim();
  if (!code) { haptic.err(); toast('Введи промокод'); input?.focus(); return; }
  if (MODE !== 'server') { haptic.err(); toast('Промокоды работают только в Telegram'); return; }
  if (busy) return;
  busy = true;
  const btn = document.querySelector('[data-act="promo-redeem"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Проверяем…'; }
  let data = null;
  try {
    const res = await fetch(API + '/promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ code }),
    });
    data = await res.json();
  } catch {
    toast('Нет связи с сервером');
  }
  busy = false;
  if (btn) { btn.disabled = false; btn.textContent = 'Активировать'; }
  if (!data) { haptic.err(); return; }
  if (data.now) clockOffset = data.now - Date.now();
  if (data.maintenance && !data.state) { showMaintenance(data.maintenance); return; }
  if (data.subscribe && !data.state) { subscribeGate(data.subscribe).then(() => render()); return; }
  if (data.state) state = Rules.migrate(data.state);
  if (data.error) { haptic.err(); toast(data.error); return; }
  noteLevelUps(data.result);
  haptic.heavy();
  updateBalance(true);
  promoFx = rewardFx(withDefs(data.result.items), `Промокод ${data.result.code}`);
  if (tab === 'menu' && menuView === 'promo') $('#menu-body').innerHTML = renderPromo();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'promo-redeem') redeemPromo();
  if (el.dataset.act === 'open-channel') {
    haptic.tap();
    if (tg?.openTelegramLink) tg.openTelegramLink(CHANNEL_LINK); else window.open(CHANNEL_LINK, '_blank');
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'promo-input') { e.target.blur(); redeemPromo(); }
});

// ---------- админ-панель: промокоды ----------
const PROMO_HOURS = [[0, 'Бессрочно'], [1, '1 час'], [24, '24 часа'], [72, '3 дня'], [168, '7 дней'], [720, '30 дней']];
let promoDraft = null;

const newDraft = () => ({ code: '', maxUses: '', hours: 0, money: '', xp: '', carId: '', slots: 0, fuel: false, rcase: false, parts: [] });

function randomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(6); crypto.getRandomValues(a);
  return 'DZ' + [...a].map(x => abc[x % abc.length]).join('');
}

// перед перерисовкой сохраняем то, что админ уже ввёл
function readDraft() {
  if (!promoDraft) return;
  const v = id => document.getElementById(id)?.value;
  if (!document.getElementById('apr-code')) return;
  Object.assign(promoDraft, {
    code: v('apr-code'), maxUses: v('apr-uses'), hours: +v('apr-hours'),
    money: v('apr-money'), xp: v('apr-xp'), carId: v('apr-car'), slots: +v('apr-slots'),
  });
}

function promoRewardText(r) {
  const out = [];
  if (r.money) out.push(money(r.money));
  if (r.carId) out.push(CAR_BY_ID[r.carId]?.name || r.carId);
  (r.parts || []).forEach(x => out.push(`${partName(x.slot, x.t)} ×${x.n}`));
  if (r.xp) out.push(`${r.xp} опыта`);
  if (r.fuel) out.push('полный бак');
  if (r.rcase) out.push('кейс наград');
  if (r.slots) out.push(`+${r.slots} мест`);
  return out.join(' · ');
}

async function showPromos(keepScroll) {
  if (!promoDraft) promoDraft = newDraft();
  const data = await adminFetch('/admin/promos');
  if (!data) return;
  const d = promoDraft;
  const carOpts = '<option value="">— без машины —</option>' + RARITY_ORDER.concat('X', 'E').map(r => `<optgroup label="${RARITIES[r]?.name || 'Секретные'}">${
    CARS.filter(c => c.r === r).map(c => `<option value="${c.id}"${d.carId === c.id ? ' selected' : ''}>${c.name}</option>`).join('')}</optgroup>`).join('');
  const toggle = (key, label) => `<button class="pill${d[key] ? ' on' : ' gray'}" data-act="apr-toggle" data-k="${key}">${d[key] ? '✓ ' : ''}${label}</button>`;

  const list = data.promos.map(p => {
    const expired = p.expires_at && data.now > p.expires_at;
    const ended = p.max_uses && p.uses >= p.max_uses;
    const status = !p.active ? 'выключен' : expired ? 'срок истёк' : ended ? 'закончился' : 'активен';
    const left = p.expires_at && !expired ? ` · до ${new Date(p.expires_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '';
    return `<div class="card promo-row${status === 'активен' ? '' : ' off'}">
      <div class="row"><button class="promo-code" data-act="apr-copy" data-code="${esc(p.code)}">${esc(p.code)}</button>
        <span class="small ${status === 'активен' ? 'ok' : 'muted'}">${status}</span></div>
      <div class="small">${esc(promoRewardText(p.reward))}</div>
      <div class="muted small">Использован ${p.uses}${p.max_uses ? ` из ${p.max_uses}` : ' · без лимита'}${left}</div>
      <div class="pills wrap">
        ${abtn('apr-active', p.active ? 'Выключить' : 'Включить', `data-code="${esc(p.code)}" data-on="${p.active ? 0 : 1}"`)}
        ${abtn('apr-delete', 'Удалить', `danger data-confirm="Удалить?" data-code="${esc(p.code)}"`)}
      </div></div>`;
  }).join('') || '<div class="card" style="text-align:center"><span class="muted">Промокодов пока нет</span></div>';

  const html = `${sheetNav('Промокоды', { act: 'adm-back', label: 'Админка' })}
    <div class="section-h">Новый промокод</div>
    <div class="card admin-card">
      <div class="admin-row"><input id="apr-code" class="admin-input" placeholder="Сам промокод, например SUMMER25" maxlength="32"
        autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(d.code)}">${abtn('apr-random', '🎲')}</div>
      <div class="admin-row">
        <input id="apr-uses" class="admin-input" type="number" inputmode="numeric" min="0" placeholder="Использований (пусто — без лимита)" value="${esc(d.maxUses)}">
        <select id="apr-hours" class="admin-input short">${PROMO_HOURS.map(([h, l]) => `<option value="${h}"${d.hours === h ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="muted small">Что даёт (можно несколько):</div>
      <div class="admin-row"><span class="apr-l">${emo('💰', 18)}</span><input id="apr-money" class="admin-input" type="number" inputmode="numeric" min="0" placeholder="Деньги, ₽" value="${esc(d.money)}"></div>
      <div class="admin-row"><span class="apr-l">${emo('⭐', 18)}</span><input id="apr-xp" class="admin-input" type="number" inputmode="numeric" min="0" placeholder="Опыт" value="${esc(d.xp)}"></div>
      <div class="admin-row"><span class="apr-l">${emo('🚗', 18)}</span><select id="apr-car" class="admin-input">${carOpts}</select></div>
      <div class="admin-row"><span class="apr-l">${emo('🔧', 18)}</span>
        <select id="apr-slot" class="admin-input">${[...SLOTS, ...EV_SLOTS].map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
        <select id="apr-tier" class="admin-input short">${RARITY_ORDER.map(t => `<option value="${t}">${PART_TIERS[t].name}</option>`).join('')}</select>
        <input id="apr-n" class="admin-input tiny" type="number" inputmode="numeric" min="1" max="100" value="1">
        ${abtn('apr-part-add', '+')}</div>
      ${d.parts.length ? `<div class="adm-cars">${d.parts.map((x, i) => `<button class="chip" data-act="apr-part-del" data-i="${i}">${partName(x.slot, x.t)} ×${x.n} ✕</button>`).join('')}</div>` : ''}
      <div class="admin-row"><span class="apr-l">${emo('🅿️', 18)}</span>
        <select id="apr-slots" class="admin-input">${[0, 1, 2, 3, 5].map(n => `<option value="${n}"${d.slots === n ? ' selected' : ''}>${n ? `+${n} мест в гараже` : 'Без мест в гараже'}</option>`).join('')}</select></div>
      <div class="pills wrap">${toggle('fuel', 'Полный бак')}${toggle('rcase', 'Кейс наград сейчас')}</div>
      <button class="btn" data-act="apr-create">Создать промокод</button>
    </div>
    <div class="section-h">Все промокоды · ${data.promos.length}</div>
    <div id="apr-list">${list}</div>`;
  const body = $('#sheet-body');
  if (keepScroll && document.body.classList.contains('sheet-open') && body.querySelector('#apr-code')) {
    const top = body.scrollTop; body.innerHTML = html; body.scrollTop = top;
  } else openSheet(html);
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act^="apr-"], [data-act="adm-promos"]');
  if (!el || el.disabled || typeof isAdmin !== 'function' || !isAdmin()) return;
  const act = el.dataset.act;
  if (act === 'adm-promos') { haptic.tap(); showPromos(); return; }
  readDraft();
  const d = promoDraft;
  if (act === 'apr-random') { d.code = randomCode(); haptic.tick(); showPromos(true); }
  else if (act === 'apr-toggle') { d[el.dataset.k] = !d[el.dataset.k]; haptic.tick(); showPromos(true); }
  else if (act === 'apr-part-add') {
    const n = Math.max(1, Math.min(100, +$('#apr-n').value | 0));
    d.parts.push({ slot: $('#apr-slot').value, t: $('#apr-tier').value, n });
    haptic.tick(); showPromos(true);
  }
  else if (act === 'apr-part-del') { d.parts.splice(+el.dataset.i, 1); haptic.tick(); showPromos(true); }
  else if (act === 'apr-copy') {
    try { await navigator.clipboard.writeText(el.dataset.code); toast(`Скопировано: ${el.dataset.code}`); } catch { toast(el.dataset.code); }
    haptic.tap();
  }
  else if (act === 'apr-create') {
    const reward = { money: +d.money || 0, xp: +d.xp || 0, carId: d.carId || undefined, parts: d.parts, fuel: d.fuel, rcase: d.rcase, slots: d.slots };
    const r = await adminFetch('/admin/promo-create', { code: d.code, maxUses: +d.maxUses || 0, hours: d.hours, reward });
    if (!r) return;
    haptic.ok();
    try { await navigator.clipboard.writeText(r.code); } catch {}
    toast(`Промокод ${r.code} создан и скопирован`);
    promoDraft = newDraft();
    showPromos(true);
  }
  else if (act === 'apr-active') {
    if (await adminFetch('/admin/promo-toggle', { code: el.dataset.code, active: el.dataset.on === '1' })) { haptic.ok(); showPromos(true); }
  }
  else if (act === 'apr-delete') {
    if (await adminFetch('/admin/promo-delete', { code: el.dataset.code })) { haptic.ok(); toast('Промокод удалён'); showPromos(true); }
  }
});
