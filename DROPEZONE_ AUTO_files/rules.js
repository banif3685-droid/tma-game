// ===== DROPZONE: AUTO — правила игры (общие для игры и сервера) =====
// Здесь все расчёты и ВСЕ действия игрока. Сервер выполняет действия по-настоящему,
// игра в браузере использует расчёты для показа (и действия — в локальном режиме для тестов).
// Работает и как обычный <script>, и как модуль сервера: всё кладётся в globalThis.Rules.
(function (g) {
  'use strict';
  const R = {};

  // ---------- справочники ----------
  R.CAR_BY_ID = Object.fromEntries(CARS.map(c => [c.id, c]));
  R.CASE_BY_ID = Object.fromEntries([...CASES.map(c => [c.id, c]), ...PART_CASES.map(c => [c.id, { ...c, kind: 'part' }])]);
  R.SLOT_BY_ID = Object.fromEntries([...SLOTS, ...EV_SLOTS].map(s => [s.id, s]));
  // слоты машины: у электромобиля (в обновлении) — свои вместо двигателя, турбины, КПП и выхлопа
  R.isEv = car => R.nextActive() && !!CAR(car.id)?.ev;
  R.carSlots = car => R.isEv(car) ? [...EV_SLOTS, ...SLOTS.filter(s => !ICE_ONLY.includes(s.id))] : SLOTS;
  R.allSlots = () => R.nextActive() ? [...SLOTS, ...EV_SLOTS] : SLOTS;
  R.slotFits = (car, slot) => R.carSlots(car).some(s => s.id === slot);
  R.tierIdx = t => RARITY_ORDER.indexOf(t);
  R.carClass = def => def.r === 'X' || def.r === 'E' || def.r === 'F' ? 'S' : def.r;   // секретные (X) и эксклюзивные (E) в тюнинге и гонках — как S
  const CAR = id => R.CAR_BY_ID[id];

  // ошибка действия: текст показывается игроку
  class GameError extends Error {}
  R.GameError = GameError;
  const fail = msg => { throw new GameError(msg); };

  // ---------- новое состояние игрока ----------
  R.newState = (now = Date.now()) => ({
    v: 3,
    season: R.nextActive() ? R.seasonId(now) : undefined,   // новичок после релиза сразу в текущем сезоне (без «сброса при выпуске»)
    money: START_MONEY,
    cars: [],               // { uid, id, got, parts: { slot: tier }, paint? }
    // fuel?, fuelTs? — общий бак игрока для гонок (нет поля — бак полный)
    inv: {},                // склад деталей: { 'turbo:B': 2 }
    slots: GARAGE_START_SLOTS,
    discovered: [],
    starterOpened: false,
    pending: 0,             // накопленный доход гаража
    pendingTs: now,
    stats: { opened: 0, merged: 0, races: 0, wins: 0, carCases: 0, partCases: 0, collects: 0, installs: 0, paints: 0, museumIns: 0, carsSold: 0 },
    level: 1,
    xp: 0,
    quest: 0,               // номер текущего задания новичка
    dq: { day: null, base: {}, claimed: [] },   // ежедневные задания: счётчики на начало дня
    daily: { streak: 0, last: null },
    rewardCaseAt: 0,
    claimed: [],
    boughtSlots: 0,
    museum: [],
    museumSlots: MUSEUM.startSlots,
    museumBought: 0,
    raceOpps: {},
    race: null,             // незаконченная гонка
    plates: [],             // номера игрока: ключи 'А123ВС|77' (на машине — car.plate)
    week: null,             // { key: понедельник недели, base: стоимость гаража в начале недели } — для рейтинга
    invLock: [],            // «остывающие» снятые детали: { slot, t, until }
    partCaseAt: 0,          // когда открывали кейс деталей (пауза PART_CASE_PAUSE_MS)
    notices: [],            // уведомления о выдаче от админа: { id, kind, ...данные, at } — висят, пока игрок не заберёт
    gifts: [],              // подаренные кейсы (от админа): { id, kind, caseId, slot?, note, at } — игрок открывает сам
    waiting: [],            // машины, которым не хватило места в гараже («Ждут места» в окне наград)
    lots: [],               // мои лоты на торговой площадке
    marketLog: [],          // история сделок (последние MARKET.log)
  });

  R.migrate = (saved, now = Date.now()) => {
    const st = Object.assign(R.newState(now), saved);
    st.season = saved?.season;   // нет сезона = игрок ещё не прошёл общий сброс на релизе (newState сезон подставляет только новичкам)
    const okCar = c => c && R.CAR_BY_ID[c.id];
    st.cars = st.cars.filter(okCar);
    st.museum = (st.museum || []).filter(okCar);
    [...st.cars, ...st.museum].forEach(c => { c.parts = c.parts || {}; });
    st.discovered = st.discovered.filter(id => R.CAR_BY_ID[id]);
    st.stats = Object.assign({ opened: 0, merged: 0, races: 0, wins: 0, carCases: 0, partCases: 0, collects: 0, installs: 0, paints: 0, museumIns: 0, carsSold: 0 }, st.stats);
    st.dq = Object.assign({ day: null, base: {}, claimed: [] }, st.dq);
    st.daily = Object.assign({ streak: 0, last: null }, st.daily);
    st.plates = (st.plates || []).filter(k => R.plateParse(k));
    st.invLock = st.invLock || [];
    st.lots = st.lots || [];
    st.waiting = (st.waiting || []).filter(okCar);
    st.gifts = (st.gifts || []).filter(gf => R.giftCase(gf));
    st.notices = st.notices || [];
    st.marketLog = st.marketLog || [];
    [...st.cars, ...st.museum].forEach(c => { if (c.plate && !st.plates.includes(c.plate)) delete c.plate; });
    return st;
  };

  // ---------- машины ----------
  // полный комплект: все слоты заняты деталями одного уровня → уровень, иначе null
  R.fullSet = car => {
    if (!R.nextActive()) return null;
    const ts = R.carSlots(car).map(s => car.parts?.[s.id]);
    return ts.every(t => t && t === ts[0]) ? ts[0] : null;
  };
  R.tuneBonus = car => Object.entries(car.parts || {}).reduce((s, [slot, t]) => s + (R.slotFits(car, slot) ? R.SLOT_BY_ID[slot].hp * PART_TIERS[t].mult : 0), 0)
    + (R.fullSet(car) ? FULL_SET.hp : 0);
  // бета-машина: мощность и доход растут с уровнем игрока (car.lv — обновляется при каждом новом уровне)
  // «вечные» машины-подарки (бета-машина, машина основателей): навсегда, без места в гараже, не продаются;
  // мощность hpMin → hp и доход income → incomeMax растут с уровнем игрока к lvMax (car.lv)
  R.isPerm = car => !!CAR(car.id)?.perm;
  R.isBeta = R.isPerm;
  R.betaLv = car => Math.min(CAR(car.id).lvMax, Math.max(1, car.lv || 1));
  const permK = car => (R.betaLv(car) - 1) / (CAR(car.id).lvMax - 1);
  R.betaHp = car => { const d = CAR(car.id); return Math.round(d.hpMin + (d.hp - d.hpMin) * permK(car)); };
  R.betaIncome = car => { const d = CAR(car.id); return Math.round((d.income + (d.incomeMax - d.income) * permK(car)) / 1000) * 1000; };
  R.carHp = car => Math.round((R.isBeta(car) ? R.betaHp(car) : CAR(car.id).hp) * (1 + R.tuneBonus(car)));
  R.partsValue = car => Object.values(car.parts || {}).reduce((s, t) => s + PART_TIERS[t].price, 0);
  R.plateValueOf = car => car.plate ? R.plateInfo(car.plate).value : 0;
  // эксклюзивная машина стоит столько, сколько за неё заплатили (car.paid)
  R.carBase = car => car.paid ?? CAR(car.id).price;
  R.carValue = car => R.carBase(car) + R.partsValue(car) + R.plateValueOf(car);
  // доход машины в час; S — гараж (для бонуса за 3+ машины одной страны)
  R.incomeK = car => R.nextActive() ? (INCOME_BY[R.carClass(CAR(car.id))] ?? INCOME_K) + (R.fullSet(car) ? FULL_SET.income : 0) : INCOME_K;
  R.setCountries = S => {
    if (!R.nextActive()) return new Set();
    const n = {};
    for (const c of S.cars) { const k = CAR(c.id).c; if (k) n[k] = (n[k] || 0) + 1; }
    return new Set(Object.keys(n).filter(k => n[k] >= INCOME_SET.n));
  };
  R.carIncome = (car, S, sets = S && R.setCountries(S)) => R.isBeta(car) ? R.betaIncome(car) :
    R.carValue(car) * R.incomeK(car) * (sets?.has(CAR(car.id).c) ? 1 + INCOME_SET.k : 1);
  // при продаже машины номер не продаётся — он остаётся у игрока
  R.sellPrice = car => Math.floor((CAR(car.id).price + R.partsValue(car)) * SELL_K);
  R.canInstall = (car, t) => R.tierIdx(t) >= R.tierIdx(R.carClass(CAR(car.id)));
  R.partHpGain = (car, slot, t) => Math.round(CAR(car.id).hp * R.SLOT_BY_ID[slot].hp * PART_TIERS[t].mult);
  R.slotCars = S => S.cars.filter(c => !R.isBeta(c)).length;   // бета-машина места не занимает
  R.garageFull = S => R.slotCars(S) >= S.slots;

  // ---------- доход гаража ----------
  R.incomePerHour = S => { const sets = R.setCountries(S); return S.cars.reduce((s, c) => s + R.carIncome(c, S, sets), 0); };
  R.offlineMs = (S, now = Date.now()) => R.nextActive() && R.vipOn(S, now) ? VIP.offlineH * 3600e3 : OFFLINE_MAX_MS;
  R.pendingCap = (S, now = Date.now()) => R.incomePerHour(S) * R.offlineMs(S, now) / 3600e3;
  R.currentPending = (S, now) => Math.min(S.pending + R.incomePerHour(S) * Math.max(0, now - S.pendingTs) / 3600e3, R.pendingCap(S, now));
  // фиксируем накопленное перед изменением доходности гаража
  R.settleIncome = (S, now) => { S.pending = R.currentPending(S, now); S.pendingTs = now; };

  // релизное обновление (в тесте — только в браузере): машины без места ждут в наградах, а не продаются
  const nextRules = ctx => !NEXT_LOCAL_ONLY || !!ctx.local || !!g.NEXT_LOCAL_ON;
  // положить готовую машину в гараж, а если места нет — в «Ждут места»
  function placeCar(S, car, ctx) {
    if (!R.garageFull(S)) { R.settleIncome(S, ctx.now); S.cars.push(car); return false; }
    S.waiting.push(car);
    return true;
  }

  function addCar(S, id, ctx) {
    R.settleIncome(S, ctx.now);
    const car = { uid: ctx.uid(), id, got: ctx.now, parts: {} };
    S.cars.push(car);
    const isNew = !S.discovered.includes(id);
    if (isNew) S.discovered.push(id);
    return { car, isNew };
  }
  function removeCar(S, uid, ctx) {
    R.settleIncome(S, ctx.now);
    S.cars = S.cars.filter(c => c.uid !== uid);
    delete S.raceOpps[uid];
    S.pending = Math.min(S.pending, R.pendingCap(S));
  }
  const findCar = (S, uid) => S.cars.find(c => c.uid === uid) || fail('Машина не найдена');

  // ---------- номера ----------
  // ключ 'А123ВС|77'; plateInfo — разбор, «очки красоты», редкость и цена
  const plateCache = new Map();
  R.plateParse = key => {
    const m = /^([АВЕКМНОРСТУХ])(\d{3})([АВЕКМНОРСТУХ]{2})\|(\d{2,3})$/.exec(key || '');
    if (!m || m[2] === '000' || !R.plateRegions().includes(m[4])) return null;
    return { l1: m[1], d: m[2], l23: m[3], reg: m[4] };
  };
  R.plateRegions = () => R.nextActive() ? [...PLATE_REGIONS, ...PLATE_REGIONS_NEXT] : PLATE_REGIONS;
  R.plateKey = (l1, d, l23, reg) => `${l1}${d}${l23}|${reg}`;
  // спецсерия: в обновлении — только в своём регионе; возвращает множитель цены или 0
  R.plateSpecial = (series, reg) => {
    for (const g of PLATE_REAL.special) if (g.regions.includes(reg) && g.series[series]) return g.series[series];
    return PLATE_REAL.specialAll?.[series] || 0;
  };
  // реалистичная цена (релизное обновление): база региона × множители цифр и букв
  const realValue = (p, dk, lk, series) => {
    const Q = PLATE_REAL, P = PLATE_SCORE;
    const tier = P.regionTop.includes(p.reg) ? 'top' : P.regionMsk.includes(p.reg) ? 'msk' : Q.regionMo.includes(p.reg) ? 'mo'
      : P.regionSpb.includes(p.reg) ? 'spb' : Q.regionBig.includes(p.reg) ? 'big' : 'other';
    const same = p.l1 === p.l23[0] && p.l1 === p.l23[1];
    const D = Math.log(Q.digits[dk]), L = Math.log(lk === 'blat' ? Math.max(R.plateSpecial(series, p.reg), same ? Q.letters.triple : 1) : Q.letters[lk]);
    let v = (Q.regionBase[p.reg] || Q.region[tier]) * Math.exp(D + L - Q.soften * Math.min(D, L));
    if (same && ['first9', 'd777', 'triple'].includes(dk)) v *= Q.combo;
    if (!D && !L) v *= Q.plainK;
    return v;
  };
  R.plateInfo = key => {
    const ck = key + (R.nextActive() ? '#n' : '');
    if (plateCache.has(ck)) return plateCache.get(ck);
    const p = R.plateParse(key);
    if (!p) return null;
    const P = PLATE_SCORE, D = P.digits, n = +p.d, [a, b, c] = p.d;
    const tags = [];
    let ds = 0, strongDigits = false, dk = 'plain', lk = 'plain';
    const seqUp = +b === +a + 1 && +c === +b + 1, seqDown = +b === +a - 1 && +c === +b - 1;
    if (n <= 9) { dk = 'first9'; ds = D.first9; tags.push('Номер 00' + n); strongDigits = true; }
    else if (p.d === '777') { dk = 'd777'; ds = D.d777; tags.push('Три семёрки'); strongDigits = true; }
    else if (a === b && b === c) { dk = 'triple'; ds = D.triple; tags.push('Три одинаковые цифры'); strongDigits = true; }
    else if (n % 100 === 0) { dk = 'hundreds'; ds = D.hundreds; tags.push('Круглый номер'); }
    else if (n < 100 && n % 10 === 0) { dk = 'tens'; ds = D.tens; tags.push('Круглый номер'); }
    else if (seqUp || seqDown) { dk = 'seq'; ds = D.seq; tags.push('Цифры по порядку'); }
    else if (a === c) { dk = 'mirror'; ds = D.mirror; tags.push('Зеркальные цифры'); }
    else if (a === b || b === c) { dk = 'pair'; ds = D.pair; tags.push('Две одинаковые цифры'); }
    const series = p.l1 + p.l23;
    let ls = 0;
    const sameLetters = p.l1 === p.l23[0] && p.l1 === p.l23[1];
    const spec = R.nextActive() ? R.plateSpecial(series, p.reg) : 0;
    if (R.nextActive() ? spec : P.blat[series]) {
      lk = 'blat';
      ls = R.nextActive() ? Math.log(spec) / Math.log(2.5) : P.blat[series];   // очки красоты из множителя цены
      tags.push(`Блатная серия ${series}`);
    }
    else if (sameLetters) { lk = 'triple'; ls = P.letters.triple; tags.push('Одинаковые буквы'); }
    else if (p.l1 === p.l23[0] || p.l1 === p.l23[1] || p.l23[0] === p.l23[1]) { lk = 'pair'; ls = P.letters.pair; tags.push('Две одинаковые буквы'); }
    const combo = sameLetters && strongDigits ? P.combo : 0;
    let rs = 0;
    if (P.regionTop.includes(p.reg)) { rs = P.regionTopScore; tags.push('Регион Москвы'); }
    else if (P.regionMsk.includes(p.reg)) { rs = P.regionMskScore; tags.push('Регион Москвы'); }
    else if (P.regionSpb.includes(p.reg)) { rs = P.regionSpbScore; tags.push('Регион Петербурга'); }
    const score = ds + ls + combo + rs;
    const rarity = score >= PLATE_RARITY_AT.S ? 'S' : score >= PLATE_RARITY_AT.A ? 'A' : score >= PLATE_RARITY_AT.B ? 'B' : score >= PLATE_RARITY_AT.C ? 'C' : 'D';
    const raw = R.nextActive() ? realValue(p, dk, lk, series) : PLATE_VALUE.base * Math.pow(PLATE_VALUE.k, score);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1);   // округляем до двух значащих цифр
    const info = { ...p, key, score, rarity, value: Math.round(raw / mag) * mag, tags };
    plateCache.set(ck, info);
    return info;
  };
  R.PLATE_CASE_BY_ID = Object.fromEntries(PLATE_CASES.map(c => [c.id, c]));
  // в обновлении номера дороже (реальные цены) — и генерация дороже, окупаемость та же
  R.plateCasePrice = cs => R.nextActive() && cs.priceNext ? cs.priceNext : cs.price;
  R.plateDrops = cs => (R.nextActive() && cs.dropsNext) || cs.drops;   // с релизом в «Обычной» — 0,01% фиолетового

  // случайный номер нужной редкости: собираем из «узоров», пока редкость не совпадёт
  const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
  const wpick = (rnd, w) => { let x = rnd() * Object.values(w).reduce((s, v) => s + v, 0); for (const k in w) { x -= w[k]; if (x < 0) return k; } return Object.keys(w)[0]; };
  const GEN = {
    D: { d: { plain: 80, pair: 20 }, l: { plain: 85, pair: 15 }, r: { other: 80, spb: 10, msk: 6, top: 4 } },
    C: { d: { plain: 10, pair: 20, mirror: 30, round: 25, seq: 15 }, l: { plain: 60, pair: 40 }, r: { other: 55, spb: 15, msk: 15, top: 15 } },
    B: { d: { mirror: 15, round: 20, seq: 25, triple: 25, d777: 5, first9: 10 }, l: { plain: 40, pair: 30, triple: 20, blat: 10 }, r: { other: 45, spb: 15, msk: 20, top: 20 } },
    A: { d: { round: 15, seq: 15, triple: 30, d777: 20, first9: 20 }, l: { plain: 10, pair: 20, triple: 35, blat: 35 }, r: { other: 35, spb: 15, msk: 25, top: 25 } },
    S: { d: { triple: 35, d777: 30, first9: 35 }, l: { triple: 50, blat: 50 }, r: { other: 30, spb: 10, msk: 25, top: 35 } },
  };
  const digit = rnd => Math.floor(rnd() * 10);
  const genDigits = (rnd, kind) => {
    switch (kind) {
      case 'first9': return '00' + (1 + Math.floor(rnd() * 9));
      case 'd777': return '777';
      case 'triple': { const x = 1 + Math.floor(rnd() * 9); return `${x}${x}${x}`; }
      case 'round': return rnd() < 0.5 ? `${1 + Math.floor(rnd() * 9)}00` : `0${1 + Math.floor(rnd() * 9)}0`;
      case 'seq': { const s = Math.floor(rnd() * 8); return rnd() < 0.6 ? `${s}${s + 1}${s + 2}` : `${s + 2}${s + 1}${s}`; }
      case 'mirror': { const x = digit(rnd); let y = digit(rnd); return `${x}${y}${x}`; }
      case 'pair': { const x = digit(rnd), y = digit(rnd); return rnd() < 0.5 ? `${x}${x}${y}` : `${y}${x}${x}`; }
      default: return String(digit(rnd)) + digit(rnd) + digit(rnd);
    }
  };
  const genLetters = (rnd, kind) => {
    if (kind === 'blat') { const s = pick(rnd, Object.keys(PLATE_SCORE.blat)); return [s[0], s.slice(1)]; }
    const x = pick(rnd, PLATE_LETTERS);
    if (kind === 'triple') return [x, x + x];
    if (kind === 'pair') { const y = pick(rnd, PLATE_LETTERS); return rnd() < 0.5 ? [x, x + y] : [y, x + x]; }
    return [x, pick(rnd, PLATE_LETTERS) + pick(rnd, PLATE_LETTERS)];
  };
  const genRegion = (rnd, kind) => pick(rnd, kind === 'top' ? PLATE_SCORE.regionTop : kind === 'msk' ? PLATE_SCORE.regionMsk
    : kind === 'spb' ? PLATE_SCORE.regionSpb : R.plateRegions().filter(r => !PLATE_SCORE.regionTop.includes(r) && !PLATE_SCORE.regionMsk.includes(r) && !PLATE_SCORE.regionSpb.includes(r)));
  R.genPlate = (rnd, rarity, isTaken = () => false, minValue = 0) => {
    const g = GEN[rarity];
    let best = null;
    for (let i = 0; i < 600; i++) {
      const lk = wpick(rnd, g.l);
      let [l1, l23] = genLetters(rnd, lk), reg = genRegion(rnd, wpick(rnd, g.r));
      if (lk === 'blat' && R.nextActive()) {   // спецсерия — сразу со своим регионом
        const sp = pick(rnd, PLATE_REAL.special), ser = pick(rnd, Object.keys(sp.series));
        l1 = ser[0]; l23 = ser.slice(1); reg = pick(rnd, sp.regions);
      }
      const key = R.plateKey(l1, genDigits(rnd, wpick(rnd, g.d)), l23, reg);
      const info = R.plateInfo(key);
      if (!info || isTaken(key)) continue;
      if (info.rarity === rarity && info.value >= minValue) return key;
      if (info.rarity === rarity) best = key;
    }
    if (best) return best;
    fail('Не удалось подобрать номер, попробуй ещё раз');
  };
  // ---------- генерация в выбранном регионе (с релизом, только «Обычная») ----------
  // узор цифр и букв — по редкости из шансов генерации, регион — выбранный; редкость номера выходит сама (Москва — выше)
  const REGION_NAME = {};
  for (const [name, codes] of Object.entries(PLATE_REGION_NAMES)) codes.forEach(c => { REGION_NAME[c] = name; });
  R.plateRegionName = reg => REGION_NAME[reg] || 'Регион ' + reg;
  R.plateRegionOk = (cs, reg) => R.nextActive() && cs.id === PLATE_REGION_PICK.caseId && R.plateRegions().includes(String(reg)) && R.plateRegionPrice(reg) > 0;
  const genPlateIn = (rnd, cs, reg, isTaken = () => false) => {
    const g = GEN[wpick(rnd, R.plateDrops(cs))];
    for (let i = 0; i < 200; i++) {
      const lk = wpick(rnd, g.l);
      const [l1, l23] = genLetters(rnd, lk === 'blat' ? 'triple' : lk);
      const key = R.plateKey(l1, genDigits(rnd, wpick(rnd, g.d)), l23, reg);
      if (R.plateInfo(key) && !isTaken(key)) return key;
    }
    fail('Не удалось подобрать номер, попробуй ещё раз');
  };
  // цена генерации в регионе — готовая таблица PLATE_REGION_PRICE (data.js; считает tools/plate_region_prices.mjs:
  // средняя цена номера по 60 тыс. проб / payback × markup). Нет в таблице — регион выбрать нельзя
  R.plateRegionPrice = reg => PLATE_REGION_PRICE[String(reg)] || 0;
  R.genPlateIn = genPlateIn;   // для tools/plate_region_prices.mjs
  R.plateCacheClear = () => plateCache.clear();

  // номер занят? локально — среди своих; на сервере сюда передадут общий список
  const plateTaken = (S, ctx) => key => S.plates.includes(key) || !!ctx.isPlateTaken?.(key);
  const plateCars = S => [...S.cars, ...S.museum, ...(S.waiting || [])];

  // ---------- склад ----------
  R.invKey = (slot, t) => `${slot}:${t}`;
  R.invCount = (S, slot, t) => S.inv[R.invKey(slot, t)] || 0;
  R.invTotal = S => Object.values(S.inv).reduce((s, n) => s + n, 0);
  R.invAdd = (S, slot, t, n = 1) => {
    const k = R.invKey(slot, t);
    S.inv[k] = (S.inv[k] || 0) + n;
    if (S.inv[k] <= 0) delete S.inv[k];
  };
  R.partSell = t => Math.floor(PART_TIERS[t].price * SELL_K);
  // кулдауны деталей: снятая деталь «остывает», слот на машине пустует
  R.invLocked = (S, slot, t, now) => (S.invLock || []).filter(l => l.slot === slot && l.t === t && l.until > now);
  R.invFree = (S, slot, t, now) => Math.max(0, R.invCount(S, slot, t) - R.invLocked(S, slot, t, now).length);
  R.slotCdLeft = (car, slot, now) => Math.max(0, (car.slotCd?.[slot] || 0) - now);
  // VIP: детали остывают и кейсы деталей открываются вдвое быстрее
  R.vipOn = (S, now) => (S.vipUntil || 0) > now;
  R.partCdMs = (S, now) => R.vipOn(S, now) ? PART_COOLDOWN_MS * VIP.cdK : PART_COOLDOWN_MS;
  R.partPauseMs = (S, now) => R.vipOn(S, now) ? PART_CASE_PAUSE_MS * VIP.cdK : PART_CASE_PAUSE_MS;
  R.partCasePauseLeft = (S, now) => Math.max(0, (S.partCaseAt || 0) + R.partPauseMs(S, now) - now);
  R.fmtLeft = ms => {
    const m = Math.ceil(ms / 60e3), h = Math.floor(m / 60);
    return ms < 60e3 ? `${Math.ceil(ms / 1000)} сек` : h ? `${h} ч ${m % 60} мин` : `${m} мин`;
  };
  const pruneLocks = (S, now) => { S.invLock = (S.invLock || []).filter(l => l.until > now); };
  const lockPart = (S, slot, t, now) => { pruneLocks(S, now); S.invLock.push({ slot, t, until: now + R.partCdMs(S, now) }); };
  // деталей стало меньше, чем «остывающих» — лишние отметки убираем
  const fitLocks = (S, slot, t) => {
    const n = R.invCount(S, slot, t);
    const mine = S.invLock.filter(l => l.slot === slot && l.t === t);
    if (mine.length > n) {
      const drop = new Set(mine.sort((a, b) => b.until - a.until).slice(0, mine.length - n));
      S.invLock = S.invLock.filter(l => !drop.has(l));
    }
  };
  const validPart = (slot, t) => (R.SLOT_BY_ID[slot] && PART_TIERS[t]) || fail('Нет такой детали');

  // ---------- релизное обновление ----------
  // В Telegram новое включится, когда NEXT_LOCAL_ONLY = false; в браузерной тестовой версии game.js ставит NEXT_LOCAL_ON.
  R.nextActive = () => !NEXT_LOCAL_ONLY || !!g.NEXT_LOCAL_ON;
  // обычные машины коллекции (без секретных; новые — только когда обновление включено)
  R.baseCars = () => CARS.filter(c => !c.secret && (!c.next || R.nextActive()));
  // шансы кейса машин: с новыми машинами пул другой — свои шансы (dropsNext), чтобы окупаемость осталась ~97%
  R.caseDrops = cs => cs.event ? R.eventDrops(cs) : (R.nextActive() && cs.dropsNext) || cs.drops;
  R.caseOn = (cs, now = Date.now()) => cs.event ? R.nextActive() && now >= (cs.from || 0) && now < cs.until
    : (!cs.nextCase || R.nextActive()) && (!cs.onlyNext || (R.nextActive() && NEXT_CARS.length > 0 && (!NEW_CASE_UNTIL || now < NEW_CASE_UNTIL)));

  // ---------- временные кейсы (релизное обновление): создаёт владелец, список — globalThis.EVENT_CASES ----------
  // { id, name, icon, cars: [id…], price, stars?, pay: 'rub'|'stars'|'both', from, until, event: true, kind: 'car' }
  // pay: только рубли / только звёзды / игрок выбирает (у старых тестовых кейсов pay нет — по stars)
  // Шансы — как в обычных кейсах: дорогая машина выпадает реже (вес price^-PRICE_WEIGHT_POW).
  R.eventCases = () => R.nextActive() ? (globalThis.EVENT_CASES || []).filter(c => c && c.event) : [];
  R.caseById = id => R.CASE_BY_ID[id] || R.eventCases().find(c => c.id === id);
  R.casePay = cs => cs.pay || (cs.stars ? 'both' : 'rub');
  const evW = c => Math.pow(c.price, -PRICE_WEIGHT_POW);
  R.eventDrops = cs => {
    const out = {};
    for (const id of cs.cars || []) { const c = CAR(id); if (c && !c.secret) out[c.r] = (out[c.r] || 0) + evW(c); }
    const tot = Object.values(out).reduce((a, b) => a + b, 0);
    for (const r in out) out[r] = out[r] / tot * 100;   // в процентах, как drops обычных кейсов
    return out;
  };
  // цена: ожидаемая стоимость выпавшего × SELL_K / 0,95 — при продаже окупается ~95%, как обычные кейсы
  R.eventCasePrice = ids => {
    const cars = ids.map(CAR).filter(c => c && !c.secret);
    if (!cars.length) return 0;
    const tw = cars.reduce((a, c) => a + evW(c), 0);
    const ev = cars.reduce((a, c) => a + evW(c) / tw * c.price, 0);
    const x = ev * SELL_K / 0.95, step = Math.pow(10, Math.max(3, Math.floor(Math.log10(x)) - 1));
    return Math.max(10e3, Math.round(x / step) * step);
  };

  // ---------- кейсы ----------
  R.casePool = (cs, rarity) => {
    if (cs.secretCase) return SECRET_CARS.filter(c => c.r === rarity);
    if (cs.event) return (cs.cars || []).map(CAR).filter(c => c && !c.secret && c.r === rarity);
    const max = cs.maxPrice?.[rarity] ?? Infinity;
    return R.baseCars().filter(c => (!cs.onlyNext || c.next) && c.r === rarity && c.price <= max && c.price >= (cs.minPrice || 0) && (!cs.country || c.c === cs.country));
  };
  R.weightedPick = (items, weightFn, rnd = Math.random) => {
    const total = items.reduce((s, it) => s + weightFn(it), 0);
    let x = rnd() * total;
    for (const it of items) { x -= weightFn(it); if (x <= 0) return it; }
    return items[items.length - 1];
  };
  // результат кейса: { kind: 'car', id } или { kind: 'part', slot, t }
  R.rollCase = (cs, rnd = Math.random) => {
    if (cs.kind === 'part') {
      const t = R.weightedPick(Object.keys(cs.drops), r => cs.drops[r], rnd);
      // случайная деталь: детали электромобилей выпадают вдвое реже обычных
      const pool = R.allSlots(), w = sl => sl.ev ? 0.5 : 1;
      return { kind: 'part', slot: cs.slot || R.weightedPick(pool, w, rnd).id, t };
    }
    const drops = R.caseDrops(cs);
    const rarities = Object.keys(drops).filter(r => R.casePool(cs, r).length);
    const rarity = R.weightedPick(rarities, r => drops[r], rnd);
    return { kind: 'car', id: R.weightedPick(R.casePool(cs, rarity), c => Math.pow(c.price, -PRICE_WEIGHT_POW), rnd).id };
  };
  // «Что внутри»: шансы кейса — как в rollCase. Машины: [{ r, pct, items: [{ id, pct }] }], детали: [{ r, pct }]
  R.caseOdds = cs => {
    if (cs.kind === 'part') {
      const tot = Object.values(cs.drops).reduce((a, b) => a + b, 0);
      return Object.keys(cs.drops).map(r => ({ r, pct: cs.drops[r] / tot * 100 }));
    }
    const drops = R.caseDrops(cs);
    const rs = Object.keys(drops).filter(r => R.casePool(cs, r).length);
    const tot = rs.reduce((a, r) => a + drops[r], 0);
    return rs.map(r => {
      const pct = drops[r] / tot * 100, pool = R.casePool(cs, r);
      const w = c => Math.pow(c.price, -PRICE_WEIGHT_POW), wt = pool.reduce((a, c) => a + w(c), 0);
      return { r, pct, items: pool.map(c => ({ id: c.id, pct: pct * w(c) / wt })).sort((a, b) => b.pct - a.pct) };
    });
  };
  R.slotCasePrice = price => {
    const x = price * (1 + SLOT_CASE_MARKUP);
    const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 2));
    return Math.round(x / step) * step;
  };
  // кейс деталей: базовый уровень + конкретная деталь (самый дорогой — только со случайной)
  R.partCase = (baseId, slot) => {
    let base = R.CASE_BY_ID[baseId];
    if (!base || base.kind !== 'part') base = R.CASE_BY_ID[PART_CASES[0].id];
    if (!slot || !R.SLOT_BY_ID[slot]) return base;
    if (base.anySlotOnly) base = R.CASE_BY_ID[[...PART_CASES].reverse().find(c => !c.anySlotOnly).id];
    return { ...base, slot, price: R.slotCasePrice(base.price), name: `${R.SLOT_BY_ID[slot].name} · ${base.name}` };
  };

  // ---------- топливо и гонки ----------
  // два бака: общий у игрока (S, fuelMax) и у каждой машины (car, carFuelMax); нет поля fuel — бак полный
  // S — владелец бака (у VIP топливо восстанавливается быстрее)
  // бак машины: в релизном обновлении зависит от класса
  R.carFuelMax = car => R.nextActive() ? RACE.carFuelBy[R.carClass(CAR(car.id))] || RACE.carFuelMax : RACE.carFuelMax;
  const fuelMaxOf = o => o.uid ? R.carFuelMax(o) : RACE.fuelMax;
  const regenOf = (S, now) => S && R.vipOn(S, now) ? RACE.fuelRegenMs / VIP.fuelK : RACE.fuelRegenMs;
  R.fuelNow = (o, now, S) => o.fuel === undefined ? fuelMaxOf(o)
    : Math.min(fuelMaxOf(o), o.fuel + Math.floor((now - o.fuelTs) / regenOf(S, now)));
  R.nextFuelMs = (o, now, S) => R.fuelNow(o, now, S) >= fuelMaxOf(o) ? 0 : regenOf(S, now) - ((now - o.fuelTs) % regenOf(S, now));
  const refuel = S => { delete S.fuel; delete S.fuelTs; S.cars.forEach(c => { delete c.fuel; delete c.fuelTs; }); };
  function spendFuel(o, now, S) {
    const f = R.fuelNow(o, now, S), rg = regenOf(S, now);
    if (o.fuel === undefined || f >= fuelMaxOf(o)) o.fuelTs = now;
    else o.fuelTs += Math.floor((now - o.fuelTs) / rg) * rg;
    o.fuel = f - 1;
  }
  R.diffOf = id => RACE.diffs.find(x => x.id === id);
  R.racePrize = (car, opp) => { const d = R.diffOf(opp.diff); return Math.round(Math.min(RACE.prize[R.carClass(CAR(car.id))] * d.mult, d.cap ?? Infinity)); };
  R.raceFee = (car, opp) => R.diffOf(opp.diff)?.noFee ? 0 : Math.round(R.racePrize(car, opp) * RACE.feeK);
  R.quarterTime = p => 5.825 * Math.pow(3086 / p, 1 / 3);         // время на 402 м по мощности
  R.trapSpeed = p => Math.round(234 * Math.pow(p / 3086, 1 / 3) * 1.609);   // скорость на финише, км/ч
  R.luckK = (rnd = Math.random) => 1 + RACE.luck * (rnd() * 2 - 1);
  R.botStartK = (rnd = Math.random) => [0.97, 1, 1, 1.02, 1.02, 1.04][Math.floor(rnd() * 6)];
  R.genOpponents = (car, rnd = Math.random) => {
    const d = CAR(car.id);
    const pool = R.baseCars().filter(c => c.r === R.carClass(d) && c.id !== d.id);
    const names = [...BOT_NAMES];
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
    return RACE.diffs.filter(df => !df.next || R.nextActive()).map((diff, i) => ({
      diff: diff.id,
      carId: (pool.length ? pool : [d])[Math.floor(rnd() * (pool.length || 1))].id,
      name: names[i],
      hp: Math.round(d.hp * (diff.power[0] + rnd() * (diff.power[1] - diff.power[0]))),
    }));
  };

  // ---------- награды ----------
  // день считается по московскому времени — у всех игроков бонус обновляется в полночь по Москве
  const MSK = 3 * 3600e3;
  R.dayKey = now => new Date(now + MSK).toISOString().slice(0, 10);
  R.msToNextDay = now => 86400e3 - ((now + MSK) % 86400e3);
  // неделя — с понедельника по Москве; ключ — дата понедельника
  const mskDow = now => (new Date(now + MSK).getUTCDay() + 6) % 7;
  R.weekKey = now => new Date(now + MSK - mskDow(now) * 86400e3).toISOString().slice(0, 10);
  R.msToWeekEnd = now => (7 - mskDow(now)) * 86400e3 - ((now + MSK) % 86400e3);

  // ---------- рейтинг ----------
  // стоимость гаража: машины (с деталями и номерами) в гараже и на витрине + номера, которые не на машине
  R.garageWorth = S => {
    const cars = [...S.cars, ...S.museum].filter(c => !R.isBeta(c) && !CAR(c.id)?.pass);   // бета-машина и машина сезона в рейтинг не входят
    const onCars = new Set(cars.map(c => c.plate).filter(Boolean));
    return Math.floor(cars.reduce((s, c) => s + R.carValue(c), 0)
      + (S.plates || []).filter(k => !onCars.has(k)).reduce((s, k) => s + (R.plateInfo(k)?.value || 0), 0));
  };
  // новая неделя — запоминаем стоимость гаража, рейтинг недели считается от неё
  R.rollWeek = (S, now) => {
    const key = R.weekKey(now);
    if (S.week?.key !== key) S.week = { key, base: R.garageWorth(S) };
  };
  // рейтинг недели (с 19.10): стоимость машин, полученных с понедельника 00:00 МСК (с деталями и номерами на них), если они
  // ещё в гараже или на витрине. Машины прошлых недель и их продажа не влияют. Бета-машина и машина сезона не считаются.
  R.weekStart = key => Date.parse(key + 'T00:00:00+03:00');
  R.weekGain = S => {
    if (!S.week?.key) return 0;
    const from = R.weekStart(S.week.key);
    return Math.floor([...S.cars, ...S.museum].filter(c => (c.got || 0) >= from && !R.isBeta(c) && !CAR(c.id)?.pass)
      .reduce((s, c) => s + R.carValue(c), 0));
  };

  // ---------- сезоны (релизное обновление) ----------
  const SEASON_MS = SEASON.days * 86400e3;
  // номер сезона; seasonShift — только в тестовой версии (кнопка «завершить сезон»)
  R.seasonId = (now, S) => Math.max(1, Math.floor((now - SEASON.epoch) / SEASON_MS) + 1) + (S?.seasonShift || 0);
  R.msToSeasonEnd = now => SEASON_MS - (((now - SEASON.epoch) % SEASON_MS) + SEASON_MS) % SEASON_MS;
  R.seasonStartAt = now => now - (SEASON_MS - R.msToSeasonEnd(now));   // начало текущего сезона (общее для всех)
  // машина сезона для премиум-пропуска: своя у каждого сезона, нет — последняя из списка
  R.passCar = (S, now) => { const n = R.seasonId(now, S); return PASS_CARS.filter(c => c.season <= n).at(-1) || PASS_CARS[0] || null; };
  R.seasonPrize = place => place > 0 ? SEASON.prizes.find(p => place <= p.to) || null : null;
  // новый сезон: всё сбрасывается, кроме «вечного»
  R.seasonReset = (S, id, now) => {
    const all = [...S.cars, ...S.museum, ...(S.waiting || [])];
    const beta = S.cars.filter(c => R.isBeta(c)).map(c => ({ uid: c.uid, id: c.id, got: c.got, parts: {}, lv: 1, ...(c.skin ? { skin: c.skin } : {}) }));
    const hall = [...(S.hall || []), ...all.filter(c => CAR(c.id).secret && !R.isBeta(c))
      .map(c => ({ uid: c.uid, id: c.id, got: c.got, paint: c.paint, cont: c.cont, season: S.season }))];
    // lastSeason — стоимость гаража на конец сезона (сервер считает по ней места, даже если игрок уже зашёл в новый сезон)
    const lastSeason = { id: S.season, worth: R.garageWorth(S) };
    const seasonResult = S.seasonResult?.season === S.season ? S.seasonResult : { season: S.season, place: null, prize: null, shown: false };
    const keep = { hall, stars: S.stars || 0, badges: S.badges || [], vipUntil: S.vipUntil, starterPack: S.starterPack,
      starSlots: S.starSlots || 0, plateSlots: S.plateSlots || 0, hist: S.hist || [], raceLog: S.raceLog || [], refPending: S.refPending, seasonShift: S.seasonShift, season: id, notices: S.notices || [],
      lastSeason, seasonResult, prizeQueue: S.prizeQueue || [], betaChecked: S.betaChecked, founder: S.founder, awards: S.awards || [],
      gifts: S.gifts || [], contWon: S.contWon || [] };   // подарки (в т.ч. оплаченные звёздами кейсы) и неоткрытые контейнеры не сгорают
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, R.newState(now), keep);
    S.cars.push(...beta);
    S.slots = GARAGE_START_SLOTS + keep.starSlots;
  };
  // бета-машина: на релизе один раз всем, у кого 3+ уровня (до общего сброса — по уровню беты)
  R.betaGrant = (S, ctx) => {
    if (!BETA_CAR || !R.nextActive() || S.betaChecked) return;
    S.betaChecked = true;
    if ((S.level || 1) >= BETA_CAR.minLevel && !S.cars.some(c => c.id === BETA_CAR.id)) {
      S.cars.push({ uid: ctx.uid(), id: BETA_CAR.id, got: ctx.now, parts: {}, lv: S.level });
      S.notices = [...(S.notices || []), { id: ctx.uid(), kind: 'car', carId: BETA_CAR.id, icon: '🏁', title: 'Спасибо за бету!', sub: `${BETA_CAR.name} — уже в гараже, навсегда`, at: ctx.now }];
    }
  };
  R.rollSeason = (S, now, ctx) => {
    if (!nextRules(ctx)) return;
    const id = R.seasonId(now, S);
    if (S.season == null) {   // старый игрок впервые после выпуска обновления — общий сброс (как конец сезона); секретки → Витрина славы «β»
      if (ctx.uid) R.betaGrant(S, { ...ctx, now });
      S.season = 'β';
      R.seasonReset(S, id, now);
      delete S.lastSeason; S.seasonResult = null;   // итогов «сезона β» нет — окно итогов не показываем
      S.notices = [...(S.notices || []), { id: ctx.uid ? ctx.uid() : 'rel' + now, kind: 'buy', icon: '🚀', title: 'Большое обновление!', sub: `Начался сезон ${id} — у всех равный старт. Секретные машины — в Витрине славы`, at: now }];
    } else if (S.season !== id) R.seasonReset(S, id, now);
  };
  R.dailyAvailable = (S, now) => S.daily.last !== R.dayKey(now);
  // бонус дня: в обновлении — 14 дней и пропуск не сбрасывает серию
  R.dailyList = () => R.nextActive() ? DAILY_NEXT : DAILY;
  R.dailyNextDay = (S, now) => {
    const { streak, last } = S.daily;
    const len = R.dailyList().length;
    if (last === R.dayKey(now)) return streak;
    if (R.nextActive()) return last ? streak % len + 1 : 1;
    if (last === R.dayKey(now - 86400e3)) return streak % len + 1;
    return 1;
  };
  R.rewardCaseReady = (S, now) => now >= S.rewardCaseAt;
  R.slotPrice = S => Math.round((R.nextActive() ? GARAGE.firstPriceNext : GARAGE.firstPrice) * Math.pow(GARAGE.growth, S.boughtSlots));
  R.museumSlotPrice = S => Math.round(MUSEUM.firstPrice * Math.pow(MUSEUM.growth, S.museumBought));
  R.museumFull = S => S.museum.length >= S.museumSlots;

  R.collectionGoals = S => {
    const owned = new Set(S.discovered);
    const base = R.baseCars();
    const have = base.filter(c => owned.has(c.id)).length;
    const goals = COLLECTION_MILESTONES.filter(m => !m.next || R.nextActive()).map(m => {
      const n = m.all ? base.length : Math.min(m.n, base.length);
      return { id: m.id || 'm' + m.n, title: n >= base.length ? 'Вся коллекция' : `Собери ${n} машин`, have: Math.min(have, n), need: n, reward: m, icon: '📒' };
    });
    for (const [c, money] of Object.entries(R.nextActive() ? COUNTRY_REWARDS_NEXT : COUNTRY_REWARDS)) {
      const list = base.filter(x => x.c === c);
      goals.push({ id: 'c_' + c, title: `Все машины: ${COUNTRIES[c].name}`, have: list.filter(x => owned.has(x.id)).length, need: list.length, reward: R.nextActive() ? { money } : { money, secret: SECRET_BY_COUNTRY[c] }, icon: COUNTRIES[c].flag });
    }
    return goals.map(g => ({ ...g, done: g.have >= g.need, claimed: S.claimed.includes(g.id) }));
  };

  // ---------- опыт и уровни ----------
  R.xpNeed = xpNeed;
  R.levelGift = L => ({ money: levelMoney(L), ...(LEVEL_GIFTS[L] || {}) });
  // сезонный пропуск: премиум куплен на этот сезон
  R.passOn = () => R.nextActive();
  R.passPremOn = (S, now) => R.passOn() && S.passPrem === R.seasonId(now, S);
  // начислить опыт; на новом уровне сразу выдаётся подарок (список — в ctx.levelUps для показа)
  // опыт за кейсы, номера, слияние и установку деталей — с суточным лимитом XP_GRIND_DAY
  R.grindXpLeft = (S, now) => XP_GRIND_DAY - (S.xpGrind?.day === R.dayKey(now) ? S.xpGrind.used : 0);
  function addGrindXp(S, n, ctx) {
    const day = R.dayKey(ctx.now);
    if (S.xpGrind?.day !== day) S.xpGrind = { day, used: 0 };
    const k = Math.max(0, Math.min(n, XP_GRIND_DAY - S.xpGrind.used));
    S.xpGrind.used += k;
    addXp(S, k, ctx);
  }

  function addXp(S, n, ctx) {
    if (!n) return;
    S.xp += n;
    while (S.xp >= R.xpNeed(S.level)) {
      S.xp -= R.xpNeed(S.level);
      S.level++;
      // релизное обновление: награды уровня ждут в уведомлении пропуска, пока игрок их не заберёт (passClaim)
      if (R.passOn()) { S.passPending = [...(S.passPending || []), S.level]; continue; }
      const items = grant(S, R.levelGift(S.level), ctx);
      (ctx.levelUps = ctx.levelUps || []).push({ level: S.level, items });
    }
    for (const c of S.cars) if (R.isBeta(c)) c.lv = S.level;
  }

  // ---------- задания ----------
  R.statValue = (S, key) => key === 'collection'
    ? S.discovered.filter(id => !R.CAR_BY_ID[id].secret).length
    : (S.stats[key] || 0);
  // текущее задание новичка или null, если цепочка пройдена
  R.newbieQuest = S => {
    const q = NEWBIE_QUESTS[S.quest];
    if (!q) return null;
    const have = Math.min(q.need, R.statValue(S, q.stat));
    return { i: S.quest, q, have, done: have >= q.need };
  };
  // ежедневные задания — одинаковые у всех игроков в этот день
  R.dailyQuestList = now => {
    let h = 2166136261;
    for (const ch of R.dayKey(now)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
    const pool = DAILY_QUESTS.filter(q => !q.next || R.nextActive());
    const out = [];
    while (out.length < DAILY_QUESTS_PER_DAY && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  };
  // недельные задания (релизное обновление) — одинаковые у всех на этой неделе
  R.weeklyQuestList = now => {
    if (!R.nextActive()) return [];
    let h = 2166136261;
    for (const ch of 'w' + R.weekKey(now)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
    const pool = [...WEEKLY_QUESTS], out = [];
    while (out.length < WEEKLY_PER_WEEK && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  };
  R.weeklyQuests = (S, now) => {
    const cur = S.wq?.week === R.weekKey(now);
    return R.weeklyQuestList(now).map(q => {
      const base = cur ? (S.wq.base[q.stat] ?? R.statValue(S, q.stat)) : R.statValue(S, q.stat);
      const have = Math.min(q.need, R.statValue(S, q.stat) - base);
      return { q, have, done: have >= q.need, claimed: cur && S.wq.claimed.includes(q.id) };
    });
  };
  R.rollWeekQuests = (S, now) => {
    if (!R.nextActive()) return;
    const week = R.weekKey(now);
    if (S.wq?.week === week) return;
    const base = {};
    for (const q of R.weeklyQuestList(now)) base[q.stat] = R.statValue(S, q.stat);
    S.wq = { week, base, claimed: [] };
  };
  // бонус за все задания дня
  R.dailyAllReady = (S, now) => R.nextActive() && !S.dq.all && R.dailyQuests(S, now).every(d => d.claimed);
  R.dailyQuestMoney = (S, q) => Math.round(q.money * (1 + (S.level - 1) * 0.2) / 1000) * 1000;
  R.dailyQuests = (S, now) => {
    const today = S.dq.day === R.dayKey(now);
    return R.dailyQuestList(now).map(q => {
      const base = today ? (S.dq.base[q.stat] ?? R.statValue(S, q.stat)) : R.statValue(S, q.stat);
      const have = Math.min(q.need, R.statValue(S, q.stat) - base);
      return { q, have, done: have >= q.need, claimed: today && S.dq.claimed.includes(q.id), money: R.dailyQuestMoney(S, q) };
    });
  };
  R.questsAvailable = (S, now) => S.quest >= NEWBIE_QUESTS.length;   // ежедневные — после цепочки новичка
  // новый день: запоминаем счётчики, от них считается прогресс ежедневных заданий
  R.rollDay = (S, now) => {
    const day = R.dayKey(now);
    if (S.dq.day === day) {
      // список заданий сменился посреди дня (включили обновление) — запоминаем счётчики новых заданий
      for (const q of R.dailyQuestList(now)) if (!(q.stat in S.dq.base)) S.dq.base[q.stat] = R.statValue(S, q.stat);
      return;
    }
    const base = {};
    for (const q of R.dailyQuestList(now)) base[q.stat] = R.statValue(S, q.stat);
    S.dq = { day, base, claimed: [] };
  };

  // выдача награды: возвращает список выданного для показа
  function grant(S, r, ctx) {
    const out = [];
    if (r.money) { S.money += r.money; out.push({ kind: 'money', amount: r.money }); }
    if (r.parts) for (let i = 0; i < r.parts.n; i++) {
      const d = R.rollCase(R.CASE_BY_ID[r.parts.case], ctx.rnd);
      R.invAdd(S, d.slot, d.t);
      out.push({ kind: 'part', slot: d.slot, t: d.t });
    }
    if (r.car) {
      const id = R.rollCase(R.CASE_BY_ID[r.car], ctx.rnd).id;
      if (R.garageFull(S) && nextRules(ctx)) {
        // места нет — машина ждёт в наградах, в коллекцию засчитывается сразу
        const car = { uid: ctx.uid(), id, got: ctx.now, parts: {} };
        S.waiting.push(car);
        const isNew = !S.discovered.includes(id);
        if (isNew) { S.discovered.push(id); addXp(S, XP.newCar, ctx); }
        out.push({ kind: 'car', id, uid: car.uid, isNew, waiting: true });
      } else if (R.garageFull(S)) {
        // места нет — машина сразу продаётся, в коллекцию засчитывается
        const amount = Math.floor(CAR(id).price * SELL_K);
        S.money += amount;
        if (!S.discovered.includes(id)) S.discovered.push(id);
        out.push({ kind: 'car', id, sold: amount });
      } else {
        const { car, isNew } = addCar(S, id, ctx);
        out.push({ kind: 'car', id, uid: car.uid, isNew });
        if (isNew) addXp(S, XP.newCar, ctx);
      }
    }
    if (r.cars) for (let i = 0; i < r.cars.n; i++) out.push(...grant(S, { car: r.cars.case }, ctx));
    // секретный кейс — подарком: игрок сам крутит его на экране кейсов
    if (r.secretCase) for (let i = 0; i < r.secretCase; i++) {
      S.gifts = S.gifts || [];
      S.gifts.push({ id: ctx.uid(), kind: 'car', caseId: 'secret', note: 'За всю коллекцию', at: ctx.now });
      out.push({ kind: 'scase' });
    }
    if (r.passCar && R.passCar(S, ctx.now)) r = { ...r, secret: R.passCar(S, ctx.now).id };   // машина сезона (пропуск, 30 ур.)
    if (r.secretRandom) {
      // случайная секретная машина, лучше — которой ещё нет
      const have = new Set([...S.cars, ...S.museum, ...(S.waiting || []), ...(S.hall || [])].map(c => c.id));
      const pool = SECRET_CARS.filter(c => !have.has(c.id));
      r = { ...r, secret: (pool.length ? pool : SECRET_CARS)[Math.floor(ctx.rnd() * (pool.length || SECRET_CARS.length))].id };
    }
    if (r.secret && R.garageFull(S) && nextRules(ctx)) {
      const car = { uid: ctx.uid(), id: r.secret, got: ctx.now, parts: {} };
      S.waiting.push(car);
      if (!S.discovered.includes(r.secret)) S.discovered.push(r.secret);
      out.push({ kind: 'car', id: r.secret, uid: car.uid, waiting: true });
    } else if (r.secret) {
      const { car, isNew } = addCar(S, r.secret, ctx);
      out.push({ kind: 'car', id: r.secret, uid: car.uid, isNew });
    }
    if (r.fuel) { refuel(S); out.push({ kind: 'fuel' }); }
    if (r.slots) { S.slots = Math.min(GARAGE.maxSlots, S.slots + r.slots); out.push({ kind: 'slots', n: r.slots }); }
    if (r.rcase) { S.rewardCaseAt = 0; out.push({ kind: 'rcase' }); }
    return out;
  }

  // ---------- покраска ----------
  // покраска вернётся с релизным обновлением (в тесте уже работает)
  R.canPaintId = id => (PAINT_ENABLED || R.nextActive()) && !NO_PAINT.includes(id) && (PAINT_OLD || !!(CAR(id)?.next || CAR(id)?.excl));
  R.paintPrice = car => Math.max(PAINT_MIN, Math.round(R.carBase(car) * PAINT_K / 1000) * 1000);

  // =====================================================================
  // ДЕЙСТВИЯ ИГРОКА: A[name](S, params, ctx) — меняют состояние S и возвращают результат.
  // ctx = { now, rnd, uid(), admin }
  // =====================================================================
  const A = {};

  A.openCase = (S, p, ctx) => {
    if (p.kind === 'part') {
      const cs = R.partCase(p.caseId, p.slot);
      const n = PART_COUNTS.includes(p.count) ? p.count : 1;
      const wait = R.partCasePauseLeft(S, ctx.now);
      if (wait > 0) fail(`Следующий кейс деталей — через ${R.fmtLeft(wait)}`);
      S.partCaseAt = ctx.now;
      const cost = cs.price * n;
      if (S.money < cost) fail('Не хватает денег');
      S.money -= cost;
      const keepTiers = p.autoSell?.on ? (p.autoSell.tiers || []) : null;
      const items = [];
      for (let i = 0; i < n; i++) {
        const d = R.rollCase(cs, ctx.rnd);
        const sold = !!keepTiers && !keepTiers.includes(d.t);
        if (sold) S.money += R.partSell(d.t); else R.invAdd(S, d.slot, d.t);
        items.push({ slot: d.slot, t: d.t, sold });
      }
      S.stats.opened += n;
      S.stats.partCases += n;
      addGrindXp(S, XP.partCase * n, ctx);
      return { items };
    }
    const cs = R.caseById(p.caseId);
    if (!cs || cs.kind === 'part' || cs.hidden || !R.caseOn(cs, ctx.now)) fail(cs?.event ? 'Временный кейс закончился' : 'Нет такого кейса');
    if (R.garageFull(S)) fail('Гараж заполнен');
    const n = !cs.starter && !p.stars && CAR_COUNTS.includes(p.count) ? p.count : 1;
    if (S.slots - R.slotCars(S) < n) fail(`Нужно ${n} свободных мест в гараже`);
    if (cs.starter) {
      if (S.starterOpened) fail('Стартовый кейс уже открыт');
      S.starterOpened = true;
    } else if (p.stars) {
      // временный кейс за звёзды: со счёта (призы сезона) или оплатой (тест — имитируется; с сервером оплата Telegram
      // приходит подарком через shopBuy 'ev:<id>', а здесь — только звёзды со счёта)
      if (!cs.event || !cs.stars || R.casePay(cs) === 'rub') fail('Этот кейс не за звёзды');
      if (p.useStars) {
        if ((S.stars || 0) < cs.stars) fail('Не хватает звёзд на счету');
        S.stars -= cs.stars;
      } else if (!ctx.local && !ctx.paid) fail('Оплата не прошла');
    } else {
      if (cs.event && R.casePay(cs) === 'stars') fail('Этот кейс — только за звёзды');
      if (S.money < cs.price * n) fail('Не хватает денег');
      S.money -= cs.price * n;
    }
    const items = [];
    for (let i = 0; i < n; i++) {
      const id = R.rollCase(cs, ctx.rnd).id;
      const { car, isNew } = addCar(S, id, ctx);
      items.push({ id, uid: car.uid, isNew });
    }
    // опыт — после всех машин: подарок за новый уровень (машина) не займёт место, оставленное под кейсы ×N
    for (const it of items) {
      addGrindXp(S, XP.carCase, ctx);
      if (it.isNew) addXp(S, XP.newCar, ctx);   // новая машина в коллекции — без лимита
    }
    S.stats.opened += n;
    S.stats.carCases += n;
    return { ...items[0], items };
  };

  // последнюю машину в гараже нельзя продать / убрать — иначе без денег не на чем гонять и нечем зарабатывать
  const LAST_CAR = 'Последнюю машину в гараже продать нельзя — на ней можно гонять и зарабатывать';
  const keepLast = S => { if (S.cars.length <= 1) fail(LAST_CAR); };

  // продать несколько машин разом (например, всё из открытия ×N); секретные пропускаются
  A.sellCars = (S, p, ctx) => {
    let sum = 0, n = 0;
    for (const uid of (p.uids || []).slice(0, 50)) {
      if (S.cars.length <= 1) break;
      const car = S.cars.find(c => c.uid === uid);
      if (!car || CAR(car.id).secret) continue;
      sum += R.sellPrice(car);
      removeCar(S, car.uid, ctx);
      S.stats.carsSold++;
      n++;
    }
    if (!n) fail(S.cars.length <= 1 ? LAST_CAR : 'Нечего продавать');
    S.money += sum;
    return { sum, n };
  };

  A.sellCar = (S, p, ctx) => {
    const car = findCar(S, p.uid);
    if (CAR(car.id).secret) fail('Секретную машину нельзя продать');
    keepLast(S);
    const price = R.sellPrice(car);
    removeCar(S, car.uid, ctx);
    S.money += price;
    S.stats.carsSold++;
    return { price };
  };

  // продажа деталей со склада: items = [{ slot, t, n }]
  A.sellParts = (S, p) => {
    let sum = 0;
    for (const { slot, t, n = 1 } of p.items || []) {
      validPart(slot, t);
      const k = Math.min(Math.max(0, Math.floor(n)), R.invCount(S, slot, t));
      if (!k) continue;
      R.invAdd(S, slot, t, -k);
      fitLocks(S, slot, t);
      sum += R.partSell(t) * k;
    }
    if (!sum) fail('Нечего продавать');
    S.money += sum;
    return { sum };
  };

  A.collect = (S, p, ctx) => {
    R.settleIncome(S, ctx.now);
    const got = Math.floor(S.pending);
    if (got < 1) fail('Пока нечего забирать');
    S.pending -= got;
    S.money += got;
    S.stats.collects++;
    return { got };
  };

  A.install = (S, p, ctx) => {
    const car = findCar(S, p.uid);
    validPart(p.slot, p.t);
    if (!R.invCount(S, p.slot, p.t)) fail('Такой детали нет на складе');
    if (!R.invFree(S, p.slot, p.t, ctx.now)) fail(`Эта деталь недавно снята — остынет через ${R.fmtLeft(Math.min(...R.invLocked(S, p.slot, p.t, ctx.now).map(l => l.until)) - ctx.now)}`);
    const cd = R.slotCdLeft(car, p.slot, ctx.now);
    if (cd) fail(`С этого слота недавно сняли деталь — поставить можно через ${R.fmtLeft(cd)}`);
    if (!R.canInstall(car, p.t)) fail('Деталь не подходит по классу');
    if (!R.slotFits(car, p.slot)) fail(R.isEv(car) ? 'У электромобиля нет такой детали — ставь электромотор, батарею или редуктор' : 'Это деталь для электромобиля');
    R.settleIncome(S, ctx.now);
    const before = R.carHp(car);
    const old = car.parts[p.slot];
    if (old) { R.invAdd(S, p.slot, old); lockPart(S, p.slot, old, ctx.now); }   // заменённая деталь тоже «остывает»
    R.invAdd(S, p.slot, p.t, -1);
    car.parts[p.slot] = p.t;
    S.stats.installs++;
    addGrindXp(S, XP.install, ctx);
    return { gain: R.carHp(car) - before };
  };

  A.uninstall = (S, p, ctx) => {
    const car = findCar(S, p.uid);
    if (!car.parts[p.slot]) fail('Слот пустой');
    R.settleIncome(S, ctx.now);
    R.invAdd(S, p.slot, car.parts[p.slot]);
    lockPart(S, p.slot, car.parts[p.slot], ctx.now);
    car.slotCd = { ...car.slotCd, [p.slot]: ctx.now + R.partCdMs(S, ctx.now) };
    delete car.parts[p.slot];
    S.pending = Math.min(S.pending, R.pendingCap(S));
    return {};
  };

  // ---------- номера ----------
  // машин (гараж + витрина) + 5, у VIP ещё +10
  R.plateLimit = (S, now = Date.now()) => S.cars.length + S.museum.length + PLATE_LIMIT_EXTRA + (R.vipOn(S, now) ? VIP.plates : 0);
  // релизное обновление: лимит только на номера в запасе (не на машине)
  R.plateStoreCap = (S, now = Date.now()) => PLATE_STORE.base + (S.plateSlots || 0) + (R.vipOn(S, now) ? VIP.plates : 0);
  R.platesSpare = S => { const on = new Set([...S.cars, ...S.museum].map(c => c.plate).filter(Boolean)); return S.plates.filter(k => !on.has(k)).length; };
  // { full, used, cap, msg } — можно ли получить ещё номер
  R.plateRoom = (S, now = Date.now()) => {
    if (R.nextActive()) {
      const used = R.platesSpare(S), cap = R.plateStoreCap(S, now);
      return { full: used >= cap, used, cap, msg: `В запасе максимум ${cap} номеров — повесь номер на машину или продай лишние` };
    }
    const used = S.plates.length, cap = R.plateLimit(S, now);
    return { full: used >= cap, used, cap, msg: `Номеров максимум ${cap} (сколько у тебя машин + ${PLATE_LIMIT_EXTRA}${R.vipOn(S, now) ? ` + ${VIP.plates} VIP` : ''}) — продай лишние номера или добавь машин` };
  };
  A.openPlateCase = (S, p, ctx) => {
    const cs = R.PLATE_CASE_BY_ID[p.caseId] || fail('Нет такой генерации');
    if (R.plateRoom(S, ctx.now).full) fail(R.plateRoom(S, ctx.now).msg);
    const reg = p.region != null && p.region !== '' ? String(p.region) : null;
    if (reg && !R.plateRegionOk(cs, reg)) fail('Регион можно выбрать только в «Обычной» генерации');
    const price = reg ? R.plateRegionPrice(reg) : R.plateCasePrice(cs);
    if (S.money < price) fail('Не хватает денег');
    S.money -= price;
    const key = reg ? genPlateIn(ctx.rnd, cs, reg, plateTaken(S, ctx))
      : R.genPlate(ctx.rnd, wpick(ctx.rnd, R.plateDrops(cs)), plateTaken(S, ctx), cs.minValue || 0);
    S.plates.push(key);
    S.stats.plates = (S.stats.plates || 0) + 1;
    addGrindXp(S, XP.partCase, ctx);
    return { plate: key };
  };

  A.sellPlate = (S, p, ctx) => {
    if (!S.plates.includes(p.plate)) fail('У тебя нет такого номера');
    R.settleIncome(S, ctx.now);
    plateCars(S).forEach(c => { if (c.plate === p.plate) delete c.plate; });
    S.plates = S.plates.filter(k => k !== p.plate);
    const value = R.plateInfo(p.plate).value;
    S.money += value;
    S.pending = Math.min(S.pending, R.pendingCap(S));
    return { value };
  };

  const findPlateCar = (S, uid) => plateCars(S).find(c => c.uid === uid) || fail('Машина не найдена');   // гараж или витрина
  A.setPlate = (S, p, ctx) => {
    if (!S.plates.includes(p.plate)) fail('У тебя нет такого номера');
    const car = findPlateCar(S, p.uid);
    R.settleIncome(S, ctx.now);
    plateCars(S).forEach(c => { if (c.plate === p.plate) delete c.plate; });
    car.plate = p.plate;
    return {};
  };

  A.removePlate = (S, p, ctx) => {
    const car = findPlateCar(S, p.uid);
    if (!car.plate) fail('На машине нет номера');
    R.settleIncome(S, ctx.now);
    delete car.plate;
    S.pending = Math.min(S.pending, R.pendingCap(S));
    return {};
  };

  // снять все детали с машины — на склад
  A.uninstallAll = (S, p, ctx) => {
    const car = findCar(S, p.uid);
    const slots = Object.keys(car.parts);
    if (!slots.length) fail('На машине нет деталей');
    R.settleIncome(S, ctx.now);
    for (const slot of slots) {
      R.invAdd(S, slot, car.parts[slot]);
      lockPart(S, slot, car.parts[slot], ctx.now);
      car.slotCd = { ...car.slotCd, [slot]: ctx.now + R.partCdMs(S, ctx.now) };
    }
    car.parts = {};
    S.pending = Math.min(S.pending, R.pendingCap(S));
    return { n: slots.length };
  };

  // шанс слияния; в обновлении — с прибавкой за прошлые неудачи этого уровня
  R.mergeChance = (S, t) => R.nextActive()
    ? Math.min(100, MERGE_NEXT.chance[t] + MERGE_NEXT.pity * (S.mergePity?.[t] || 0)) : MERGE_CHANCE[t];
  A.merge = (S, p, ctx) => {
    validPart(p.slot, p.t);
    if (p.t === 'S') fail('Elite — максимальный уровень');
    if (R.invCount(S, p.slot, p.t) < 3) fail('Нужно 3 одинаковые детали');
    if (R.invFree(S, p.slot, p.t, ctx.now) < 3) fail('Недавно снятые детали остывают — сливать их пока нельзя');
    const next = RARITY_ORDER[R.tierIdx(p.t) + 1];
    const chance = R.mergeChance(S, p.t);
    const ok = ctx.rnd() * 100 < chance;
    R.invAdd(S, p.slot, p.t, -3);
    if (ok) R.invAdd(S, p.slot, next);
    let kept = 0;
    if (R.nextActive()) {
      S.mergePity = S.mergePity || {};
      if (ok) delete S.mergePity[p.t];
      else { S.mergePity[p.t] = (S.mergePity[p.t] || 0) + 1; kept = MERGE_NEXT.keep; R.invAdd(S, p.slot, p.t, kept); }
    }
    S.stats.merged++;
    addGrindXp(S, XP.merge, ctx);
    return { ok, next, chance, kept };
  };

  // ---------- магазин (Telegram Stars) ----------
  // Звёзды списывает Telegram: на сервере покупку выдаёт только оплата (ctx.paid),
  // в браузерной тестовой версии (ctx.local) оплата имитируется.
  // сколько ₽ даёт пакет; с релизом — по уровню игрока: 1 ур. = from × moneyNext … SHOP.packLevel.max ур. = moneyNext (округление до 10 тыс)
  R.packMoney = (pk, S) => {
    if (!R.nextActive()) return pk.money;
    const full = pk.moneyNext ?? pk.money, { from, max } = SHOP.packLevel;
    const L = Math.min(max, Math.max(1, S?.level || 1));
    return Math.round(full * (from + (1 - from) * (L - 1) / (max - 1)) / 1e4) * 1e4;
  };
  const evItem = id => { const cs = String(id).startsWith('ev:') && R.caseById(id.slice(3)); return cs && cs.event && R.casePay(cs) !== 'rub' && cs.stars ? cs : null; };
  // места (гараж, номера) дорожают с каждой покупкой в сезоне: S.shopN (сбрасывается в новом сезоне — не в «вечном»)
  const growK = (S, id) => Math.pow(SHOP.slotGrowth, S?.shopN?.[id] || 0);
  R.shopStars = (id, S) => evItem(id)?.stars || (SHOP.packs.find(x => x.id === id) || {}).stars
    || { pass: PASS.stars, refuel: SHOP.refuel, cool: SHOP.cool, slot: SHOP.slot * growK(S, 'slot'), plateSlot: SHOP.plateSlot * growK(S, 'plateSlot'),
      vip: SHOP.vip.stars, starter: SHOP.starter.stars }[id] || 0;
  // перезарядка пакетов ₽ (с релизом): сколько ещё ждать
  R.shopCdLeft = (S, id, now) => {
    const ms = R.nextActive() && SHOP.packs.find(x => x.id === id)?.cdMs;
    return ms ? Math.max(0, (S.shopCd?.[id] || 0) + ms - now) : 0;
  };
  R.vipDailyReady = (S, now) => R.vipOn(S, now) && S.vipGift !== R.dayKey(now);
  const addVip = (S, days, now) => { S.vipUntil = Math.max(S.vipUntil || 0, now) + days * 86400e3; };
  A.shopBuy = (S, p, ctx) => {
    const id = p.item;
    const price = R.shopStars(id, S);
    if (!price) fail('Нет такого товара');
    // перезарядка: проверяем до оплаты (ctx.precheck — проверка перед окном Telegram); уже оплаченное выдаём всегда
    const cd = R.shopCdLeft(S, id, ctx.now);
    if (cd > 0 && (!ctx.paid || ctx.precheck)) fail(`Этот пакет можно купить через ${R.fmtLeft(cd)}`);
    // оплата звёздами с игрового баланса (призы сезона) — или настоящими Telegram Stars (ctx.paid)
    if (p.useStars) {
      if (!nextRules(ctx)) fail('Недоступно');
      if ((S.stars || 0) < price) fail('Не хватает звёзд');
      if (id === 'starter' && S.starterPack) fail('Стартовый набор уже куплен');
      S.stars -= price;
    } else if (!ctx.local && !ctx.paid) fail('Оплата не прошла');
    if (SHOP.packs.find(x => x.id === id)?.cdMs && R.nextActive()) S.shopCd = { ...(S.shopCd || {}), [id]: ctx.now };
    if ((id === 'slot' || id === 'plateSlot') && R.nextActive()) S.shopN = { ...(S.shopN || {}), [id]: (S.shopN?.[id] || 0) + 1 };
    const ev = evItem(id);
    if (ev) {   // открытие временного кейса — подарком: «Прокрутить бесплатно» на экране кейса
      if (!R.caseOn(ev, ctx.now)) fail('Временный кейс закончился');
      S.gifts = [...(S.gifts || []), { id: ctx.uid(), kind: 'car', caseId: ev.id, n: 1, note: `Оплачено ⭐ ${ev.stars}`, cars: ev.cars, name: ev.name, icon: ev.icon }];
      return { gift: ev.id };
    }
    const pk = SHOP.packs.find(x => x.id === id);
    if (pk) { const m = R.packMoney(pk, S); S.money += m; return { items: [{ kind: 'money', amount: m }] }; }
    if (id === 'refuel') { refuel(S); return { items: [{ kind: 'fuel' }] }; }
    if (id === 'cool') {
      S.invLock = [];
      [...S.cars, ...S.museum].forEach(c => { delete c.slotCd; });
      S.partCaseAt = 0;
      return { cool: true };
    }
    if (id === 'slot') {
      if (S.slots >= GARAGE.maxSlots) fail('Гараж максимального размера');
      S.slots++;
      S.starSlots = (S.starSlots || 0) + 1;   // места за звёзды остаются в новом сезоне
      return { items: [{ kind: 'slots', n: 1 }] };
    }
    if (id === 'plateSlot') {
      if (!nextRules(ctx)) fail('Недоступно');
      if ((S.plateSlots || 0) >= PLATE_STORE.max) fail('Мест для номеров максимум');
      S.plateSlots = (S.plateSlots || 0) + 1;   // остаются в новом сезоне
      return { plateSlot: S.plateSlots };
    }
    if (id === 'pass') {
      if (!R.passOn()) fail('Недоступно');
      if (R.passPremOn(S, ctx.now)) fail('Пропуск уже куплен в этом сезоне');
      S.passPrem = R.seasonId(ctx.now, S);
      // премиум за уже забранные уровни — сразу (незабранные получат премиум при «Забрать»)
      const items = [], pend = new Set(S.passPending || []);
      for (let L = 2; L <= Math.min(S.level, PASS.levels); L++) if (!pend.has(L)) items.push(...grant(S, passPrem(L), ctx));
      return { items, pass: true };
    }
    if (id === 'vip') { addVip(S, SHOP.vip.days, ctx.now); return { vip: SHOP.vip.days }; }
    if (id === 'starter') {
      if (S.starterPack) fail('Стартовый набор уже куплен');
      S.starterPack = true;
      const st = SHOP.starter;
      addVip(S, st.vipDays, ctx.now);
      const items = grant(S, { money: st.money, slots: st.slots }, ctx);
      items.push(...grant(S, { cars: st.cars }, ctx));
      return { items, vip: st.vipDays };
    }
  };
  A.vipDaily = (S, p, ctx) => {
    if (!R.vipOn(S, ctx.now)) fail('Нет VIP');
    if (!R.vipDailyReady(S, ctx.now)) fail('Подарок VIP уже получен сегодня');
    S.vipGift = R.dayKey(ctx.now);
    S.money += VIP.daily;
    return { items: [{ kind: 'money', amount: VIP.daily }] };
  };

  // ---------- торговая площадка ----------
  // Лот: { id, kind: 'car'|'part'|'plate', car | slot,t,n | plate, price, value, at, until }.
  // Пока вещь выставлена, её нет в гараже/на складе. Покупку между игроками проводит сервер;
  // в браузерной тестовой версии (ctx.local) покупатели — боты (botAt — когда бот купит лот).
  R.lotValue = l => l.kind === 'car' ? R.carValue(l.car) : l.kind === 'part' ? PART_TIERS[l.t].price * l.n : R.plateInfo(l.plate).value;
  R.lotRange = value => [Math.ceil(value * MARKET.minK), Math.floor(value * MARKET.maxK)];
  R.marketLimit = (S, now) => R.vipOn(S, now) ? MARKET.vipLots : MARKET.lots;
  R.lotGot = price => price - Math.ceil(price * MARKET.feeK);   // продавцу после комиссии
  const marketLog = (S, e) => { S.marketLog.unshift(e); S.marketLog.length = Math.min(S.marketLog.length, MARKET.log); };
  // боты покупают тем быстрее, чем дешевле цена относительно стоимости: 100% — минуты, 300% — почти никогда
  const botDelay = (k, rnd) => -Math.log(1 - rnd() * 0.999) * 4 * 60e3 * Math.exp(3.2 * (k - 1));

  A.marketList = (S, p, ctx) => {
    if (!nextRules(ctx)) fail('Недоступно');
    const active = S.lots.filter(l => l.until > ctx.now).length;
    if (active >= R.marketLimit(S, ctx.now)) fail(`Можно держать максимум ${R.marketLimit(S, ctx.now)} лотов`);
    if (S.lots.length >= MARKET.vipLots + 10) fail('Забери сначала вещи из завершённых лотов');
    // сначала все проверки, потом изменения (ошибка не должна оставить вещь «нигде»)
    const lot = { id: ctx.uid(), kind: p.kind, at: ctx.now, until: ctx.now + MARKET.ttlMs };
    let car = null;
    if (p.kind === 'car') {
      car = findCar(S, p.uid);
      if (CAR(car.id).secret && !car.cont) fail('Эту секретную машину продать нельзя — только машины из контейнеров');
      if (S.race?.uid === car.uid) fail('Машина сейчас в гонке');
      lot.car = car;
    } else if (p.kind === 'part') {
      const n = Math.max(1, Math.floor(p.n) || 1);
      if (!PART_TIERS[p.t] || !R.SLOT_BY_ID[p.slot]) fail('Нет такой детали');
      if (R.invFree(S, p.slot, p.t, ctx.now) < n) fail('Столько свободных деталей нет (остывающие нельзя продать)');
      Object.assign(lot, { slot: p.slot, t: p.t, n });
    } else if (p.kind === 'plate') {
      if (!S.plates.includes(p.plate)) fail('Нет такого номера');
      if (plateCars(S).some(c => c.plate === p.plate)) fail('Номер на машине — сними его или продай вместе с машиной');
      lot.plate = p.plate;
    } else fail('Нельзя выставить');
    lot.value = R.lotValue(lot);
    const [lo, hi] = R.lotRange(lot.value);
    lot.price = Math.round(+p.price);
    if (!(lot.price >= lo && lot.price <= hi)) fail(`Цена — от ${lo} до ${hi} ₽`);
    // аукцион: price — стартовая цена, buyout — «купить сразу» (по желанию), свой срок
    if (p.auc) {
      if (!nextRules(ctx)) fail('Недоступно');
      const hours = MARKET_AUC.hours.includes(+p.auc.hours) ? +p.auc.hours : MARKET_AUC.hours[0];
      const buyout = p.auc.buyout ? Math.round(+p.auc.buyout) : null;
      if (buyout != null && !(buyout > lot.price && buyout <= hi)) fail(`«Купить сразу» — дороже стартовой и не больше ${hi} ₽`);
      lot.until = ctx.now + hours * 3600e3;
      lot.auc = { start: lot.price, buyout, bid: 0, bids: 0, bidder: null, hours };
      if (ctx.local) {   // тест: сколько готовы дать боты и когда первая ставка
        lot.auc.botMax = Math.round(lot.value * (0.55 + ctx.rnd() * 0.85));
        lot.auc.nextAt = ctx.now + Math.round(hours * 3600e3 * (0.03 + ctx.rnd() * 0.15));
      }
    }
    if (car) {
      keepLast(S);
      removeCar(S, car.uid, ctx);
      if (car.plate) S.plates = S.plates.filter(k => k !== car.plate);   // номер уходит вместе с машиной
      delete car.fuel; delete car.fuelTs; delete car.slotCd;
    } else if (lot.kind === 'part') R.invAdd(S, lot.slot, lot.t, -lot.n);
    else S.plates = S.plates.filter(k => k !== lot.plate);
    S.stats.marketLists = (S.stats.marketLists || 0) + 1;
    if (ctx.local && !lot.auc) {
      const at = ctx.now + botDelay(lot.price / lot.value, ctx.rnd);
      if (at < lot.until) lot.botAt = Math.round(at);
    }
    S.lots.push(lot);
    return { lot };
  };

  // снять лот (или забрать вещь из лота, который не продался)
  A.marketCancel = (S, p, ctx) => {
    const lot = S.lots.find(l => l.id === p.id) || fail('Лот не найден');
    if (lot.auc?.bids && lot.until > ctx.now) fail('На лот уже есть ставки — снять нельзя');
    let waiting = false;
    if (lot.kind === 'car') {
      waiting = placeCar(S, lot.car, ctx);
      if (lot.car.plate) S.plates.push(lot.car.plate);
    } else if (lot.kind === 'part') R.invAdd(S, lot.slot, lot.t, lot.n);
    else S.plates.push(lot.plate);
    S.lots = S.lots.filter(l => l !== lot);
    return { waiting };
  };

  // лот купили: продавцу деньги за вычетом комиссии (сервер вызывает через R.lotSold)
  const lotSold = R.lotSold = (S, lot, buyer, now) => {
    const got = R.lotGot(lot.price);
    S.money += got;
    S.lots = S.lots.filter(l => l !== lot);
    marketLog(S, { side: 'sell', kind: lot.kind, car: lot.car && { id: lot.car.id, plate: lot.car.plate }, slot: lot.slot, t: lot.t, n: lot.n, plate: lot.plate, price: lot.price, got, buyer, at: now });
    return { id: lot.id, got };
  };
  // тестовая версия: боты покупают мои лоты, когда подошло их время
  R.marketBots = (S, now) => {
    const sold = [];
    for (const lot of [...S.lots]) {
      if (lot.auc) { const r = R.aucLotStep(S, lot, now); if (r) sold.push({ ...r, lot }); continue; }
      if (lot.botAt && lot.botAt <= now && lot.until > now) sold.push({ ...lotSold(S, lot, 'bot', lot.botAt), lot });
    }
    return sold;
  };
  // аукцион моего лота (тест): боты ставят до botMax, могут «купить сразу»; по окончании — продано лучшей ставке
  const hrnd = (str, n) => { let h = 2166136261; for (const ch of str + ':' + n) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
  R.lotAucNext = a => a.bids ? Math.ceil(a.bid * (1 + MARKET_AUC.stepK) / 1000) * 1000 : a.start;
  R.aucLotStep = (S, lot, now) => {
    const a = lot.auc;
    while (a.nextAt && a.nextAt <= now && a.nextAt < lot.until) {
      const t = a.nextAt, next = R.lotAucNext(a);
      if (a.buyout && a.botMax >= a.buyout && hrnd(lot.id, a.bids + 99) < 0.5) {   // бот выкупил сразу
        a.bid = a.buyout; a.bids++; a.bidder = BOT_NAMES[Math.floor(hrnd(lot.id, a.bids) * BOT_NAMES.length)];
        lot.price = a.bid;
        return lotSold(S, lot, a.bidder, t);
      }
      if (next > a.botMax) { a.nextAt = 0; break; }
      a.bid = next; a.bids++; a.bidder = BOT_NAMES[Math.floor(hrnd(lot.id, a.bids) * BOT_NAMES.length)];
      if (lot.until - t < MARKET_AUC.extendMs) lot.until = t + MARKET_AUC.extendMs;
      a.nextAt = t + Math.round(a.hours * 3600e3 * (0.04 + hrnd(lot.id, a.bids + 7) * 0.2));
    }
    if (now >= lot.until && a.bids) { lot.price = a.bid; return lotSold(S, lot, a.bidder, lot.until); }
    return null;
  };
  A.marketTick = (S, p, ctx) => ({ sold: ctx.local ? R.marketBots(S, ctx.now) : [] });

  // тестовая версия: купить лот бота (лоты ботов придумывает браузер)
  // сервер: ctx.mkLot — лот из общей таблицы, ctx.mkPrice — цена, ctx.mkPrepaid — деньги уже заморожены ставкой
  A.marketBuyLocal = (S, p, ctx) => {
    if (!ctx.local && !ctx.mkLot) fail('Недоступно');
    const l = ctx.mkLot || p.lot || fail('Лот не найден');
    const prepaid = ctx.mkLot ? !!ctx.mkPrepaid : !!p.prepaid;
    const price = Math.round(+(ctx.mkLot ? ctx.mkPrice : prepaid ? p.price : l.price));
    let waiting = false;
    if (!(price > 0)) fail('Лот не найден');
    if (!prepaid && S.money < price) fail('Не хватает денег');
    if (l.kind === 'car') {
      if (!CAR(l.car?.id) || (CAR(l.car.id).secret && !(ctx.mkLot && l.car.cont))) fail('Лот не найден');
      if (l.car.plate && (S.plates.includes(l.car.plate) || !R.plateParse(l.car.plate))) fail('Лот не найден');
      const car = { uid: ctx.uid(), id: l.car.id, got: ctx.now,
        parts: Object.fromEntries(Object.entries(l.car.parts || {}).filter(([sl, t]) => R.SLOT_BY_ID[sl] && PART_TIERS[t])) };
      if (ctx.mkLot) {   // настоящая машина игрока: покраска, контейнер, цена выигрыша — переходят покупателю
        if (l.car.paint) car.paint = l.car.paint;
        if (l.car.cont) car.cont = l.car.cont;
        if (l.car.paid) car.paid = l.car.paid;
      }
      if (l.car.plate) { car.plate = l.car.plate; S.plates.push(car.plate); }
      waiting = placeCar(S, car, ctx);
      // купленная у игрока машина в коллекцию не засчитывается (19.10): коллекцию надо выбить — кейсы, награды, промокоды
    } else if (l.kind === 'part') {
      if (!PART_TIERS[l.t] || !R.SLOT_BY_ID[l.slot]) fail('Лот не найден');
      R.invAdd(S, l.slot, l.t, Math.max(1, Math.floor(l.n) || 1));
    } else if (l.kind === 'plate') {
      if (!R.plateParse(l.plate) || S.plates.includes(l.plate)) fail('Лот не найден');
      if (R.plateRoom(S, ctx.now).full) fail(R.plateRoom(S, ctx.now).msg);
      S.plates.push(l.plate);
    } else fail('Лот не найден');
    if (!prepaid) S.money -= price;   // аукцион: ставка уже списана (заморожена)
    if (ctx.mkLot && S.mkBids) delete S.mkBids[l.id];
    marketLog(S, { side: 'buy', kind: l.kind, car: l.car && { id: l.car.id, plate: l.car.plate }, slot: l.slot, t: l.t, n: l.n, plate: l.plate, price, seller: String(l.seller || '').slice(0, 32), at: ctx.now });
    return { waiting };
  };

  // сервер: ставка на аукцион игрока — деньги замораживаются (S.mkBids: лот → ставка), перебили — вернёт сервер
  A.marketBidHold = (S, p, ctx) => {
    const b = ctx.mkBid || fail('Недоступно');
    if (!nextRules(ctx)) fail('Недоступно');
    const had = S.mkBids?.[b.id] || 0;   // своя прошлая ставка на этот лот (если перебили — уже вернулась)
    if (S.money + had < b.amount) fail('Не хватает денег на ставку');
    S.money -= b.amount - had;
    S.mkBids = { ...(S.mkBids || {}), [b.id]: b.amount };
    return { bid: b.amount };
  };
  R.mkBidRelease = (S, id) => {
    const v = S.mkBids?.[id];
    if (!v) return 0;
    S.money += v;
    delete S.mkBids[id];
    return v;
  };

  // ---------- контейнеры (аукционы) ----------
  // Сами аукционы общие для всех игроков — их ведёт сервер. В браузерной тестовой версии (ctx.local)
  // аукционы и боты живут в браузере, а здесь только деньги ставки и выдача машины.
  R.aucNext = price => Math.ceil(price * (1 + AUCTION.stepK) / AUCTION.round) * AUCTION.round;
  A.aucBid = (S, p, ctx) => {
    if (!ctx.local) fail('Недоступно');
    const amount = Math.round(+p.amount), refund = Math.max(0, Math.round(+p.refund) || 0);
    if (!(amount > 0)) fail('Неверная ставка');
    if (S.money + refund < amount) fail('Не хватает денег');
    S.money += refund - amount;     // прошлая своя ставка возвращается, новая замораживается
    return { amount };
  };
  A.aucRefund = (S, p, ctx) => {
    if (!ctx.local) fail('Недоступно');
    S.money += Math.max(0, Math.round(+p.amount) || 0);
    return {};
  };
  A.aucWin = (S, p, ctx) => {
    if (!ctx.local) fail('Недоступно');
    const d = CAR(p.carId);
    if (!d || !d.secret) fail('Нет такой машины');
    const car = { uid: ctx.uid(), id: d.id, got: ctx.now, parts: {}, cont: true };
    if (d.excl) car.paid = Math.max(1, Math.floor(+p.price) || d.price);   // стоимость = цена выигрыша
    const waiting = placeCar(S, car, ctx);
    const isNew = !S.discovered.includes(d.id);
    if (isNew) S.discovered.push(d.id);
    return { uid: car.uid, isNew, waiting };
  };

  // сервер: ставка на контейнер замораживается (S.contBids), перебили — вернёт сервер (R.contBidRelease);
  // выиграл — сервер кладёт контейнер в S.contWon, игрок открывает его (contOpen) — машина в гараж
  A.contBidHold = (S, p, ctx) => {
    const b = ctx.contBid || fail('Недоступно');
    if (!nextRules(ctx)) fail('Недоступно');
    if ((S.level || 1) < AUCTION.minLevel) fail(`Ставки на контейнеры — с ${AUCTION.minLevel} уровня`);
    if (S.money < b.amount) fail('Не хватает денег на ставку');
    S.money -= b.amount;
    S.contBids = { ...(S.contBids || {}), [b.id]: b.amount };
    return { bid: b.amount };
  };
  R.contBidRelease = (S, id) => {
    const v = S.contBids?.[id];
    if (!v) return 0;
    S.money += v;
    delete S.contBids[id];
    return v;
  };
  A.contOpen = (S, p, ctx) => {
    const w = (S.contWon || []).find(x => x.id === p.id) || fail('Контейнер не найден');
    const d = CAR(w.carId) || fail('Нет такой машины');
    const car = { uid: ctx.uid(), id: d.id, got: ctx.now, parts: {}, cont: true };
    if (d.excl) car.paid = Math.max(1, w.price);   // стоимость эксклюзива = цена выигрыша
    const waiting = placeCar(S, car, ctx);
    const isNew = !S.discovered.includes(d.id);
    if (isNew) S.discovered.push(d.id);
    S.contWon = S.contWon.filter(x => x !== w);
    return { uid: car.uid, carId: d.id, isNew, waiting };
  };

  // награда донатеру по уровню DONOR_TIERS (сервер, кнопка в админ-боте): один раз — S.founder
  // ТОЛЬКО тестовая версия: убрать новые обычные машины (NEXT_CARS) из гаража, витрины и коллекции — проверять их выпадение из кейсов
  A.testRemoveNew = (S, p, ctx) => {
    if (!ctx.local || !R.nextActive()) fail('Только в тестовой версии');
    const ids = new Set(NEXT_CARS.map(c => c.id)), n = [...S.cars, ...S.museum, ...(S.waiting || [])].filter(c => ids.has(c.id)).length;
    R.settleIncome(S, ctx.now);
    S.cars = S.cars.filter(c => !ids.has(c.id)); S.museum = S.museum.filter(c => !ids.has(c.id)); S.waiting = (S.waiting || []).filter(c => !ids.has(c.id));
    S.discovered = S.discovered.filter(id => !ids.has(id));
    S.pending = Math.min(S.pending, R.pendingCap(S));
    return { removed: n };
  };
  // ТОЛЬКО тестовая версия (локальный режим): машины обновления — эксклюзивы, машины сезона, бета-машина, SLR основателей.
  // Места в гараже добавляются (до максимума), что не влезло — на витрину. На сервере не работает (нет ctx.local).
  A.testAllCars = (S, p, ctx) => {
    if (!ctx.local || !R.nextActive()) fail('Только в тестовой версии');
    const owned = new Set([...S.cars, ...S.museum].map(c => c.id));
    const list = [...EXCL_CARS, ...PASS_CARS].filter(d => !owned.has(d.id));   // новые обычные машины — не выдаём (выбиваются из кейсов)
    S.slots = Math.min(GARAGE.maxSlots, Math.max(S.slots, R.slotCars(S) + list.length));
    let garage = 0, museum = 0;
    for (const d of list) {
      const extra = d.excl ? { cont: true, paid: d.price } : {};
      if (R.slotCars(S) < S.slots) { Object.assign(addCar(S, d.id, ctx).car, extra); garage++; continue; }
      if (S.museum.length >= S.museumSlots && S.museumSlots < MUSEUM.maxSlots) S.museumSlots++;
      if (S.museum.length < S.museumSlots) {
        S.museum.push({ uid: ctx.uid(), id: d.id, got: ctx.now, parts: {}, ...extra });
        if (!S.discovered.includes(d.id)) S.discovered.push(d.id);
        museum++;
      }
    }
    const perm = [];
    if (BETA_CAR && !owned.has(BETA_CAR.id)) { S.cars.push({ uid: ctx.uid(), id: BETA_CAR.id, got: ctx.now, parts: {}, lv: S.level || 1 }); perm.push(BETA_CAR.id); }
    if (DONOR_CAR && !owned.has(DONOR_CAR.id)) { S.cars.push({ uid: ctx.uid(), id: DONOR_CAR.id, got: ctx.now, parts: {}, lv: S.level || 1, skin: 'gold' }); perm.push(DONOR_CAR.id); }
    for (const d of NAMED_CARS) if (!owned.has(d.id)) { S.cars.push({ uid: ctx.uid(), id: d.id, got: ctx.now, parts: {}, lv: S.level || 1 }); perm.push(d.id); }
    S.betaChecked = true;
    return { garage, museum, perm: perm.length, total: garage + museum + perm.length };
  };

  // награда за бету (amb / champ) за место place — один раз на вид; плашка навсегда (S.awards)
  R.applyAward = (S, kind, place, ctx) => {
    R.rollSeason(S, ctx.now, ctx);   // игрок не заходил после релиза — сначала общий сброс, иначе призы сгорят при входе
    const a = AWARDS[kind], pr = a?.places[place];
    if (!pr || (S.awards || []).some(x => x.k === kind)) return null;
    S.awards = [...(S.awards || []), { k: kind, p: place }];
    const got = [];
    if (pr.excl) {
      for (let i = 0; i < pr.excl; i++) {
        const d = EXCL_CARS[Math.floor(ctx.rnd() * EXCL_CARS.length)];
        S.contWon = [...(S.contWon || []), { id: 'aw_' + ctx.uid(), n: '★', carId: d.id, price: d.price, color: '#d9822b', at: ctx.now }];
      }
      got.push('контейнер с эксклюзивом');
    }
    if (pr.stars) { S.stars = (S.stars || 0) + pr.stars; got.push(`${pr.stars} ⭐ на счёт`); }
    if (pr.vip) { addVip(S, pr.vip, ctx.now); got.push(`VIP ${pr.vip} дн`); }
    const title = `${a.name}${kind === 'champ' ? ` #${place}` : ''}`;
    S.notices = [...(S.notices || []), { id: ctx.uid(), kind: 'buy', icon: a.icon, title: `Награда: ${title}`, sub: `${got.join(', ')} · плашка навсегда`, at: ctx.now }];
    S.hist = [{ t: ctx.now, a: 'award', note: title }, ...(S.hist || [])].slice(0, 100);
    return { got };
  };

  R.applyDonor = (S, tierId, ctx) => {
    R.rollSeason(S, ctx.now, ctx);   // см. applyAward
    const t = DONOR_TIERS.find(x => x.id === tierId);
    if (!t || S.founder) return null;
    S.founder = t.id;
    const got = [];
    if (t.car && DONOR_CAR && !S.cars.some(c => CAR(c.id)?.named)) {   // у кого уже именная — SLR не нужна
      S.cars.push({ uid: ctx.uid(), id: DONOR_CAR.id, got: ctx.now, parts: {}, lv: S.level || 1, ...(t.car === 'gold' ? { skin: 'gold' } : {}) });
      got.push(`${DONOR_CAR.name}${t.car === 'gold' ? ' (золотая)' : ''}`);
    }
    if (t.excl) {   // эксклюзив — подарком-контейнером: игрок открывает сам (contOpen)
      for (let i = 0; i < t.excl; i++) {
        const d = EXCL_CARS[Math.floor(ctx.rnd() * EXCL_CARS.length)];
        S.contWon = [...(S.contWon || []), { id: 'don_' + ctx.uid(), n: '★', carId: d.id, price: d.price, color: '#d9822b', at: ctx.now }];
      }
      got.push('контейнер с эксклюзивом');
    }
    if (t.vip) { addVip(S, t.vip, ctx.now); got.push(`VIP ${t.vip} дн`); }
    if (t.pass && R.passOn()) { S.passPrem = R.seasonId(ctx.now, S); got.push('премиум-пропуск'); }
    if (t.gifts) {
      for (let i = 0; i < t.gifts.n; i++) S.gifts = [...(S.gifts || []), { id: ctx.uid(), kind: 'car', caseId: t.gifts.caseId, n: 1, note: 'Подарок основателю', at: ctx.now }];
      got.push(`${t.gifts.n} кейс${t.gifts.n > 1 ? 'а' : ''} «${R.CASE_BY_ID[t.gifts.caseId]?.name}»`);
    }
    S.notices = [...(S.notices || []), { id: ctx.uid(), kind: 'buy', icon: '👑', title: 'Спасибо, что поддержал игру!', sub: `${t.name}: ${got.join(', ')} · значок навсегда`, at: ctx.now }];
    S.hist = [{ t: ctx.now, a: 'donor', note: t.name }, ...(S.hist || [])].slice(0, 100);
    return { tier: t.id, got };
  };

  // «Ждут места»: забрать в гараж или продать
  A.waitTake = (S, p, ctx) => {
    const car = S.waiting.find(c => c.uid === p.uid) || fail('Машина не найдена');
    if (R.garageFull(S)) fail('В гараже нет места');
    S.waiting = S.waiting.filter(c => c !== car);
    placeCar(S, car, ctx);
    return {};
  };
  A.waitSell = (S, p, ctx) => {
    const car = S.waiting.find(c => c.uid === p.uid) || fail('Машина не найдена');
    if (CAR(car.id).secret) fail('Секретную машину продать нельзя');
    const price = R.sellPrice(car);
    S.waiting = S.waiting.filter(c => c !== car);
    if (car.plate) S.plates = S.plates.filter(k => k !== car.plate);
    S.money += price;
    S.stats.carsSold++;
    return { price };
  };

  // ---------- подарки: кейс, подаренный админом ----------
  R.giftCase = gf => gf.kind === 'plate' ? R.PLATE_CASE_BY_ID[gf.caseId]
    : gf.kind === 'part' ? (PART_CASES.find(c => c.id === gf.caseId) && R.partCase(gf.caseId, gf.slot))
    : gf.cars ? (R.eventCases().find(c => c.id === gf.caseId) || { id: gf.caseId, event: true, kind: 'car', name: gf.name || 'Временный кейс', icon: gf.icon || '🎁', cars: gf.cars })
    : (R.CASE_BY_ID[gf.caseId]?.kind !== 'part' && R.caseOn(R.CASE_BY_ID[gf.caseId] || {}) && R.CASE_BY_ID[gf.caseId]);
  A.giftOpen = (S, p, ctx) => {
    const gf = (S.gifts || []).find(x => x.id === p.id) || fail('Подарок не найден');
    const out = { kind: gf.kind, caseId: gf.caseId };
    if (gf.kind === 'plate') {
      const cs = R.giftCase(gf);
      out.plate = R.genPlate(ctx.rnd, wpick(ctx.rnd, R.plateDrops(cs)), plateTaken(S, ctx), cs.minValue || 0);
      S.plates.push(out.plate);
    } else if (gf.kind === 'part') {
      const d = R.rollCase(R.giftCase(gf), ctx.rnd);
      R.invAdd(S, d.slot, d.t);
      Object.assign(out, { slot: d.slot, t: d.t });
    } else {
      if (R.garageFull(S) && !nextRules(ctx)) fail('Гараж заполнен — продай машину или купи место');
      const id = R.rollCase(R.giftCase(gf), ctx.rnd).id;
      const car = { uid: ctx.uid(), id, got: ctx.now, parts: {} };
      out.waiting = placeCar(S, car, ctx);
      out.isNew = !S.discovered.includes(id);
      if (out.isNew) { S.discovered.push(id); addXp(S, XP.newCar, ctx); }
      Object.assign(out, { id, uid: car.uid });
    }
    S.gifts = S.gifts.filter(x => x !== gf);
    return out;
  };

  // тестовая версия: «завершить сезон сейчас» с местом из тестового рейтинга. На сервере призы раздаёт расписание.
  A.seasonEndLocal = (S, p, ctx) => {
    if (!ctx.local) fail('Недоступно');
    const place = Math.max(0, Math.floor(+p.place) || 0);
    const old = S.season || R.seasonId(ctx.now, S);
    S.seasonShift = (S.seasonShift || 0) + 1;
    R.seasonReset(S, R.seasonId(ctx.now, S), ctx.now);
    return { result: R.applySeasonPrize(S, old, place, ctx) };
  };
  // приз сезона: звёзды, секретный кейс (подарком), значок; итог показывается игроку один раз
  R.applySeasonPrize = (S, season, place, ctx) => {
    const pr = R.seasonPrize(place);
    if (pr?.stars) S.stars = (S.stars || 0) + pr.stars;
    if (pr?.scase) {
      S.gifts = S.gifts || [];
      S.gifts.push({ id: ctx.uid(), kind: 'car', caseId: 'secret', note: `Приз сезона ${season}`, at: ctx.now });
    }
    if (pr) S.badges = [...(S.badges || []), { season, place }];
    S.seasonResult = { season, place, prize: pr, shown: false };
    return S.seasonResult;
  };
  A.seasonResultSeen = S => { if (S.seasonResult) S.seasonResult.shown = true; return {}; };

  A.buySlot = S => {
    if (S.slots >= GARAGE.maxSlots) fail('Гараж максимального размера');
    const price = R.slotPrice(S);
    if (S.money < price) fail('Не хватает денег');
    S.money -= price;
    S.slots++;
    S.boughtSlots++;
    return { price };
  };

  A.daily = (S, p, ctx) => {
    if (!R.dailyAvailable(S, ctx.now)) fail('Бонус уже получен сегодня');
    const day = R.dailyNextDay(S, ctx.now);
    S.daily = { streak: day, last: R.dayKey(ctx.now) };
    const items = grant(S, R.dailyList()[day - 1], ctx);
    addXp(S, XP.daily, ctx);
    return { day, items };
  };

  A.rewardCase = (S, p, ctx) => {
    if (!R.rewardCaseReady(S, ctx.now)) fail('Кейс наград ещё не готов');
    S.rewardCaseAt = ctx.now + REWARD_CASE.everyMs;
    const drop = R.weightedPick(REWARD_CASE.drops, x => x.w, ctx.rnd);
    let r;
    if (drop.kind === 'money') {
      const hours = 1 + ctx.rnd() * 2;
      r = { money: Math.max(REWARD_CASE.minMoney, Math.round(R.incomePerHour(S) * hours / 1000) * 1000) };
    } else if (drop.kind === 'part') r = { parts: { case: drop.case, n: 1 } };
    else if (drop.kind === 'fuel') r = { fuel: true };
    else r = { car: drop.case };
    return { items: grant(S, r, ctx) };
  };

  A.claimGoal = (S, p, ctx) => {
    const g = R.collectionGoals(S).find(x => x.id === p.id) || fail('Нет такой награды');
    if (!g.done) fail('Цель ещё не выполнена');
    if (g.claimed) fail('Награда уже получена');
    if (g.reward.secret && R.garageFull(S)) fail('Освободи место в гараже для секретной машины');
    S.claimed.push(g.id);
    return { title: g.title, items: grant(S, g.reward, ctx) };
  };

  A.paint = (S, p) => {
    const car = findCar(S, p.uid);
    if (!R.canPaintId(car.id)) fail('Эту машину пока нельзя перекрасить');
    if (!p.hex) { delete car.paint; return { price: 0 }; }
    if (!PAINTS.some(x => x.hex === p.hex)) fail('Нет такого цвета');
    if (car.paint === p.hex) fail('Этот цвет уже на машине');
    const price = R.paintPrice(car);
    if (S.money < price) fail('Не хватает денег');
    S.money -= price;
    car.paint = p.hex;
    S.stats.paints++;
    return { price };
  };

  A.museumIn = (S, p, ctx) => {
    const car = findCar(S, p.uid);
    if (R.isBeta(car)) fail('Эта машина живёт в гараже — на витрину её не убрать');
    if (R.museumFull(S)) fail('На витрине нет места');
    if (S.cars.length <= 1) fail('Последнюю машину нельзя убрать из гаража — на ней можно гонять и зарабатывать');
    removeCar(S, car.uid, ctx);
    S.museum.push(car);
    S.stats.museumIns++;
    return {};
  };

  A.museumOut = (S, p, ctx) => {
    const car = S.museum.find(c => c.uid === p.uid) || fail('Машина не найдена');
    if (R.garageFull(S)) fail('В гараже нет места');
    R.settleIncome(S, ctx.now);
    S.museum = S.museum.filter(c => c.uid !== p.uid);
    S.cars.push(car);
    return {};
  };

  A.museumBuy = S => {
    if (S.museumSlots >= MUSEUM.maxSlots) fail('Витрина максимального размера');
    const price = R.museumSlotPrice(S);
    if (S.money < price) fail('Не хватает денег');
    S.money -= price;
    S.museumSlots++;
    S.museumBought++;
    return { price };
  };

  // соперники для машины: генерируются один раз и меняются после каждой гонки
  A.raceOpps = (S, p, ctx) => {
    const car = findCar(S, p.uid);
    if (!S.raceOpps[car.uid]) S.raceOpps[car.uid] = R.genOpponents(car, ctx.rnd);
    return { opps: S.raceOpps[car.uid] };
  };

  // старт гонки: списываем взнос и топливо (если гонку бросить — взнос сгорит)
  // подработка (релиз): мини-игра «Мойка» — награда раз в JOB.cdMs (решает сервер; мини-игра — только экран)
  R.jobLeft = (S, now) => Math.max(0, (S.jobAt || 0) + JOB.cdMs - now);
  A.job = (S, p, ctx) => {
    if (!R.nextActive()) fail('Подработка появится с обновлением');
    const left = R.jobLeft(S, ctx.now);
    if (left > 0) fail(`Следующая подработка — через ${R.fmtLeft(left)}`);
    const m = Math.round((JOB.min + ctx.rnd() * (JOB.max - JOB.min)) / 500) * 500;
    S.money += m;
    S.jobAt = ctx.now;
    S.stats.jobs = (S.stats.jobs || 0) + 1;
    return { money: m };
  };

  A.raceStart = (S, p, ctx) => {
    const car = findCar(S, p.uid);
    const opps = S.raceOpps[car.uid] || fail('Соперники не найдены');
    const opp = opps[p.i] || fail('Соперник не найден');
    if (R.fuelNow(S, ctx.now, S) < 1) fail('Общий бак пуст');
    if (R.fuelNow(car, ctx.now, S) < 1) fail(`У этой машины пустой бак — +1 через ${R.fmtLeft(R.nextFuelMs(car, ctx.now, S))}`);
    const fee = R.raceFee(car, opp);
    if (S.money < fee) fail('Не хватает на взнос');
    S.money -= fee;
    spendFuel(S, ctx.now, S);
    spendFuel(car, ctx.now, S);
    S.stats.races++;
    S.race = { uid: car.uid, i: p.i, fee, at: ctx.now };
    return { fee };
  };

  // финиш: исход решает сервер; от игры — только реакция на старте
  // ---------- апгрейд (релизное обновление) ----------
  R.upgradeMult = chance => (1 - UPGRADE.edge) / (chance / 100);
  R.upgradeMaxBet = S => Math.floor(S.money * UPGRADE.maxBetK);
  A.upgrade = (S, p, ctx) => {
    if (!nextRules(ctx)) fail('Недоступно');
    const chance = Math.round(+p.chance * 10) / 10;
    if (!(chance >= UPGRADE.minChance && chance <= UPGRADE.maxChance)) fail(`Шанс — от ${UPGRADE.minChance} до ${UPGRADE.maxChance}%`);
    const bet = Math.floor(+p.bet);
    if (!(bet >= UPGRADE.minBet)) fail(`Ставка — от ${UPGRADE.minBet / 1000} тыс ₽`);
    if (bet > R.upgradeMaxBet(S)) fail('Ставка — не больше половины твоих денег');
    const roll = ctx.rnd() * 100;                   // где остановится стрелка: 0–100
    const win = roll < chance;
    const prize = win ? Math.floor(bet * R.upgradeMult(chance)) : 0;
    S.money += prize - bet;
    S.stats.upgrades = (S.stats.upgrades || 0) + 1;
    if (win) S.stats.upgradeWins = (S.stats.upgradeWins || 0) + 1;
    return { win, roll, chance, bet, prize };
  };

  // ---------- гонки с друзьями (релизное обновление; пока только тест: соперник — бот, ctx.local) ----------
  // S.duel — текущая гонка { id, opp: { id, name, carId, hp, paint }, uid, bet, role: 'from'|'to', status: 'wait'|'go', at, goAt,
  //   my?: мой заезд, oppRun?: заезд соперника, oppAt?: (тест) когда бот проедет }
  // Каждый едет свой заезд сам, в своё время (без задержек связи); итог — когда проехали оба (S.duelRes → островок).
  // Не проехали оба за DUEL.runMs — гонка отменяется, ставки возвращаются.
  // S.duelIn — входящий вызов, S.duelDay — попытки за день, S.duelLog — история
  R.duelUsed = (S, now) => S.duelDay?.day === R.dayKey(now) ? S.duelDay.n : 0;
  R.duelLeft = (S, now) => Math.max(0, DUEL.perDay - R.duelUsed(S, now));
  const duelUse = (S, now, d = 1) => { S.duelDay = { day: R.dayKey(now), n: R.duelUsed(S, now) + d }; };
  const duelOpp = o => {
    if (!o || !CAR(o.carId)) fail('Соперник не найден');
    return { id: String(o.id), name: String(o.name || 'Гонщик').slice(0, 32), carId: o.carId, hp: Math.max(1, Math.round(+o.hp) || CAR(o.carId).hp), paint: o.paint || null };
  };
  const duelBet = (S, bet) => {
    bet = Math.floor(+bet);
    if (!(bet >= DUEL.minBet)) fail(`Ставка — от ${DUEL.minBet / 1000} тыс ₽`);
    if (S.money < bet) fail('Не хватает денег на ставку');
    return bet;
  };
  // на сервере соперника (ctx.duelOpp) и id гонки (ctx.duelId) подставляет сервер — из игры их не подделать
  A.duelCreate = (S, p, ctx) => {
    if (!nextRules(ctx) || (!ctx.local && !ctx.duelOpp)) fail('Недоступно');
    if (S.duel) fail('Сначала закончи текущую гонку');
    if (R.duelLeft(S, ctx.now) < 1) fail('Попытки на сегодня закончились');
    const car = findCar(S, p.uid);
    const bet = duelBet(S, p.bet);
    S.money -= bet;
    duelUse(S, ctx.now);
    S.duel = { id: ctx.duelId || ctx.uid(), opp: ctx.local ? duelOpp(p.opp) : ctx.duelOpp, uid: car.uid, bet, role: 'from', status: 'wait', at: ctx.now };
    return { duel: S.duel };
  };
  // соперник принял вызов (тест: бот)
  // тест: бот проедет свой заезд через 15–90 с (иногда не проедет вовсе — тогда гонка отменится)
  const botRideAt = ctx => ctx.rnd() < 0.08 ? null : ctx.now + 15e3 + ctx.rnd() * 75e3;
  A.duelAcceptLocal = (S, p, ctx) => {
    if (!ctx.local) fail('Недоступно');
    if (S.duel?.status !== 'wait') fail('Нет вызова');
    S.duel.status = 'go'; S.duel.goAt = ctx.now; S.duel.oppAt = botRideAt(ctx);
    return {};
  };
  A.duelCancel = (S, p, ctx) => {
    if (S.duel?.status !== 'wait') fail('Гонку уже не отменить');
    S.money += S.duel.bet;
    duelUse(S, ctx.now, -1);
    S.duel = null;
    return {};
  };
  // входящий вызов (тест: от бота)
  A.duelIncomingLocal = (S, p, ctx) => {
    if (!ctx.local) fail('Недоступно');
    S.duelIn = { id: ctx.uid(), opp: duelOpp(p.opp), bet: Math.max(DUEL.minBet, Math.floor(+p.bet) || DUEL.minBet), at: ctx.now };
    return {};
  };
  A.duelDecline = S => { S.duelIn = null; return {}; };
  A.duelTake = (S, p, ctx) => {
    if (!nextRules(ctx)) fail('Недоступно');
    const inv = S.duelIn || fail('Вызов уже не актуален');
    if (ctx.now - inv.at > DUEL.acceptMs) { S.duelIn = null; fail('Вызов истёк'); }
    if (S.duel) fail('Сначала закончи текущую гонку');
    if (R.duelLeft(S, ctx.now) < 1) fail('Попытки на сегодня закончились');
    const car = findCar(S, p.uid);
    if (S.money < inv.bet) fail('Не хватает денег на ставку');
    S.money -= inv.bet;
    duelUse(S, ctx.now);
    S.duelIn = null;
    S.duel = { id: inv.id, opp: inv.opp, uid: car.uid, bet: inv.bet, role: 'to', status: 'go', at: ctx.now, goAt: ctx.now };
    if (ctx.local) S.duel.oppAt = botRideAt(ctx);
    return { duel: S.duel };
  };
  // старт: реакция → коэффициент (фальстарт — дисквалификация)
  const startOf = (falseStart, reaction) => falseStart ? { k: RACE.falseStartK, name: 'Фальстарт', dq: true }
    : RACE.starts.find(s => (Number.isFinite(reaction) ? Math.max(100, Math.round(reaction)) : Infinity) <= s.max);
  // заезд одного участника: старт → мощность на дистанции → время и скорость
  const duelRide = (hp, start, rnd, reaction) => {
    const P = hp * start.k * R.luckK(rnd);
    return { hp, start, P, T: R.quarterTime(P), V: R.trapSpeed(P), reaction: reaction ?? null, dq: !!start.dq };
  };
  // мой заезд — сразу, у себя; соперник его не видит, пока не проедет сам
  A.duelRun = (S, p, ctx) => {
    if (!nextRules(ctx)) fail('Недоступно');
    const d = S.duel || fail(S.duelRes?.refund ? 'Время вышло — ставка вернулась' : 'Гонка не найдена');
    if (d.status !== 'go') fail('Соперник ещё не принял вызов');
    if (d.my) fail('Ты уже проехал — ждём соперника');
    if (ctx.duelOppRun) d.oppRun = ctx.duelOppRun;   // сервер: соперник уже проехал (его время игрок не видел)
    const car = S.cars.find(c => c.uid === d.uid) || fail('Машина не найдена');
    const start = startOf(!!p.falseStart, p.reaction);
    d.my = duelRide(R.carHp(car), start, ctx.rnd, Number.isFinite(p.reaction) && !p.falseStart ? Math.round(p.reaction) : null);
    if (!start.dq && start.k === RACE.starts[0].k) S.stats.perfectStarts = (S.stats.perfectStarts || 0) + 1;
    R.duelSettle(S, ctx);
    return { my: d.my, done: !S.duel };
  };
  // итог: оба проехали → победитель забирает обе ставки; время вышло → ставки назад
  R.duelSettle = (S, ctx) => {
    const d = S.duel;
    if (d?.status === 'wait' && ctx.now > d.at + DUEL.acceptMs + 15e3) {   // друг не ответил на вызов
      S.money += d.bet;
      duelUse(S, ctx.now, -1);
      S.duelRes = { id: d.id, opp: d.opp, bet: d.bet, at: ctx.now, refund: true, noAnswer: true };
      S.duel = null;
      return;
    }
    if (!d || d.status !== 'go') return;
    if (ctx.local && d.oppAt && !d.oppRun && ctx.now >= d.oppAt) {   // тест: бот проехал свой заезд
      const st = ctx.rnd() < 0.05 ? startOf(true) : startOf(false, 120 + ctx.rnd() * 500);
      d.oppRun = duelRide(d.opp.hp, st, ctx.rnd);
    }
    const car = S.cars.find(c => c.uid === d.uid) || S.museum.find(c => c.uid === d.uid);
    const base = { id: d.id, opp: d.opp, bet: d.bet, carId: car?.id, paint: car?.paint || null, at: ctx.now };
    if (d.my && d.oppRun) {
      const my = d.my, op = d.oppRun;
      const both = my.dq && op.dq;   // оба фальстартовали — ничья, ставки назад
      const win = !my.dq && (op.dq || my.P > op.P);
      S.money += both ? d.bet : win ? d.bet * 2 : 0;
      S.stats.duels = (S.stats.duels || 0) + 1;
      if (win) S.stats.duelWins = (S.stats.duelWins || 0) + 1;
      S.duelRes = { ...base, win, draw: both, my, oppRun: op };
      S.duelLog = [{ at: ctx.now, name: d.opp.name, carId: d.opp.carId, win, draw: both, bet: d.bet, dq: my.dq, oppDq: op.dq }, ...(S.duelLog || [])].slice(0, DUEL.log);
      S.duel = null;
    } else if (ctx.now > d.goAt + DUEL.runMs) {
      S.money += d.bet;
      S.duelRes = { ...base, refund: true, iRan: !!d.my };
      S.duelLog = [{ at: ctx.now, name: d.opp.name, carId: d.opp.carId, refund: true, bet: d.bet }, ...(S.duelLog || [])].slice(0, DUEL.log);
      S.duel = null;
    }
  };
  A.duelTick = () => ({});              // проверить, не проехал ли соперник (итог считает duelSettle в R.run)
  A.duelResSeen = S => { S.duelRes = null; return {}; };
  // сервер: друг отказался / вызов сорвался — ставка назад вызывавшему
  R.duelRefundFrom = (S, id, now, why) => {
    const d = S.duel;
    if (d?.id !== id || d.status !== 'wait') return false;
    S.money += d.bet;
    duelUse(S, now, -1);
    S.duelRes = { id, opp: d.opp, bet: d.bet, at: now, refund: true, [why]: true };
    S.duel = null;
    return true;
  };

  A.raceFinish = (S, p, ctx) => {
    const r = S.race || fail('Гонка не начата');
    S.race = null;
    const car = S.cars.find(c => c.uid === r.uid) || fail('Машина не найдена');
    const opp = S.raceOpps[car.uid]?.[r.i] || fail('Соперник не найден');   // машину убирали на витрину во время гонки
    const falseStart = !!p.falseStart;
    const reaction = falseStart ? null : (Number.isFinite(p.reaction) ? Math.max(100, Math.round(p.reaction)) : Infinity);
    const start = falseStart ? { k: RACE.falseStartK, name: 'Фальстарт' } : RACE.starts.find(s => reaction <= s.max);
    const myP = R.carHp(car) * start.k * R.luckK(ctx.rnd);
    const botP = opp.hp * R.botStartK(ctx.rnd) * R.luckK(ctx.rnd);
    // релизное обновление: фальстарт — дисквалификация (сразу проигрыш, взнос сгорает, опыта нет)
    const dq = falseStart && nextRules(ctx);
    const win = !dq && myP > botP;
    const prize = R.racePrize(car, opp);
    if (win) { S.money += r.fee + prize; S.stats.wins++; }
    if (start.k === RACE.starts[0].k && !falseStart) S.stats.perfectStarts = (S.stats.perfectStarts || 0) + 1;
    if (!dq) addXp(S, XP.race + (win ? XP.win : 0), ctx);
    S.raceOpps[car.uid] = R.genOpponents(car, ctx.rnd);
    // журнал гонок (админка: последние RACE_LOG): машина, соперник, реакция, время, итог
    S.raceLog = [{ t: ctx.now, car: car.id, hp: R.carHp(car), opp: opp.name, oc: opp.carId, ohp: opp.hp, react: reaction === Infinity ? null : reaction,
      fs: falseStart, dq, win, T: +R.quarterTime(myP).toFixed(3), oT: +R.quarterTime(botP).toFixed(3), fee: r.fee, got: win ? r.fee + prize : 0 },
      ...(S.raceLog || [])].slice(0, 50);
    return {
      win, dq, opp, prize, fee: r.fee, start, reaction: reaction === Infinity ? null : reaction,
      myT: R.quarterTime(myP), botT: R.quarterTime(botP), myV: R.trapSpeed(myP), botV: R.trapSpeed(botP),
      fuel: R.fuelNow(S, ctx.now, S),
    };
  };

  // забрать награды пропуска за новые уровни (бесплатная дорожка + премиум, если куплен)
  A.passClaim = (S, p, ctx) => {
    const levels = S.passPending || [];
    if (!levels.length) fail('Нет наград');
    S.passPending = [];
    const items = [];
    for (const L of levels) {
      items.push(...grant(S, R.levelGift(L), ctx));
      if (R.passPremOn(S, ctx.now) && L <= PASS.levels) items.push(...grant(S, passPrem(L), ctx));
    }
    return { levels, items };
  };

  A.questClaim = (S, p, ctx) => {
    if (p.kind === 'weekly') {
      const wq = R.weeklyQuests(S, ctx.now).find(x => x.q.id === p.id) || fail('Нет такого задания');
      if (!wq.done) fail('Задание ещё не выполнено');
      if (wq.claimed) fail('Награда уже получена');
      S.wq.claimed.push(wq.q.id);
      const items = grant(S, wq.q.reward, ctx);
      addXp(S, WEEKLY_XP, ctx);
      return { title: wq.q.title, items, xp: WEEKLY_XP };
    }
    if (p.kind === 'dailyAll') {
      if (!R.dailyAllReady(S, ctx.now)) fail('Сначала выполни все задания дня');
      S.dq.all = true;
      const items = grant(S, DAILY_ALL_BONUS, ctx);
      addXp(S, DAILY_ALL_BONUS.xp, ctx);
      return { title: 'Все задания дня', items, xp: DAILY_ALL_BONUS.xp };
    }
    if (p.kind === 'newbie') {
      const nq = R.newbieQuest(S) || fail('Задания новичка пройдены');
      if (!nq.done) fail('Задание ещё не выполнено');
      S.quest++;
      const items = grant(S, { money: nq.q.money }, ctx);
      addXp(S, nq.q.xp, ctx);
      return { title: nq.q.title, items, xp: nq.q.xp };
    }
    if (!R.questsAvailable(S)) fail('Сначала пройди задания новичка');
    const dq = R.dailyQuests(S, ctx.now).find(x => x.q.id === p.id) || fail('Нет такого задания');
    if (!dq.done) fail('Задание ещё не выполнено');
    if (dq.claimed) fail('Награда уже получена');
    S.dq.claimed.push(dq.q.id);
    const items = grant(S, { money: dq.money }, ctx);
    addXp(S, DAILY_QUEST_XP, ctx);
    return { title: dq.q.title, items, xp: DAILY_QUEST_XP };
  };

  // ---------- промокод: награду передаёт сервер (ctx.promo), из запроса игрока её взять нельзя ----------
  // награда: { money, xp, carId, parts: [{ slot, t, n }], fuel, rcase, slots }
  R.checkPromoReward = r => {
    if (!r || typeof r !== 'object') fail('Пустая награда');
    const out = {};
    if (r.money) out.money = Math.max(0, Math.min(1e10, Math.floor(+r.money || 0)));
    if (r.xp) out.xp = Math.max(0, Math.min(1e6, Math.floor(+r.xp || 0)));
    if (r.carId) { if (!R.CAR_BY_ID[r.carId]) fail('Нет такой машины'); out.carId = r.carId; }
    if (Array.isArray(r.parts) && r.parts.length) {
      out.parts = r.parts.slice(0, 16).map(x => {
        validPart(x.slot, x.t);
        return { slot: x.slot, t: x.t, n: Math.max(1, Math.min(100, x.n | 0)) };
      });
    }
    if (r.fuel) out.fuel = true;
    if (r.rcase) out.rcase = true;
    if (r.slots) out.slots = Math.max(1, Math.min(10, r.slots | 0));
    if (!Object.keys(out).length) fail('Выбери хотя бы одну награду');
    return out;
  };

  A.promo = (S, p, ctx) => {
    const r = ctx.promo;
    if (!r) fail('Промокоды работают только в Telegram');
    const items = [];
    if (r.carId && R.garageFull(S)) fail('Гараж заполнен — освободи место, чтобы получить машину');
    if (r.money) { S.money += r.money; items.push({ kind: 'money', amount: r.money }); }
    if (r.carId) {
      const { car, isNew } = addCar(S, r.carId, ctx);
      items.push({ kind: 'car', id: r.carId, uid: car.uid, isNew });
      if (isNew) addXp(S, XP.newCar, ctx);
    }
    if (r.parts) r.parts.forEach(x => { R.invAdd(S, x.slot, x.t, x.n); items.push({ kind: 'part', slot: x.slot, t: x.t, n: x.n }); });
    if (r.fuel) { refuel(S); items.push({ kind: 'fuel' }); }
    if (r.rcase) { S.rewardCaseAt = 0; items.push({ kind: 'rcase' }); }
    if (r.slots) { S.slots = Math.min(GARAGE.maxSlots, S.slots + r.slots); items.push({ kind: 'slots', n: r.slots }); }
    if (r.xp) { addXp(S, r.xp, ctx); items.push({ kind: 'xp', n: r.xp }); }
    return { items };
  };

  // ---------- админ-действия (сервер проверяет права) ----------
  A.admin = (S, p, ctx) => {
    if (!ctx.admin) fail('Нет доступа');
    switch (p.op) {
      case 'money': S.money = Math.max(0, p.set !== undefined ? Math.floor(p.set) : S.money + Math.floor(p.add || 0)); break;
      case 'namedCar': {   // именная машина топ-донатеру (сервер: только владелец) — вместо золотой SLR
        const d = CAR(p.carId);
        if (!d?.named) fail('Нет такой именной машины');
        if (S.cars.some(c => c.id === d.id)) fail('Эта машина у игрока уже есть');
        S.cars = S.cars.filter(c => !(DONOR_CAR && c.id === DONOR_CAR.id));
        S.cars.push({ uid: ctx.uid(), id: d.id, got: ctx.now, parts: {}, lv: S.level || 1 });
        if (!S.discovered.includes(d.id)) S.discovered.push(d.id);
        S.notices = [...(S.notices || []), { id: ctx.uid(), kind: 'car', carId: d.id, icon: '👑', title: 'Твоя именная машина!', sub: `${d.name} — уже в гараже, навсегда`, at: ctx.now }];
        break;
      }
      case 'car':
        if (!R.CAR_BY_ID[p.carId]) fail('Нет такой машины');
        if (R.garageFull(S)) fail('Гараж заполнен');
        { const { car } = addCar(S, p.carId, ctx); if (CAR(p.carId).excl) car.cont = true; }   // эксклюзивную можно продать на площадке, как из контейнера
        break;
      case 'collection': S.discovered = [...new Set([...S.discovered, ...R.baseCars().map(c => c.id)])]; break;
      case 'slots': S.slots = Math.min(GARAGE.maxSlots, S.slots + 5); break;
      case 'part': validPart(p.slot, p.t); R.invAdd(S, p.slot, p.t, Math.max(1, Math.min(100, p.n | 0))); break;
      case 'partsAll': R.allSlots().forEach(s => R.invAdd(S, s.id, 'S')); break;
      case 'fuel': refuel(S); break;
      case 'fuelAdd': {   // топливо в общий бак по одному — не больше полного
        const n = Math.max(1, Math.min(RACE.fuelMax, Math.floor(+p.n) || 1));
        const f = R.fuelNow(S, ctx.now, S), nf = Math.min(RACE.fuelMax, f + n);
        if (nf >= RACE.fuelMax) { delete S.fuel; delete S.fuelTs; }
        else { const rg = regenOf(S, ctx.now), prog = S.fuel === undefined ? 0 : (ctx.now - S.fuelTs) % rg; S.fuel = nf; S.fuelTs = ctx.now - prog; }
        return { added: nf - f, fuel: nf };
      }
      case 'cooldowns': S.invLock = []; S.partCaseAt = 0; [...S.cars, ...S.museum].forEach(c => delete c.slotCd); break;
      case 'rewardCase': S.rewardCaseAt = 0; break;
      case 'daily': if (S.daily.last === R.dayKey(ctx.now)) S.daily.last = R.dayKey(ctx.now - 86400e3); break;
      case 'day': S.daily = p.d <= 1 ? { streak: 0, last: null } : { streak: p.d - 1, last: R.dayKey(ctx.now - 86400e3) }; break;
      case 'income': S.pending = R.pendingCap(S); S.pendingTs = ctx.now; break;
      case 'xp': addXp(S, Math.max(0, Math.min(1e6, p.n | 0)), ctx); break;
      // номера: выдать конкретный / случайный нужной редкости, забрать
      case 'plateGive': {
        const info = R.plateInfo(p.plate) || fail('Такого номера не бывает');
        if (S.plates.includes(info.key)) fail('Этот номер уже у игрока');
        if (ctx.isPlateTaken?.(info.key)) fail('Номер занят у другого игрока');
        S.plates.push(info.key);
        return { plate: info.key };
      }
      case 'plateRandom': {
        if (!['D', 'C', 'B', 'A', 'S'].includes(p.r)) fail('Нет такой редкости');
        const key = R.genPlate(ctx.rnd, p.r, plateTaken(S, ctx));
        S.plates.push(key);
        return { plate: key };
      }
      // подарить кейс: машин (kind car), деталей (part) или генерацию номера (plate) — игрок откроет сам
      case 'giveCase': {
        R.giftCase(p) || fail('Нет такого кейса');
        const n = Math.max(1, Math.min(20, Math.floor(+p.n) || 1));
        const note = String(p.note || '').trim().slice(0, 80);
        S.gifts = S.gifts || [];
        for (let i = 0; i < n; i++) S.gifts.push({ id: ctx.uid(), kind: p.kind || 'car', caseId: p.caseId, slot: p.slot || undefined, note, at: ctx.now });
        return { gifts: n };
      }
      case 'plateTake': {
        if (!S.plates.includes(p.plate)) fail('У игрока нет такого номера');
        R.settleIncome(S, ctx.now);
        plateCars(S).forEach(c => { if (c.plate === p.plate) delete c.plate; });
        S.plates = S.plates.filter(k => k !== p.plate);
        S.pending = Math.min(S.pending, R.pendingCap(S));
        return { plate: p.plate };
      }
      case 'reset': return { replace: R.newState(ctx.now) };
      case 'load': return { replace: R.migrate(p.state, ctx.now) };
      default: fail('Неизвестная команда');
    }
    return {};
  };

  // админ выдал что-то с галочкой «уведомить» — игроку приходит уведомление
  const adminCore = A.admin;
  const noticeOf = (p, r) => {
    switch (p.op) {
      case 'money': return p.add > 0 && { kind: 'money', amount: p.add };
      case 'car': return { kind: 'car', carId: p.carId };
      case 'part': return { kind: 'part', slot: p.slot, t: p.t, n: p.n || 1 };
      case 'partsAll': return { kind: 'partsAll' };
      case 'slots': return { kind: 'slots', n: 5 };
      case 'xp': return { kind: 'xp', n: p.n };
      case 'fuel': return { kind: 'fuel' };
      case 'fuelAdd': return r.added > 0 && { kind: 'fuelN', n: r.added };
      case 'rewardCase': return { kind: 'rcase' };
      case 'daily': return { kind: 'daily' };
      case 'cooldowns': return { kind: 'cool' };
      case 'plateGive': return { kind: 'plate', plate: p.plate };
      case 'plateRandom': return r.plate && { kind: 'plate', plate: r.plate };
    }
    return null;
  };
  A.admin = (S, p, ctx) => {
    const r = adminCore(S, p, ctx);
    const n = p.notify && !r?.replace && noticeOf(p, r || {});
    if (n) { S.notices.push({ id: ctx.uid(), ...n, at: ctx.now }); S.notices = S.notices.slice(-20); }
    return r;
  };
  A.sync = () => ({});   // пустое действие: R.run применяет новый день / сезон (сервер вызывает при входе)
  A.noticeAck = (S, p) => {
    S.notices = (S.notices || []).filter(x => x.id !== p.id);
    return {};
  };

  R.actions = A;

  // выполнить действие: возвращает { state, result } или бросает GameError
  // ---------- история игрока (для админки): последние HIST_MAX действий, которые что-то изменили ----------
  // { t, a: действие, c?: кейс, m?: ±деньги, ad?: [машины +], rm?: [машины −], p?: ±детали, n?: ±номера }
  const HIST_MAX = 100;
  const allCars = S => [...S.cars, ...S.museum, ...(S.waiting || []), ...(S.lots || []).filter(l => l.car).map(l => l.car)];
  const invSum = S => Object.values(S.inv || {}).reduce((a, b) => a + b, 0);
  const histSnap = S => ({ m: S.money, cars: new Map(allCars(S).map(c => [c.uid, c.id])), p: invSum(S), n: (S.plates || []).length });
  function histAdd(S, name, p, b, now) {
    if (!S.cars) return;   // прогресс заменён целиком (админ: сброс/загрузка)
    const after = new Map(allCars(S).map(c => [c.uid, c.id]));
    const e = { t: now, a: name === 'admin' ? 'admin:' + (p.op || '') : name, b: S.money };   // b — баланс после
    if (p.caseId) e.c = p.caseId;
    if (name === 'promo' && p.code) e.code = String(p.code).slice(0, 32);
    const m = S.money - b.m; if (m) e.m = m;
    const ad = [...after].filter(([u]) => !b.cars.has(u)).map(([, id]) => id); if (ad.length) e.ad = ad;
    const rm = [...b.cars].filter(([u]) => !after.has(u)).map(([, id]) => id); if (rm.length) e.rm = rm;
    const dp = invSum(S) - b.p; if (dp) e.p = dp;
    const dn = (S.plates || []).length - b.n; if (dn) e.n = dn;
    if (!e.m && !e.ad && !e.rm && !e.p && !e.n) return;   // ничего не изменилось — не пишем
    S.hist = [e, ...(S.hist || [])].slice(0, HIST_MAX);
  }

  R.run = (S, name, params, ctx) => {
    const act = A[name];
    if (!act) fail('Неизвестное действие');
    ctx.levelUps = [];
    R.rollDay(S, ctx.now);
    R.rollWeek(S, ctx.now);
    R.rollWeekQuests(S, ctx.now);
    R.betaGrant(S, ctx);
    R.rollSeason(S, ctx.now, ctx);
    // призы сезона, которые положил сервер (по расписанию) — выдаём при первом действии
    if (S.prizeQueue?.length) { for (const q of S.prizeQueue) R.applySeasonPrize(S, q.season, q.place, ctx); S.prizeQueue = []; }
    const before = histSnap(S);
    if (S.duel) R.duelSettle(S, ctx);   // гонка с другом: соперник проехал или время вышло
    const sold = ctx.local && name !== 'marketTick' ? R.marketBots(S, ctx.now) : [];
    const result = act(S, params || {}, ctx) || {};
    histAdd(S, name, params || {}, before, ctx.now);
    if (ctx.levelUps.length) result.levelUps = ctx.levelUps;
    if (sold.length) result.marketSold = sold;
    if (result.replace) { const st = result.replace; delete result.replace; return { state: st, result }; }
    return { state: S, result };
  };

  g.Rules = R;
})(globalThis);
