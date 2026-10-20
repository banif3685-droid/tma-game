// ===== Приветствие в стиле историй Telegram =====
// Показывается один раз на устройстве (ключ STORIES_KEY). Тап справа — дальше, слева — назад,
// удержание — пауза, «Пропустить» — закрыть. Макеты — живые анимации из кусочков интерфейса.

const STORIES_KEY = 'dz_stories_v1';
// «Что нового»: на каждое обновление — свой список и новый ключ. Кто пропустил прошлое — увидит и его
const WHATSNEW_PREV_KEY = 'dz_whatsnew_refboost';
const WHATSNEW_KEY = 'dz_whatsnew_plates_rating';
const storiesSeen = (key = STORIES_KEY) => { try { return !!localStorage.getItem(key); } catch { return true; } };

const stCar = id => `<img src="img/cars/${id}.webp" alt="" draggable="false">`;
const stCard = (id, extra = '') => {
  const d = CAR_BY_ID[id], x = d.secret && !['E', 'F', 'A'].includes(d.r);   // эксклюзив E, основатель F, бета A — своя редкость
  return `<div class="st-card ${extra}" style="--rc:${x ? '#ffd60a' : rc(d.r)}">
    <span class="st-cls">${x ? 'X' : d.r}</span>${stCar(id)}<div class="st-cn">${d.name}</div></div>`;
};

