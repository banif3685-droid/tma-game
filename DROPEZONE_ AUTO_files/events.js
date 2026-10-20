// ===== Временные кейсы (релизное обновление) =====
// Владелец создаёт кейс в админке: название, смайлик, машины, сколько он доступен (+ по желанию цена в звёздах).
// Цену в рублях считает игра (Rules.eventCasePrice — окупаемость ~95%, как у обычных кейсов).
// Кейс — в выборе кейсов, раздел «Временные»; плашка с обратным отсчётом на экране кейсов и один раз — уведомление сверху.
// Тестовая версия: список в localStorage dz_ecases. С сервером — создаёт команда в админ-боте (кейс админа команды
// подтверждает владелец), список приходит в /state (ecases). Правила видят его через globalThis.EVENT_CASES.
// Оплата: pay 'rub' | 'stars' | 'both'; звёзды со счёта — сразу, оплата Telegram — подарком (shopBuy 'ev:<id>').
'use strict';

const EV_KEY = 'dz_ecases', EV_SEEN = 'dz_ecases_seen';
function evLoad() {
  if (typeof MODE !== 'undefined' && MODE === 'server') { globalThis.EVENT_CASES = globalThis.EVENT_CASES || []; return; }   // список приходит с сервера (/state)
  try { globalThis.EVENT_CASES = JSON.parse(localStorage.getItem(EV_KEY)) || []; } catch { globalThis.EVENT_CASES = []; }
  globalThis.EVENT_CASES = globalThis.EVENT_CASES.filter(c => c.until > Date.now() - 86400e3);   // старые через сутки убираются
}
function evSave() { try { localStorage.setItem(EV_KEY, JSON.stringify(globalThis.EVENT_CASES)); } catch {} }
evLoad();

const evActive = () => Rules.eventCases().filter(c => Rules.caseOn(c, now()));
const evSeen = () => { try { return JSON.parse(localStorage.getItem(EV_SEEN)) || []; } catch { return []; } };
const evMarkSeen = id => { try { localStorage.setItem(EV_SEEN, JSON.stringify([...evSeen(), id].slice(-50))); } catch {} };
const evLeft = c => {
  const ms = Math.max(0, c.until - now()), d = Math.floor(ms / 86400e3);
  return d ? `${d} дн ${Math.floor(ms % 86400e3 / 3600e3)} ч` : leftHMS(ms);
};

// одна плашка на экране кейсов; если временных кейсов несколько — внутри она сама перелистывает их
let evSlide = 0;
function evBannersHTML() {
  const list = evActive();
  if (!list.length) return '';
  evSlide %= list.length;
  const slides = list.map(c => `<div class="ev-slide" data-id="${c.id}">
      <span class="ev-ic">${emo(c.icon, 30)}</span>
      <span class="ev-txt"><b>${esc(c.name)}</b><span>Временный кейс · ещё <span data-ev-left="${c.id}">${evLeft(c)}</span></span></span>
      <span class="ev-go">${prefs.selCase === c.id ? 'Выбран' : 'Открыть'}</span>
    </div>`).join('');
  return `<button class="ev-banner${list.some(c => c.id === prefs.selCase) ? ' on' : ''}" data-act="ev-pick" id="ev-banner">
    <div class="ev-track" id="ev-track" style="transform:translateX(${-evSlide * 100}%)">${slides}</div>
    ${list.length > 1 ? `<div class="ev-dots">${list.map((_, i) => `<i class="${i === evSlide ? 'on' : ''}"></i>`).join('')}</div>` : ''}
  </button>`;
}
// перелистывание раз в 3,5 с
setInterval(() => {
  const track = document.getElementById('ev-track');
  const n = track?.children.length || 0;
  if (n < 2 || document.hidden) return;
  evSlide = (evSlide + 1) % n;
  track.style.transform = `translateX(${-evSlide * 100}%)`;
  document.querySelectorAll('#ev-banner .ev-dots i').forEach((d, i) => d.classList.toggle('on', i === evSlide));
}, 3500);

