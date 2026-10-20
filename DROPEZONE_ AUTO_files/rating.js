// ===== Рейтинг: Меню → «Рейтинг» (Неделя | Всё время) =====
// Пока только в локальном режиме (RATING_LOCAL_ONLY): там список — тестовые соперники, чтобы посмотреть, как выглядит.

const ratingOn = () => !RATING_LOCAL_ONLY || MODE === 'local';
let ratingView = 0;          // 0 — неделя, 1 — всё время
let ratingData = {};         // ответы сервера по вкладкам: { week, all }

// локально: тестовые соперники (одни и те же в течение недели)
function fakeTop(type) {
  const seed = [...Rules.weekKey(now())].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
  let x = seed >>> 0;
  const rnd = () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) >>> 0) / 4294967296);
  const mine = type === 'week' ? Rules.weekGain(state) : Rules.garageWorth(state);   // сезон и «всё время» — стоимость гаража
  const scale = Math.max(mine * 3, type === 'week' ? 50e6 : 400e6);
  const list = BOT_NAMES.slice(0, 40).map((name, i) => ({ id: -1 - i, name, value: Math.floor(scale * Math.pow(rnd(), 2.2)) + 1e4 }));
  if (mine > 0) list.push({ id: 0, name: tgUser()?.first_name || 'Ты', value: mine, me: true });
  list.sort((a, b) => b.value - a.value);
  list.forEach((r, i) => { r.medal = i < 3 && !r.me ? i : -1; });   // «прошлые победители» для примера
  const place = list.findIndex(r => r.me) + 1;
  return { list, me: { value: mine, place: place || null }, msLeft: type === 'season' ? Rules.msToSeasonEnd(now()) : Rules.msToWeekEnd(now()), fake: true };
}

async function loadRating(type) {
  if (MODE !== 'server') { ratingData[type] = fakeTop(type); return; }
  try {
    const res = await fetch(`${API}/top?type=${type}`, { headers: authHeaders() });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    ratingData[type] = d;
  } catch { toast('Не удалось загрузить рейтинг'); }
}

// в релизном обновлении — только рейтинг сезона (без вкладок); до релиза — «Неделя | Всё время»
const seasonsOn = () => typeof nextOn === 'function' && nextOn();
const ratingType = () => seasonsOn() ? 'season' : (ratingView === 0 ? 'week' : 'all');
const fmtLeft = ms => {
  const d = Math.floor(ms / 86400e3), h = Math.floor(ms % 86400e3 / 3600e3), m = Math.floor(ms % 3600e3 / 60e3);
  return d ? `${d} д ${h} ч` : h ? `${h} ч ${m} мин` : `${m} мин`;
};
const MEDALS = ['🥇', '🥈', '🥉'];

function renderRating() {
  return seasonsOn() ? `<div>${ratingBody()}</div>` : `${segmented('rseg', ratingView, 'Неделя', 'Всё время')}<div>${ratingBody()}</div>`;
}