const STORIES_MAIN = [
  {
    accent: '#0a84ff',
    title: 'Гараж мечты в Telegram',
    text: 'Реальные тачки — от «копейки» до гиперкаров. Листай, покажем, что тебя ждёт 👇',
    stage: () => `<div class="st-intro">
      <div class="st-logo">DROPEZONE<span>AUTO</span></div>
      <div class="st-fleet">${['vaz2106', 'r34', 'svj'].map((id, i) => `<div class="st-fl" style="--i:${i}">${stCar(id)}</div>`).join('')}</div></div>`,
  },
  {
    accent: '#ff9f0a', ms: 7500,
    title: 'Кейсы с реальными тачками',
    text: 'Крути рулетку и выбивай машины. Чем дороже кейс — тем круче дроп. Выпало — в гараж или на продажу',
    stage: () => {
      const ids = ['vaz2107', 'corolla', 'golf2', 'ae86', 'e36', 'camaro', 'evo9', 'w124', 'm3e46', 'huracan', 'niva', 'supra', 'priora'];
      return `<div class="st-roll"><div class="st-marker"></div>
        <div class="st-strip">${ids.map((id, i) => stCard(id, i === 9 ? 'win' : '')).join('')}</div></div>
        <div class="st-drop">${emo('🎉', 22)} Lamborghini Huracán!</div>`;
    },
  },
  {
    accent: '#30d158',
    title: 'Машины приносят доход',
    text: 'Каждая тачка в гараже зарабатывает 3% своей цены в час. Копится до 4 часов — заходи и забирай',
    stage: () => `<div class="st-income">
      <div class="st-garage">${['supra', 'm5f90', 'mustang67'].map((id, i) => `<div class="st-gc" style="--i:${i}">${stCar(id)}</div>`).join('')}</div>
      <div class="st-panel">
        <div class="st-row"><span>Доход гаража</span><span>+124 000 ₽ / ч</span></div>
        <div class="st-big" data-count="496000">0 ₽</div>
        <div class="st-bar"><i></i></div>
        <div class="st-btn">Забрать</div>
        <div class="st-fly">+496 000 ₽</div>
      </div></div>`,
    run(el) {
      stCount(el.querySelector('[data-count]'), 3600, 300);
      // «нажали» Забрать — счётчик и полоска обнуляются
      setTimeout(() => {
        const big = el.querySelector('.st-big'), bar = el.querySelector('.st-bar');
        if (!big?.isConnected) return;
        big.textContent = money(0); big.classList.add('taken'); bar.classList.add('taken');
      }, 4500);
    },
  },
  {
    accent: '#bf5af2',
    title: 'Тюнинг и слияние деталей',
    text: 'Выбивай детали в мастерской, сливай 3 одинаковые в 1 уровнем выше и ставь на машину — больше мощности и цены',
    stage: () => `<div class="st-merge">
      <div class="st-parts">${[0, 1, 2].map(i => `<div class="st-part" style="--i:${i}"><img src="img/parts/turbo.webp" alt=""><b>Street</b></div>`).join('')}
        <div class="st-flash"></div>
        <div class="st-part res"><img src="img/parts/turbo.webp" alt=""><b>Sport</b></div></div>
      <div class="st-tune">${stCar('s15')}<div class="st-hp"><span data-count="250" data-from="250">250</span> л.с. <em>+60</em></div></div></div>`,
    run(el) { setTimeout(() => stCount(el.querySelector('[data-count]'), 900, 0, 310), 3300); },
  },
  {
    accent: '#ff453a',
    title: 'Дрэг-гонки 402 м',
    text: 'Жми «Газ» ровно на зелёный — идеальный старт даёт бонус. Обгоняй соперников и забирай призы',
    stage: () => `<div class="st-race">
      <div class="st-lights"><i></i><i></i><i></i></div>
      <div class="st-board">
        <div class="st-lane me"><span>Ты · ${CAR_BY_ID.gtr35.name}</span><div class="st-track"><i></i></div></div>
        <div class="st-lane bot"><span>DriftKing · ${CAR_BY_ID.m3e30.name}</span><div class="st-track"><i></i></div></div>
      </div>
      <div class="st-win">${emo('🏆', 22)} Победа · +20 000 ₽</div></div>`,
  },
  {
    accent: '#ffd60a',
    title: 'Награды каждый день',
    text: 'Бонус за вход 7 дней подряд, кейс наград раз в 4 часа и подарки за каждый новый уровень',
    stage: () => `<div class="st-rewards">
      <div class="st-gift">${emo('🎁', 64)}</div>
      <div class="st-days">${DAILY.map((_, i) => `<div class="st-day${i === 6 ? ' big' : ''}" style="--i:${i}"><small>День ${i + 1}</small>${emo(i === 6 ? '🚗' : ['💰', '🔧', '💰', '🔧', '🚗', '💰'][i], 22)}</div>`).join('')}</div></div>`,
  },
  {
    accent: '#ffd60a', ms: 7000,
    title: 'Коллекция и секретные тачки',
    text: `Собери все ${Rules.baseCars().length} машин. За целую страну — секретная машина класса X, которую не выбить из кейсов`,
    stage: () => `<div class="st-col">
      <div class="st-grid">${['vaz2101', 'moskvich412', 'volga24', 'niva', 'vestasport', 'aurus'].map((id, i) => `<div class="st-cc" style="--i:${i}">${stCar(id)}</div>`).join('')}</div>
      <div class="st-secret"><div class="st-q">?</div>${stCard('marussia', 'sec')}</div></div>`,
  },
  {
    accent: '#64d2ff',
    title: 'Музей',
    text: 'Выставляй любимые тачки на витрину — они не занимают место в гараже',
    stage: () => `<div class="st-museum"><div class="st-spot"></div><div class="st-ped">${stCar('f40')}</div><div class="st-plate">Ferrari F40 · 1987</div></div>`,
  },
  {
    accent: '#0a84ff', last: true,
    title: 'Погнали!',
    text: 'Новости, промокоды и ивенты — в нашем канале @dropezone_game',
    stage: () => `<div class="st-final">${emo('🏁', 96)}</div>`,
  },
];