// для выбора кейса: раздел «Временные»
function evPickerHTML(cur) {
  const list = evActive();
  return list.length ? `<div class="section-h"><span>${emo('⏳', 15)} Временные</span><span>${list.length}</span></div>
    <div class="list">${list.map(c => caseRow(c, c === cur).replace('</button>', `<span class="ev-tag">ещё ${evLeft(c)}</span></button>`)).join('')}</div>` : '';
}

// ---------- админка (тест): создать временный кейс ----------
const EV_NEW = () => ({ name: '', icon: '🔥', cars: [], hours: 24, stars: 0, q: '', fR: [], fC: 'all', pMin: '', pMax: '' });
let evDraft = EV_NEW();
// машины, подходящие под фильтры (редкость, страна, цена в млн от–до, поиск)
const evPool = d => {
  const q = d.q.trim().toLowerCase(), lo = +d.pMin * 1e6 || 0, hi = +d.pMax * 1e6 || Infinity;
  return Rules.baseCars().filter(c => (!q || c.name.toLowerCase().includes(q)) && (!d.fR.length || d.fR.includes(c.r))
    && (d.fC === 'all' || c.c === d.fC) && c.price >= lo && c.price <= hi);
};
const EV_ICONS = ['🔥', '🎃', '🎄', '❄️', '💎', '⚡', '👑', '🏆', '🎁', '🌸', '🚀', '🍀'];
function showEvAdmin() {
  const d = evDraft;
  const price = Rules.eventCasePrice(d.cars);
  const pool = evPool(d);
  const shownOn = pool.filter(c => d.cars.includes(c.id)).length;
  const rows = RARITY_ORDER.map(r => {
    const cs = pool.filter(c => c.r === r);
    return cs.length ? `<div class="ev-cls">${clsBadge(r)}</div><div class="ev-cars">${cs.map(c => `<button class="chip${d.cars.includes(c.id) ? ' on' : ''}" data-act="ev-car" data-id="${c.id}">${c.name}</button>`).join('')}</div>` : '';
  }).join('');
  const act = Rules.eventCases().map(c => `<div class="list-row static"><div class="ic">${emo(c.icon, 24)}</div>
      <div class="info"><div class="t">${esc(c.name)}</div><div class="sub">${c.cars.length} машин · ${money(c.price)}${c.stars ? ` · ⭐ ${c.stars}` : ''} · ${Rules.caseOn(c, now()) ? `ещё ${evLeft(c)}` : 'закончился'}</div></div>
      <button class="pill danger" data-act="ev-del" data-id="${c.id}" data-confirm="Удалить?">✕</button></div>`).join('');
  const html = `${sheetNav('Временные кейсы', { act: 'adm-back', label: 'Админка' })}
    <div class="muted small admin-note">Тестовая версия: кейсы живут в этом браузере. Цену считает игра — окупаемость ~95%, как у обычных кейсов.</div>
    ${act ? `<div class="section-h">Созданные</div><div class="list">${act}</div>` : ''}
    <div class="section-h">Новый кейс</div>
    <div class="card admin-card">
      <input id="ev-name" class="admin-input" placeholder="Название, например «Хэллоуин»" maxlength="28" value="${esc(d.name)}">
      <div class="muted small" style="margin-top:10px">Смайлик на превью</div>
      <div class="ev-icons">${EV_ICONS.map(i => `<button class="ev-icon${i === d.icon ? ' on' : ''}" data-act="ev-icon" data-v="${i}">${emo(i, 24)}</button>`).join('')}
        <input id="ev-icon" class="admin-input ev-icon-in" maxlength="4" placeholder="свой" value="${EV_ICONS.includes(d.icon) ? '' : esc(d.icon)}"></div>
      <div class="muted small" style="margin-top:10px">Сколько доступен</div>
      <div class="pills wrap">${[[1, '1 час'], [6, '6 ч'], [24, '1 день'], [72, '3 дня'], [168, '7 дней']].map(([h, l]) => `<button class="pill${d.hours === h ? '' : ' gray'}" data-act="ev-hours" data-v="${h}">${l}</button>`).join('')}</div>
      <div class="muted small" style="margin-top:10px">Цена в звёздах (необязательно, 0 — только за рубли)</div>
      <input id="ev-stars" class="admin-input" type="number" inputmode="numeric" min="0" value="${d.stars || ''}" placeholder="0">
    </div>
    <div class="section-h"><span>Машины · ${d.cars.length}</span>${d.cars.length ? `<button class="link-btn" data-act="ev-clear">Сбросить</button>` : ''}</div>
    <div class="card admin-card ev-filters">
      <input id="ev-q" class="admin-input" placeholder="Поиск машины" value="${esc(d.q)}">
      <div class="muted small">Редкость</div>
      <div class="pills wrap">${RARITY_ORDER.map(r => `<button class="pill ev-fr${d.fR.includes(r) ? ' on' : ' gray'}" style="--rc:${rc(r)}" data-act="ev-fr" data-v="${r}">${r} · ${RARITIES[r].name}</button>`).join('')}</div>
      <div class="muted small">Страна</div>
      <div class="pills wrap">${[['all', 'Все'], ...Object.entries(COUNTRIES).map(([k, v]) => [k, `${emo(v.flag, 14)} ${v.name}`])].map(([k, l]) => `<button class="pill${d.fC === k ? '' : ' gray'}" data-act="ev-fc" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="muted small">Цена машины, млн ₽</div>
      <div class="ev-price"><input id="ev-pmin" class="admin-input" type="number" inputmode="decimal" min="0" placeholder="от" value="${d.pMin}">
        <span>—</span><input id="ev-pmax" class="admin-input" type="number" inputmode="decimal" min="0" placeholder="до" value="${d.pMax}"></div>
      <div class="pills wrap" style="margin-top:4px">
        <button class="pill" data-act="ev-all" ${pool.length && shownOn < pool.length ? '' : 'disabled'}>Выбрать показанные · ${pool.length}</button>
        <button class="pill gray" data-act="ev-none" ${shownOn ? '' : 'disabled'}>Снять показанные · ${shownOn}</button>
        ${d.fR.length || d.fC !== 'all' || d.pMin || d.pMax || d.q ? `<button class="pill gray" data-act="ev-freset">Сбросить фильтры</button>` : ''}
      </div>
    </div>
    <div class="ev-pick">${rows || '<div class="muted small" style="text-align:center;margin:12px">Ничего не подходит под фильтры</div>'}</div>
    ${d.cars.length ? `<div class="card ev-sum"><div class="row"><span>Цена кейса</span><b>${money(price)}</b></div>
      <div class="muted small">${Rules.caseOdds({ event: true, kind: 'car', cars: d.cars }).map(o => `${o.r} ${o.pct.toFixed(1).replace('.', ',')}%`).join(' · ')}</div></div>` : ''}
    <button class="btn" style="margin-top:12px" data-act="ev-create" ${d.cars.length ? '' : 'disabled'}>Создать кейс</button>`;
  const body = $('#sheet-body'), y = body?.scrollTop || 0;
  if (document.body.classList.contains('sheet-open') && body.querySelector('#ev-name')) { body.innerHTML = html; body.scrollTop = y; } else openSheet(html);
}
const evReadForm = () => {
  evDraft.name = ($('#ev-name')?.value || '').trim();
  const own = ($('#ev-icon')?.value || '').trim();
  if (own) evDraft.icon = own;
  evDraft.stars = Math.max(0, Math.floor(+($('#ev-stars')?.value || 0)));
  if ($('#ev-pmin')) { evDraft.pMin = $('#ev-pmin').value; evDraft.pMax = $('#ev-pmax').value; }
};

function evCreate() {
  evReadForm();
  const d = evDraft;
  if (!d.name) { haptic.err(); toast('Назови кейс'); return; }
  if (!d.cars.length) return;
  const t = Date.now();
  const c = { id: 'ev_' + t.toString(36), event: true, kind: 'car', name: d.name, icon: d.icon || '🔥', cars: [...d.cars],
    price: Rules.eventCasePrice(d.cars), stars: d.stars || 0, from: t, until: t + d.hours * 3600e3 };
  globalThis.EVENT_CASES.push(c);
  evSave();
  evDraft = EV_NEW();
  haptic.ok();
  toast(`Кейс «${c.name}» создан`);
  showEvAdmin();
  if (typeof updateIsland === 'function') updateIsland();
}

document.addEventListener('input', e => {
  if (e.target.id === 'ev-pmin' || e.target.id === 'ev-pmax') {
    const id = e.target.id; evReadForm(); clearTimeout(evDraft.t);
    evDraft.t = setTimeout(() => { showEvAdmin(); const i = $('#' + id); if (i) { i.focus(); const v = i.value; i.value = ''; i.value = v; } }, 400);
  }
  if (e.target.id === 'ev-q') { evReadForm(); evDraft.q = e.target.value; clearTimeout(evDraft.t); evDraft.t = setTimeout(() => { showEvAdmin(); const i = $('#ev-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act^="ev-"]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  if (act === 'ev-admin') { haptic.tap(); showEvAdmin(); }
  else if (act === 'ev-car') { evReadForm(); toggleIn(evDraft.cars, el.dataset.id); haptic.tick(); showEvAdmin(); }
  else if (act === 'ev-clear') { evReadForm(); evDraft.cars = []; showEvAdmin(); }
  else if (act === 'ev-fr') { evReadForm(); toggleIn(evDraft.fR, el.dataset.v); haptic.tick(); showEvAdmin(); }
  else if (act === 'ev-fc') { evReadForm(); evDraft.fC = el.dataset.v; haptic.tick(); showEvAdmin(); }
  else if (act === 'ev-freset') { evReadForm(); Object.assign(evDraft, { fR: [], fC: 'all', pMin: '', pMax: '', q: '' }); haptic.tick(); showEvAdmin(); }
  else if (act === 'ev-all') { evReadForm(); for (const c of evPool(evDraft)) if (!evDraft.cars.includes(c.id)) evDraft.cars.push(c.id); haptic.tap(); showEvAdmin(); }
  else if (act === 'ev-none') { evReadForm(); const ids = new Set(evPool(evDraft).map(c => c.id)); evDraft.cars = evDraft.cars.filter(id => !ids.has(id)); haptic.tick(); showEvAdmin(); }
  else if (act === 'ev-icon') { evReadForm(); evDraft.icon = el.dataset.v; const i = $('#ev-icon'); if (i) i.value = ''; haptic.tick(); showEvAdmin(); }
  else if (act === 'ev-hours') { evReadForm(); evDraft.hours = +el.dataset.v; haptic.tick(); showEvAdmin(); }
  else if (act === 'ev-create') evCreate();
  else if (act === 'ev-del') { globalThis.EVENT_CASES = globalThis.EVENT_CASES.filter(c => c.id !== el.dataset.id); evSave(); haptic.ok(); showEvAdmin(); }
  else if (act === 'ev-pick') {
    // выбирается кейс, который сейчас виден в плашке
    const id = el.dataset.id || $('#ev-track')?.children[evSlide]?.dataset.id;
    if (!id) return;
    prefs.selCase = id; savePrefs(); evMarkSeen(id);
    caseView.car = { phase: 'idle' }; haptic.tap(); render();
    if (typeof updateIsland === 'function') updateIsland();
  }
});

// обратный отсчёт на плашках; закончился — перерисовать
setInterval(() => {
  let ended = false;
  document.querySelectorAll('[data-ev-left]').forEach(el => {
    const c = Rules.caseById(el.dataset.evLeft);
    if (!c || !Rules.caseOn(c, now())) ended = true; else el.textContent = evLeft(c);
  });
  if (ended && !spinning) render();
}, 1000);