function ratingBody() {
  const type = ratingType();
  if (!ratingData[type] && MODE !== 'server') ratingData[type] = fakeTop(type);   // локально — сразу, без подгрузки
  const d = ratingData[type];
  if (!d) {
    // с сервера: показываем заглушку и подменяем, когда закончится анимация перехода
    loadRating(type).then(() => setTimeout(() => rerenderRating(true), Math.max(0, navEndAt - Date.now())));
    return `<div class="card" style="text-align:center"><span class="muted">Загрузка…</span></div>`;
  }
  const week = type === 'week';
  const prizeLine = (from, pr) => `<div class="rt-sp"><span class="rt-sp-place">${from === 1 ? emo('🥇', 20) : from === 2 ? `${emo('🥈', 18)}${emo('🥉', 18)}` : `${from}–${pr.to}`}</span>
      <span>${[pr.stars && `${emo('⭐', 15)} ${pr.stars}`, pr.scase && `${emo('🔐', 15)} секретный кейс`, `${emo('🏅', 15)} значок`].filter(Boolean).join(' · ')}</span></div>`;
  const head = type === 'season'
    ? `<div class="card rt-head rt-season">
        <div class="row"><b>Сезон ${Rules.seasonId(now(), state)}</b><span class="muted small">до конца ${fmtLeft(d.msLeft)}</span></div>
        <div class="muted small">Место — по стоимости гаража. В конце сезона почти всё сбрасывается: остаются звёзды, значки, VIP и секретные машины (на Витрине славы)</div>
        <div class="rt-sprizes">${SEASON.prizes.map((pr, i) => prizeLine(i ? SEASON.prizes[i - 1].to + 1 : 1, pr)).join('')}</div>
        ${typeof gameAdmin === 'function' && gameAdmin() ? `<button class="pill gray" style="margin-top:10px" data-act="season-end">Тест: завершить сезон сейчас</button>` : ''}
      </div>`
    : week
    ? `<div class="card rt-head">
        <div class="row"><b>Гонка недели</b><span class="muted small">до конца ${fmtLeft(d.msLeft)}</span></div>
        <div class="muted small">Место — по стоимости машин, полученных с понедельника (с деталями и номерами), если они ещё у тебя. Старые машины и их продажа не влияют</div>
        <div class="rt-prizes">${WEEK_PRIZES.slice(0, 3).map((p, i) => `<div>${emo(MEDALS[i], 22)}<b>${money(p)}</b></div>`).join('')}
          <div>${emo('🏆', 22)}<b>4–10: ${money(WEEK_PRIZES[3])}</b></div></div>
      </div>`
    : `<div class="muted small rt-note">${Rules.nextActive() ? 'Стоимость гаража: машины с деталями и номерами, витрина и номера' : 'Капитал: стоимость гаража (машины с деталями и номерами, витрина) + деньги на балансе'}</div>`;
  const rows = d.list.map((r, i) => {
    const place = i + 1;
    return `<button class="list-row rt-row${place <= 3 ? ' top' + place : ''}${r.me ? ' me' : ''}" data-act="rt-player" data-id="${r.id}">
      <div class="rt-place">${place <= 3 ? emo(MEDALS[i], 24) : place}</div>
      <div class="info"><div class="t">${esc(r.name) || 'Гонщик'}${r.medal >= 0 && r.medal < 3 ? ` <span class="rt-badge" title="Призёр прошлой недели">${emo(MEDALS[r.medal], 13)}</span>` : ''}</div></div>
      <div class="r rt-val">${week ? '+' : ''}${money(r.value)}</div></button>`;
  }).join('');
  const me = d.me;
  const meBar = !me ? '' : me.admin ? `<div class="rt-me"><span class="muted">Админы в рейтинге не участвуют</span></div>`
    : `<div class="rt-me"><span>Ты: <b>${me.place ? '#' + me.place : 'пока без места'}</b></span><span>${week ? '+' : ''}${money(me.value)}</span></div>`;
  return `${head}
    ${d.fake ? `<div class="muted small rt-note">Тестовый режим: соперники ненастоящие</div>` : ''}
    ${rows ? `<div class="list rt-list">${rows}</div>` : `<div class="card" style="text-align:center"><span class="muted">${week ? 'На этой неделе пока никто не вырос — будь первым!' : 'Пока пусто'}</span></div>`}
    ${meBar}`;
}

const rerenderRating = fade => {
  if (tab !== 'menu' || menuView !== 'rating') return;
  const body = $('#rseg')?.nextElementSibling;
  if (!body) return;
  body.innerHTML = ratingBody();
  if (fade) { body.classList.remove('fade-in'); void body.offsetWidth; body.classList.add('fade-in'); }
};