// большое обновление: номера, рейтинг, витрина, новые машины
const WHATSNEW_NEW = [
  {
    accent: '#64d2ff',
    title: 'Большое обновление!',
    text: 'Номера, рейтинг с призами, витрины игроков и новые машины. Листай 👉',
    stage: () => `<div class="st-new">
      <div class="st-newtag">NEW</div>
      <div class="st-tiles three">
        <div class="st-tile" style="--g:100,210,255;--i:0">${emo('🚘', 30)}<b>Номера</b></div>
        <div class="st-tile" style="--g:255,196,0;--i:1">${emo('🏆', 30)}<b>Рейтинг</b></div>
        <div class="st-tile" style="--g:191,90,242;--i:2">${emo('🏛️', 30)}<b>Витрина</b></div>
      </div></div>`,
  },
  {
    accent: '#ff375f', ms: 7000,
    title: 'Номера',
    text: 'Меню → «Номера». Генерируй номера как настоящие — каждый существует в одном экземпляре. 777, 001, АМР… чем красивее, тем дороже',
    stage: () => `<div class="st-plate">${plateHTML('А777МР|777', 'big rolling', true)}<div class="st-pl-val">${clsBadge('S')}<b>${money(Rules.plateInfo('А777МР|777').value)}</b></div></div>`,
    run(el) {
      const cells = [...el.querySelectorAll('.pc')];
      const chars = ['А', '7', '7', '7', 'М', 'Р', '7', '7', '7'];
      const plate = el.querySelector('.plate');
      setTimeout(() => {
        if (!plate.isConnected) return;
        cells.forEach((c, i) => { c.innerHTML = `<span class="real" style="--i:${i * 2.5}">${chars[i]}</span>`; });
        plate.classList.remove('rolling', 'blank');
        plate.classList.add('stamped');
        setTimeout(() => el.querySelector('.plate-stage, .st-plate')?.classList.add('lit'), 1100);
      }, 500);
    },
  },
  {
    accent: '#30d158', ms: 7000,
    title: 'Номер на машину',
    text: 'Повесь номер на машину — его цена прибавится к стоимости машины и к доходу гаража',
    stage: () => `<div class="st-onc">
      <div class="st-onc-car">${stCar('rs7')}</div>
      <div class="st-onc-plate">${plateHTML('Е777КХ|77')}</div>
      <div class="st-onc-sum"><span>${money(CAR_BY_ID.rs7.price)}</span> → <b>${money(CAR_BY_ID.rs7.price + Rules.plateInfo('Е777КХ|77').value)}</b></div></div>`,
  },
  {
    accent: '#ffd60a', ms: 7000,
    title: 'Рейтинг и гонка недели',
    text: `Меню → «Рейтинг». Каждую неделю топ-10 по росту гаража получают призы: ${money(WEEK_PRIZES[0])}, ${money(WEEK_PRIZES[1])}, ${money(WEEK_PRIZES[2])} и по ${money(WEEK_PRIZES[3])}`,
    stage: () => `<div class="st-rating">${['Гоша_Форсаж', 'Ghost', 'Медведь', 'NightRider'].map((n, i) => `
      <div class="st-rt-row${i < 3 ? ' top' + (i + 1) : ''}" style="--i:${i}"><span>${i < 3 ? emo(['🥇', '🥈', '🥉'][i], 22) : i + 1}</span><b>${n}</b><em>${money(WEEK_PRIZES[i])}</em></div>`).join('')}
      <div class="st-rt-me" style="--i:5">Ты: <b>#5</b> — догоняй!</div></div>`,
  },
  {
    accent: '#bf5af2', ms: 6500,
    title: 'Витрина',
    text: '«Музей» теперь «Витрина». Выставляй лучшие тачки с номерами — их увидят другие игроки, если нажмут на тебя в рейтинге',
    stage: () => `<div class="st-museum"><div class="st-spot"></div><div class="st-ped">${stCar('urus')}</div>
      <div class="car-plate">${plateHTML('А001АА|77')}</div></div>`,
  },
  {
    accent: '#ff9f0a', ms: 7000, btn: 'К номерам', act: 'plates',
    title: 'Новые машины',
    text: 'Toyota Cresta, Volkswagen Polo, Audi RS7 Performance и Lamborghini Urus SE — уже в кейсах',
    stage: () => `<div class="st-grid four">${['cresta', 'polo', 'rs7', 'urus'].map((id, i) => `<div class="st-cc" style="--i:${i}">${stCar(id)}<small>${CAR_BY_ID[id].name}</small></div>`).join('')}</div>`,
  },
];

// прошлое обновление: «Повышаем ставки» — бонусы за друзей ×10
const WHATSNEW_PREV = [
  {
    accent: '#ffd60a', ms: 7000,
    title: 'Повышаем ставки! 🔥',
    text: `За каждого приглашённого друга теперь ${money(REFERRAL.inviter)} — в 10 раз больше, чем раньше`,
    stage: () => `<div class="st-boost">
      <div class="st-old">100 000 ₽</div>
      <div class="st-x10">×10</div>
      <div class="st-new-sum">${REFERRAL.inviter.toLocaleString('ru-RU')} ₽</div>
      <div class="st-coins">${[0, 1, 2, 3, 4, 5].map(i => `<span style="--i:${i}">${emo('💰', 30)}</span>`).join('')}</div></div>`,
  },
  {
    accent: '#ff375f', ms: 7000, btn: 'Позвать друзей', act: 'friends',
    title: 'И другу — больше',
    text: `Кто зайдёт по твоей ссылке, получит ${money(REFERRAL.friend)} на старт. Меню → «Друзья» → «Поделиться»`,
    stage: () => `<div class="st-boost friend">
      <div class="st-gift-big">${emo('🎁', 72)}</div>
      <div class="st-old small">50 000 ₽</div>
      <div class="st-new-sum pink">+${money(REFERRAL.friend)}</div></div>`,
  },
];

// старое обновление: кейсы с машинами ×3/×5 и «Снять все детали» (больше не показывается)
const WHATSNEW_MULTICAR = [
  {
    accent: '#ff9f0a', ms: 7500,
    title: 'Кейсы ×3 и ×5',
    text: 'Открывай сразу несколько кейсов с машинами — выбери ×3 или ×5 над кнопкой «Открыть». Нужно столько же свободных мест в гараже',
    stage: () => `<div class="st-multi">
      <div class="st-counts"><span>×1</span><span class="on">×3</span><span>×5</span></div>
      <div class="st-mgrid">${['supra', 'huracan', 'e36'].map((id, i) => `<div class="st-mt" style="--i:${i};--rc:${rc(CAR_BY_ID[id].r)}">
        <span class="st-mq">?</span><div class="st-mcar">${stCar(id)}</div><small>${CAR_BY_ID[id].name}</small></div>`).join('')}</div>
      <div class="st-btn orange">Открыть ×3</div></div>`,
  },
  {
    accent: '#bf5af2', ms: 7000,
    title: 'Снять все детали',
    text: 'Нажми на машину в гараже → «Снять все детали». Весь тюнинг вернётся на склад одним нажатием — удобно переставить на другую тачку',
    stage: () => `<div class="st-strip-parts">
      <div class="st-scar">${stCar('r34')}
        ${['engine', 'turbo', 'wheels', 'exhaust'].map((s, i) => `<div class="st-sp" style="--i:${i}"><img src="img/parts/${s}.webp" alt=""></div>`).join('')}</div>
      <div class="st-btn gray2">Снять все детали · 4</div>
      <div class="st-stock">${emo('📦', 26)} Склад <b>+4</b></div></div>`,
  },
];

// позапрошлое обновление: промокоды и приглашения друзей (больше не показывается)
const WHATSNEW_OLD = [
  {
    accent: '#bf5af2',
    title: 'Обновление!',
    text: 'В «Меню» появились промокоды и приглашения друзей. Листай, расскажем 👉',
    stage: () => `<div class="st-new">
      <div class="st-newtag">NEW</div>
      <div class="st-tiles">
        <div class="st-tile" style="--g:10,132,255;--i:0">${emo('🎟️', 34)}<b>Промокоды</b></div>
        <div class="st-tile" style="--g:255,55,95;--i:1">${emo('👥', 34)}<b>Друзья</b></div>
      </div></div>`,
  },
  {
    accent: '#0a84ff', ms: 7000,
    title: 'Промокоды',
    text: 'Меню → «Промокоды». Вводи коды из канала @dropezone_game и забирай деньги, тачки и детали',
    stage: () => `<div class="st-promo">
      <div class="st-input"><span class="st-type">DZSUMMER</span><i class="st-caret"></i></div>
      <div class="st-btn blue">Активировать</div>
      <div class="st-gets">
        <div class="st-get" style="--i:0">${emo('💰', 30)}<b>+250 000 ₽</b></div>
        <div class="st-get car" style="--i:1">${stCar('rx7')}<b>${CAR_BY_ID.rx7.name}</b></div>
        <div class="st-get" style="--i:2"><img class="st-pimg" src="img/parts/turbo.webp" alt=""><b>Турбина ×3</b></div>
      </div></div>`,
  },
  {
    accent: '#ff375f', ms: 7000, last: true, btn: 'Позвать друзей', act: 'friends',
    title: 'Зови друзей',
    text: `Меню → «Друзья». За каждого друга — ${money(REFERRAL.inviter)} тебе и ${money(REFERRAL.friend)} ему на старт`,
    stage: () => `<div class="st-ref">
      <div class="st-me">${emo('😎', 44)}<span>Ты</span></div>
      ${['🧑', '👩', '🧔'].map((f, i) => `<div class="st-fr" style="--i:${i}">${emo(f, 30)}</div><em class="st-plus" style="--i:${i}">+${money(REFERRAL.inviter)}</em>`).join('')}
      <div class="st-link">t.me/dropezone_bot/dropezone?startapp=…</div></div>`,
  },
];