// карточка игрока: лучшая машина и номер
async function showRatingPlayer(id) {
  let p;
  if (id <= 0) {   // тестовый соперник или ты (локально)
    if (id === 0) {
      const cars = [...state.cars, ...state.museum].sort((a, b) => carValue(b) - carValue(a));
      p = { name: tgUser()?.first_name || 'Ты', worth: Rules.garageWorth(state), cars: cars.length, collection: state.discovered.length, hall: state.hall || [],
        best: cars[0] ? { id: cars[0].id, plate: cars[0].plate, value: carValue(cars[0]) } : null,
        showcase: state.museum.map(c => ({ id: c.id, plate: c.plate || null, hp: carHp(c), value: carValue(c) })), slots: state.museumSlots };
    } else {
      const r = ratingData[ratingType()].list.find(x => x.id === id);
      const pool = Rules.baseCars().filter(c => c.price < r.value);
      const car = pool[(-id * 7) % pool.length] || CARS[0];
      p = { name: r.name, worth: r.value, cars: 3 + (-id % 9), collection: 10 + (-id * 3 % 40), best: { id: car.id, plate: null, value: car.price },
        showcase: fakeShowcase(id, pool), slots: 4 + (-id % 3) * 2,
        hall: [...SECRET_CARS, ...EXCL_CARS].filter((c, i) => (-id * 7 + i * 3) % 5 === 0).slice(0, 3).map((c, i) => ({ id: c.id, season: 1 + i })) };
    }
  } else {
    try { p = await (await fetch(`${API}/top-player?id=${id}`, { headers: authHeaders() })).json(); } catch { toast('Нет связи с сервером'); return; }
    if (p.error) { toast(p.error); return; }
  }
  const d = p.best && CAR_BY_ID[p.best.id];
  openSheet(`${sheetNav(esc(p.name) || 'Гонщик')}
    ${typeof founderBadge === 'function' ? founderBadge(id === 0 ? state.founder : p.founder, id === 0 ? hasBeta(state) : p.beta, id === 0 ? Rules.nextActive() && state.awards : p.awards) : ''}
    ${d ? `<div class="rt-car">${carPic(d)}</div>
      ${p.best.plate && typeof plateHTML === 'function' ? `<div class="car-plate">${plateHTML(p.best.plate)}</div>` : ''}
      <div class="rt-car-name">${d.name} ${clsBadge(d.r)}</div>
      <div class="muted small" style="text-align:center">Лучшая машина · ${money(p.best.value)}</div>` : ''}
    <div class="stats" style="margin-top:16px">
      <div class="stat"><div class="v">${money(p.worth)}</div><div class="l">гараж</div></div>
      <div class="stat"><div class="v">${p.cars}</div><div class="l">машин</div></div>
      <div class="stat"><div class="v">${p.collection}</div><div class="l">в коллекции</div></div>
    </div>
    <button class="btn" style="margin-top:14px" data-act="rt-showcase" data-id="${id}">${emo('🏛️', 18)} Витрина · ${p.showcase.length}</button>
    ${Rules.nextActive() ? `<button class="btn gold" style="margin-top:10px" data-act="rt-hall" data-id="${id}">${emo('🏆', 18)} Витрина славы · ${(p.hall || []).length}</button>` : ''}
    ${typeof duelsOn === 'function' && duelsOn() && id < 0 && d ? (duelOnline('r' + id)
      ? `<button class="btn gray" style="margin-top:10px" data-act="rt-duel" data-id="${id}">${emo('⚔️', 18)} Вызвать на гонку <span class="ok small">● в сети</span></button>`
      : `<div class="muted small" style="text-align:center;margin-top:10px">Сейчас не в игре — вызвать на гонку можно, когда игрок онлайн</div>`) : ''}`);
  ratingPlayer = { id, ...p };
}

let ratingPlayer = null;   // последний открытый игрок — для его витрины

// локально: у тестового соперника несколько машин на витрине, на некоторых — номера
function fakeShowcase(id, pool) {
  let x = (-id * 2654435761) >>> 0;
  const rnd = () => ((x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0) / 4294967296);
  return Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => {
    const d = pool[Math.floor(rnd() * pool.length)] || CARS[0];
    const plate = rnd() < 0.6 ? Rules.genPlate(rnd, ['C', 'B', 'A', 'S'][Math.floor(rnd() * 4)]) : null;
    return { id: d.id, plate, hp: d.hp, value: d.price + (plate ? Rules.plateInfo(plate).value : 0) };
  });
}