// плавный счётчик чисел (для «дохода» и «мощности»)
function stCount(el, ms, delay = 0, to) {
  if (!el) return;
  const from = +(el.dataset.from || 0), end = to ?? +el.dataset.count;
  const fmt = n => el.dataset.from ? String(Math.round(n)) : money(n);
  setTimeout(() => {
    const t0 = performance.now();
    const step = t => {
      if (!el.isConnected) return;
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = fmt(from + (end - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}

// показать истории; промис выполнится, когда их закроют (значение — действие кнопки на последней)
function showStories(STORIES = STORIES_MAIN, key = STORIES_KEY) {
  return new Promise(resolve => {
    let i = 0;
    let result = null;
    const root = document.createElement('div');
    root.className = 'stories';
    root.innerHTML = `<div class="st-bars">${STORIES.map(() => '<i><b></b></i>').join('')}</div>
      <div class="st-top"><span class="st-brand">DROPEZONE: AUTO</span><button class="st-skip">Пропустить</button></div>
      <div class="st-view"></div>`;
    document.body.appendChild(root);
    document.body.classList.add('stories-open');
    const view = root.querySelector('.st-view');
    const bars = [...root.querySelectorAll('.st-bars b')];

    const show = n => {
      i = Math.max(0, Math.min(STORIES.length - 1, n));
      const s = STORIES[i];
      root.style.setProperty('--a', s.accent);
      bars.forEach((b, k) => {
        b.className = k < i ? 'done' : '';
        b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
        if (k === i) { b.style.setProperty('--ms', (s.ms || 6500) + 'ms'); b.className = 'run'; }
      });
      view.innerHTML = `<div class="st-slide">
        <div class="st-stage">${s.stage()}</div>
        <div class="st-text"><h2>${s.title}</h2><p>${s.text}</p>
          ${i === STORIES.length - 1 ? `<button class="btn st-go">${s.btn || 'Поехали!'}</button>` : ''}</div></div>`;
      s.run?.(view);
      haptic.tick();
    };

    const close = () => {
      try { localStorage.setItem(key, '1'); } catch {}
      root.classList.add('out');
      document.body.classList.remove('stories-open');
      setTimeout(() => { root.remove(); resolve(result); }, 300);
    };

    // полоска текущей истории дошла до конца — следующая (последняя ждёт кнопку)
    root.addEventListener('animationend', e => {
      if (e.target === bars[i] && i < STORIES.length - 1) show(i + 1);
    });

    // тап — вперёд/назад, удержание — пауза
    let holdT = null, held = false;
    root.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      held = false;
      holdT = setTimeout(() => { held = true; root.classList.add('paused'); }, 200);
    });
    root.addEventListener('pointerup', e => {
      clearTimeout(holdT);
      if (e.target.closest('.st-skip')) { haptic.tap(); close(); return; }
      if (e.target.closest('.st-go')) { haptic.ok(); result = STORIES[i].act || null; close(); return; }
      if (held) { root.classList.remove('paused'); return; }
      if (e.target.closest('button')) return;
      if (e.clientX < window.innerWidth / 3) show(i - 1);
      else if (i < STORIES.length - 1) show(i + 1);
    });
    root.addEventListener('pointercancel', () => { clearTimeout(holdT); root.classList.remove('paused'); });
    root.addEventListener('contextmenu', e => e.preventDefault());

    show(0);
  });
}

// «Что нового» для показа: новое + прошлое, если его пропустили
function whatsNewList() {
  return storiesSeen(WHATSNEW_PREV_KEY) || Rules.nextActive() ? WHATSNEW_NEW : [...WHATSNEW_PREV, ...WHATSNEW_NEW];   // «×10 за друзей» после релиза уже неправда
}
async function showWhatsNew() {
  const act = await showStories(whatsNewList(), WHATSNEW_KEY);
  try { localStorage.setItem(WHATSNEW_PREV_KEY, '1'); } catch {}
  return act;
}