// витрина другого игрока: машины на постаментах и номера на них
function showShowcase() {
  const p = ratingPlayer;
  if (!p) return;
  const items = p.showcase.map(c => {
    const d = CAR_BY_ID[c.id];
    return `<div class="exhibit view" style="--rc:${rc(d.r)}">
      <div class="spot"></div>
      <div class="ex-pic">${carPic(d)}</div>
      <div class="pedestal"></div>
      ${c.plate && typeof plateHTML === 'function' ? `<div class="car-plate tiny">${plateHTML(c.plate)}</div>` : ''}
      <div class="ex-name">${d.name}</div>
      <div class="ex-sub"><span class="dot" style="background:${rc(d.r)}"></span>${RARITIES[d.r].name} · ${c.hp} л.с.</div>
    </div>`;
  }).join('');
  const total = p.showcase.reduce((s, c) => s + c.value, 0);
  openSheet(`${sheetNav('Витрина', { act: 'rt-player', attrs: `data-id="${p.id}"`, label: 'Назад' })}
    <div class="card museum-head"><div class="row"><b>${emo('🏛️', 20)} ${esc(p.name) || 'Гонщик'}</b><span class="muted">${p.showcase.length}/${p.slots}</span></div>
      ${p.showcase.length ? `<div class="muted small" style="margin-top:6px">Экспонаты на ${money(total)}</div>` : ''}</div>
    ${items ? `<div class="museum-grid">${items}</div>` : `<div class="card" style="text-align:center"><span class="muted">Витрина пока пустая</span></div>`}`);
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-act="season-end"]')) { endSeasonTest(); return; }
  const du = e.target.closest('[data-act="rt-duel"]');
  if (du && ratingPlayer?.best) {
    // тест: игрок рейтинга — бот, его машина — лучшая из карточки
    const b = ratingPlayer, cd = CAR_BY_ID[b.best.id];
    if (state.duel) { toast('Сначала закончи текущую гонку'); return; }
    duelPick = null;
    duelSheet({ id: 'r' + b.id, name: b.name, carId: cd.id, hp: Math.round(cd.hp * 1.15), paint: null });
    return;
  }
  if (e.target.closest('[data-act="rt-hall"]') && ratingPlayer) {
    haptic.tap();
    const p = ratingPlayer;
    openSheet(`${sheetNav('Витрина славы', { act: 'rt-player', attrs: `data-id="${p.id}"`, label: 'Назад' })}
      <div class="muted small" style="margin:0 4px 10px">${esc(p.name) || 'Гонщик'}</div>${hallHTML(p.hall || [], p.id === 0)}`);
    return;
  }
  const el = e.target.closest('[data-act="rseg"], [data-act="rt-player"], [data-act="rt-showcase"]');
  if (!el) return;
  if (el.dataset.act === 'rt-showcase') { haptic.tap(); showShowcase(); return; }
  if (el.dataset.act === 'rseg') {
    ratingView = +el.dataset.v;
    switchSegment('rseg', ratingView, ratingBody());
  } else { haptic.tap(); showRatingPlayer(+el.dataset.id); }
});

// тестовая версия: завершить сезон сейчас — место берётся из тестового рейтинга
async function endSeasonTest() {
  if (busy) return;
  const d = ratingData.season || fakeTop('season');
  busy = true;
  const r = await api('seasonEndLocal', { place: d.me?.place || 0 });
  busy = false;
  if (!r) return;
  ratingData = {};
  render();
  showSeasonResult();
}

// итоги сезона — один раз после смены сезона
function showSeasonResult() {
  const r = state.seasonResult;
  if (!r || r.shown) return;
  const pr = r.prize;
  openSheet(`${sheetNav('Итоги сезона')}
    <div class="ss-hero">${emo(r.place === 1 ? '🏆' : r.place <= 3 ? '🥈' : pr ? '🏅' : '🏁', 72)}</div>
    <div class="ss-title">Сезон ${r.season} завершён</div>
    <div class="ss-place">${r.place ? `Твоё место: <b>#${r.place}</b>` : 'Итоги подводятся: если ты в топ-100 — награда придёт в течение часа'}</div>
    ${pr ? `<div class="list">
      ${pr.stars ? `<div class="list-row static"><div class="ic">${emo('⭐', 26)}</div><div class="info"><div class="t">${pr.stars} звёзд</div><div class="sub">на покупки в магазине</div></div></div>` : ''}
      ${pr.scase ? `<div class="list-row static"><div class="ic">${emo('🔐', 26)}</div><div class="info"><div class="t">Секретный кейс</div><div class="sub">открой на экране кейсов</div></div></div>` : ''}
      <div class="list-row static"><div class="ic">${emo('🏅', 26)}</div><div class="info"><div class="t">Значок «${pr.title}»</div><div class="sub">навсегда в твоём профиле</div></div></div>
    </div>` : ''}
    <div class="muted small" style="margin:12px 4px;text-align:center">Новый сезон начался: гараж и деньги обнулились. Секретные машины — на Витрине славы, звёзды и VIP — на месте. Удачи! 🏁</div>
    <button class="btn" data-act="close">Поехали</button>`);
  api('seasonResultSeen');
}
