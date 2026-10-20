// ===== DROPZONE: AUTO — игровые данные =====

// Редкость = класс машины
const RARITIES = {
  D: { name: 'Обычная',     color: '#8e8e93' },
  C: { name: 'Редкая',      color: '#0a84ff' },
  B: { name: 'Эпическая',   color: '#bf5af2' },
  A: { name: 'Легендарная', color: '#ff9f0a' },
  S: { name: 'Мифическая',  color: '#ff375f' },
};
const RARITY_ORDER = ['D', 'C', 'B', 'A', 'S'];

const COUNTRIES = {
  ru: { name: 'Россия/СССР', flag: '🇷🇺' },
  jp: { name: 'Япония',      flag: '🇯🇵' },
  de: { name: 'Германия',    flag: '🇩🇪' },
  it: { name: 'Италия',      flag: '🇮🇹' },
  us: { name: 'США',         flag: '🇺🇸' },
  xx: { name: 'Другие',      flag: '🌍' },
};
// настоящая страна машин из «Других» (группа коллекции остаётся «Другие», показывается флаг страны)
const ORIGINS = {
  cn: { name: 'Китай',          flag: '🇨🇳' },
  gb: { name: 'Великобритания', flag: '🇬🇧' },
  se: { name: 'Швеция',         flag: '🇸🇪' },
  fr: { name: 'Франция',        flag: '🇫🇷' },
};

// price — в рублях, hp — л.с., body — форма заглушки (sedan | hatch | sport | suv)
// Фото: img/cars/<id>.webp — готовятся из img/cars_src скриптом tools/prepare_photos.py
const CARS = [
  // --- Россия / СССР ---
  { id: 'vaz2101',   name: 'ВАЗ-2101',               c: 'ru', r: 'D', hp: 64,   price: 60e3,   body: 'sedan', color: '#d9d2c3' },
  { id: 'moskvich412', name: 'Москвич-412',          c: 'ru', r: 'D', hp: 75,   price: 70e3,   body: 'sedan', color: '#3f7d5c' },
  { id: 'vaz2106',   name: 'ВАЗ-2106',               c: 'ru', r: 'D', hp: 80,   price: 90e3,   body: 'sedan', color: '#c47a1e' },
  { id: 'vaz2107',   name: 'ВАЗ-2107',               c: 'ru', r: 'D', hp: 77,   price: 110e3,  body: 'sedan', color: '#8b1e2b' },
  { id: 'vaz2109',   name: 'ВАЗ-2109',               c: 'ru', r: 'D', hp: 70,   price: 120e3,  body: 'hatch', color: '#e8e8e8' },
  { id: 'priora',    name: 'Лада Приора',            c: 'ru', r: 'D', hp: 98,   price: 280e3,  body: 'sedan', color: '#2a2a2a' },
  { id: 'niva',      name: 'Лада Нива',              c: 'ru', r: 'D', hp: 80,   price: 350e3,  body: 'suv',   color: '#4d6b3c' },
  { id: 'volga24',   name: 'ГАЗ-24 Волга',           c: 'ru', r: 'C', hp: 95,   price: 900e3,  body: 'sedan', color: '#24364d' },
  { id: 'vestasport',name: 'Лада Веста Sport',       c: 'ru', r: 'C', hp: 145,  price: 1.9e6,  body: 'sedan', color: '#e4572e' },
  { id: 'aurus',     name: 'Aurus Senat',            c: 'ru', r: 'A', hp: 598,  price: 36e6,   body: 'sedan', color: '#1a1a1a' },

  // --- Япония ---
  { id: 'corolla',   name: 'Toyota Corolla E110',    c: 'jp', r: 'D', hp: 110,  price: 400e3,  body: 'sedan', color: '#b8bcc2' },
  { id: 'markii',    name: 'Toyota Mark II JZX100',  c: 'jp', r: 'C', hp: 280,  price: 1.6e6,  body: 'sedan', color: '#e6e6e6' },
  { id: 'cresta',    name: 'Toyota Cresta JZX100',   c: 'jp', r: 'C', hp: 280,  price: 1.7e6,  body: 'sedan', color: '#f2f2f2' },
  { id: 'ae86',      name: 'Toyota AE86 Trueno',     c: 'jp', r: 'C', hp: 130,  price: 2.5e6,  body: 'hatch', color: '#f0f0f0' },
  { id: 'civictyper',name: 'Honda Civic Type R',     c: 'jp', r: 'C', hp: 320,  price: 2.8e6,  body: 'hatch', color: '#f2f2f2' },
  { id: 'wrxsti',    name: 'Subaru Impreza WRX STI', c: 'jp', r: 'C', hp: 280,  price: 2.9e6,  body: 'sedan', color: '#1f4fbf' },
  { id: 'evo9',      name: 'Mitsubishi Lancer Evo IX', c: 'jp', r: 'B', hp: 280, price: 3.5e6,  body: 'sedan', color: '#c8c8c8' },
  { id: 's15',       name: 'Nissan Silvia S15',      c: 'jp', r: 'B', hp: 250,  price: 3.8e6,  body: 'sport', color: '#d9d9d9' },
  { id: 'rx7',       name: 'Mazda RX-7 FD',          c: 'jp', r: 'B', hp: 280,  price: 5e6,    body: 'sport', color: '#d4b106' },
  { id: 'supra',     name: 'Toyota Supra A80',       c: 'jp', r: 'B', hp: 330,  price: 8e6,    body: 'sport', color: '#f28c1a' },
  { id: 'nsx',       name: 'Honda NSX NA1',          c: 'jp', r: 'A', hp: 280,  price: 12e6,   body: 'sport', color: '#c0262d' },
  { id: 'r34',       name: 'Nissan Skyline GT-R R34',c: 'jp', r: 'A', hp: 330,  price: 15e6,   body: 'sport', color: '#2b59c3' },
  { id: 'gtr35',     name: 'Nissan GT-R R35',        c: 'jp', r: 'A', hp: 570,  price: 18e6,   body: 'sport', color: '#e6e6e6' },
  { id: 'lfa',       name: 'Lexus LFA',              c: 'jp', r: 'S', hp: 560,  price: 70e6,   body: 'sport', color: '#f2f2f2' },

  // --- Германия ---
  { id: 'golf2',     name: 'Volkswagen Golf II',     c: 'de', r: 'D', hp: 90,   price: 250e3,  body: 'hatch', color: '#b52a2a' },
  { id: 'polo',      name: 'Volkswagen Polo',        c: 'de', r: 'D', hp: 125,  price: 1.6e6,  body: 'sedan', color: '#f2f2f2' },
  { id: 'e36',       name: 'BMW 3 E36',              c: 'de', r: 'D', hp: 150,  price: 450e3,  body: 'sedan', color: '#2b3a55' },
  { id: 'w124',      name: 'Mercedes-Benz W124',     c: 'de', r: 'D', hp: 136,  price: 500e3,  body: 'sedan', color: '#cfcfcf' },
  { id: 'golfgti',   name: 'Volkswagen Golf GTI',    c: 'de', r: 'C', hp: 245,  price: 2.9e6,  body: 'hatch', color: '#c0262d' },
  { id: 'm3e46',     name: 'BMW M3 E46',             c: 'de', r: 'B', hp: 343,  price: 4.5e6,  body: 'sport', color: '#5a6b7a' },
  { id: 'm3e30',     name: 'BMW M3 E30',             c: 'de', r: 'B', hp: 195,  price: 6e6,    body: 'sedan', color: '#1c3f94' },
  { id: 'm5f90',     name: 'BMW M5 F90',             c: 'de', r: 'A', hp: 625,  price: 14e6,   body: 'sedan', color: '#3a4a5c' },
  { id: 'rs6',       name: 'Audi RS6 Avant',         c: 'de', r: 'A', hp: 600,  price: 18e6,   body: 'hatch', color: '#8a8d91' },
  { id: 'rs7',       name: 'Audi RS7 Performance',   c: 'de', r: 'A', hp: 630,  price: 20e6,   body: 'sport', color: '#f2f2f2' },
  { id: 'g63',       name: 'Mercedes-AMG G63',       c: 'de', r: 'A', hp: 585,  price: 25e6,   body: 'suv',   color: '#151515' },
  { id: 'p911ts',    name: 'Porsche 911 Turbo S',    c: 'de', r: 'A', hp: 650,  price: 30e6,   body: 'sport', color: '#ffd400' },
  { id: 'amgone',    name: 'Mercedes-AMG ONE',       c: 'de', r: 'S', hp: 1063, price: 300e6,  body: 'sport', color: '#c9ccd1' },

  // --- Италия ---
  { id: 'fiat500',   name: 'Fiat 500 (1957)',        c: 'it', r: 'D', hp: 18,   price: 150e3,  body: 'hatch', color: '#9fd3c7' },
  { id: 'giuliaqv',  name: 'Alfa Romeo Giulia QV',   c: 'it', r: 'B', hp: 510,  price: 9e6,    body: 'sedan', color: '#b0121b' },
  { id: 'mc20',      name: 'Maserati MC20',          c: 'it', r: 'A', hp: 630,  price: 28e6,   body: 'sport', color: '#1d3f8a' },
  { id: 'huracan',   name: 'Lamborghini Huracán',    c: 'it', r: 'A', hp: 640,  price: 32e6,   body: 'sport', color: '#7ac143' },
  { id: 'svj',       name: 'Lamborghini Aventador SVJ', c: 'it', r: 'S', hp: 770, price: 60e6, body: 'sport', color: '#f2a900' },
  { id: 'urus',      name: 'Lamborghini Urus SE',    c: 'it', r: 'S', hp: 800,  price: 45e6,   body: 'suv',   color: '#f2f2f2' },
  { id: 'f40',       name: 'Ferrari F40',            c: 'it', r: 'S', hp: 478,  price: 250e6,  body: 'sport', color: '#d40000' },
  { id: 'laferrari', name: 'Ferrari LaFerrari',      c: 'it', r: 'S', hp: 963,  price: 300e6,  body: 'sport', color: '#d40000' },

  // --- США ---
  { id: 'crownvic',  name: 'Ford Crown Victoria',    c: 'us', r: 'D', hp: 220,  price: 500e3,  body: 'sedan', color: '#1b1b1b' },
  { id: 'wrangler',  name: 'Jeep Wrangler',          c: 'us', r: 'C', hp: 285,  price: 2e6,    body: 'suv',   color: '#3d5a3a' },
  { id: 'camaro',    name: 'Chevrolet Camaro SS',    c: 'us', r: 'C', hp: 455,  price: 2.5e6,  body: 'sport', color: '#f2c200' },
  { id: 'mustang67', name: 'Ford Mustang 1967',      c: 'us', r: 'B', hp: 320,  price: 7e6,    body: 'sport', color: '#2e5c8a' },
  { id: 'hellcat',   name: 'Dodge Challenger Hellcat', c: 'us', r: 'B', hp: 717, price: 9e6,   body: 'sport', color: '#5a1f7a' },
  { id: 'plaid',     name: 'Tesla Model S Plaid',    c: 'us', r: 'B', hp: 1020, price: 10e6,   body: 'sedan', color: '#e9e9e9', ev: true },
  { id: 'c8',        name: 'Chevrolet Corvette C8',  c: 'us', r: 'A', hp: 495,  price: 13e6,   body: 'sport', color: '#e0631d' },
  { id: 'viper',     name: 'Dodge Viper ACR',        c: 'us', r: 'A', hp: 645,  price: 15e6,   body: 'sport', color: '#1f3a93' },
  { id: 'fordgt',    name: 'Ford GT',                c: 'us', r: 'A', hp: 660,  price: 40e6,   body: 'sport', color: '#1c4aa8' },

  // --- Другие (только в кейсах по редкости) ---
  { id: 'mclarenf1', name: 'McLaren F1',             c: 'xx', o: 'gb', r: 'S', hp: 627,  price: 200e6,  body: 'sport', color: '#e87722' },
  { id: 'jesko',     name: 'Koenigsegg Jesko',       c: 'xx', o: 'se', r: 'S', hp: 1600, price: 330e6,  body: 'sport', color: '#e9e9e9' },
  { id: 'chiron',    name: 'Bugatti Chiron',         c: 'xx', o: 'fr', r: 'S', hp: 1500, price: 350e6,  body: 'sport', color: '#1b3b8a' },
];

// Кейсы с машинами.
// drops — шанс редкости в %. Внутри редкости дешёвые машины выпадают чаще (вес ~ 1/цена^PRICE_WEIGHT_POW).
// country — кейс только с машинами этой страны. maxPrice — потолок цены машины для редкости.
// minPrice — машины дешевле не выпадают: дроп не дешевле половины цены кейса.
// Шансы подобраны так, чтобы продажа выпавшего в среднем возвращала ~97% цены кейса (выше 100% нельзя).
// С релизом (dropsNext) окупаемость по убывающей: Ржавый 102% → Подержанные 100 → Городской 98 → Тюнинг 96 → Спорткар 94 → Премиум 92 → Элита 90%;
// страновые — по цене (99…91%); мифические (S) в дорогих — в 2–3 раза реже. Ржавый чуть в плюс намеренно (владелец, 18.10): +1 тыс за кейс
const CASES = [
  { id: 'starter', name: 'Стартовый',     icon: '🎁', price: 0,      starter: true,
    drops: { D: 100 }, maxPrice: { D: 150e3 } },

  { id: 'rusty',   name: 'Ржавый гараж',  icon: '🧰', price: 50e3,   minPrice: 25e3,
    drops: { D: 99.83, C: 0.16, B: 0.01 }, dropsNext: { D: 99.61, C: 0.36, B: 0.02 }, maxPrice: { D: 150e3 } },
  // промежуточные кейсы — с релизом (nextCase): шансы подобраны на ~97%, как у остальных
  { id: 'used',    name: 'Подержанные',   icon: '🚙', price: 150e3,  minPrice: 75e3,  nextCase: true,
    drops: { D: 95.03, C: 4.55, B: 0.38, A: 0.04 }, maxPrice: { D: 400e3 } },
  { id: 'city',    name: 'Городской',     icon: '🏙️', price: 500e3,  minPrice: 200e3,
    drops: { D: 79.58, C: 16.85, B: 3.06, A: 0.51 }, dropsNext: { D: 84.51, C: 12.81, B: 2.3, A: 0.38 } },
  { id: 'tuned',   name: 'Тюнинг-ателье', icon: '🛠️', price: 1.2e6,  minPrice: 600e3, nextCase: true,
    drops: { D: 36.61, C: 54.92, B: 7.5, A: 0.94, S: 0.02 } },
  { id: 'sport',   name: 'Спорткар',      icon: '🏁', price: 2.5e6,  minPrice: 1.4e6,
    drops: { C: 66, B: 27.96, A: 5.66, S: 0.38 }, dropsNext: { C: 66.62, B: 27.67, A: 5.53, S: 0.17 } },
  { id: 'premium', name: 'Премиум',       icon: '💎', price: 5e6,    minPrice: 2.5e6, nextCase: true,
    drops: { C: 12.27, B: 69.52, A: 17.76, S: 0.44 } },
  { id: 'elite',   name: 'Элита',         icon: '👑', price: 8e6,    minPrice: 4e6,
    drops: { B: 60.56, A: 36.81, S: 2.63 }, dropsNext: { B: 56.25, A: 42.68, S: 1.07 } },

  // «Секретный кейс» — награда за всю коллекцию (релизное обновление): одна из секретных машин.
  // В списке кейсов его нет и за деньги не открыть — только подарком (S.gifts). Дорогие выпадают реже.
  { id: 'secret', name: 'Секретный кейс', icon: '🔐', price: 0, hidden: true, secretCase: true, drops: { X: 100 } },

  { id: 'c_ru', name: 'Россия/СССР', icon: '🇷🇺', country: 'ru', price: 350e3,  minPrice: 175e3,
    drops: { D: 86.39, C: 12.93, A: 0.68 }, dropsNext: { D: 90.03, C: 9.5, A: 0.47 } },
  { id: 'c_jp', name: 'Япония',      icon: '🇯🇵', country: 'jp', price: 1.7e6,  minPrice: 850e3,
    drops: { C: 82.91, B: 12.31, A: 4.44, S: 0.34 }, dropsNext: { C: 81.34, B: 13.6, A: 4.89, S: 0.16 } },
  { id: 'c_de', name: 'Германия',    icon: '🇩🇪', country: 'de', price: 2.6e6,  minPrice: 1.3e6,
    drops: { C: 83.86, B: 10.35, A: 5.47, S: 0.32 }, dropsNext: { C: 82.41, B: 11.39, A: 6.03, S: 0.17 } },
  { id: 'c_it', name: 'Италия',      icon: '🇮🇹', country: 'it', price: 6.5e6,  minPrice: 3.25e6,
    drops: { B: 86.54, A: 12.39, S: 1.07 }, dropsNext: { B: 87.64, A: 11.96, S: 0.4 } },
  { id: 'c_us', name: 'США',         icon: '🇺🇸', country: 'us', price: 2.55e6, minPrice: 1.275e6,
    drops: { C: 70.76, B: 20.89, A: 8.35 }, dropsNext: { C: 69.6, B: 21.71, A: 8.68 } },
];

const PRICE_WEIGHT_POW = 0.7;
const NEW_CASE_UNTIL = null;   // кейс «Новинки» убран (18.10) — вместо него промежуточные кейсы; оставлено для совместимости
const START_MONEY = 50000;

const GARAGE_START_SLOTS = 6;
const SELL_K = 0.5;              // скупка: 50% от стоимости
const INCOME_K = 0.03;           // доход в час = 3% от стоимости машины
const OFFLINE_MAX_MS = 4 * 3600e3;
// релизное обновление: доход в час зависит от класса (дорогие машины фармили слишком много),
// 3+ машины одной страны в гараже — +10% к их доходу, у VIP доход копится 8 ч
const INCOME_BY = { D: 0.03, C: 0.025, B: 0.02, A: 0.015, S: 0.01 };
const INCOME_SET = { n: 3, k: 0.10 };

// ===== Детали и тюнинг =====

// Уровни деталей (буква совпадает с классом машины).
// mult — доля от полного бонуса слота, price — цена детали: столько она добавляет к стоимости машины.
const PART_TIERS = {
  D: { name: 'Stock',  mult: 0.15, price: 20e3 },
  C: { name: 'Street', mult: 0.30, price: 60e3 },
  B: { name: 'Sport',  mult: 0.50, price: 220e3 },
  A: { name: 'Race',   mult: 0.75, price: 1.1e6 },
  S: { name: 'Elite',  mult: 1.00, price: 8e6 },
};

// 8 слотов. hp — прирост мощности при детали уровня S (сумма всех = +100%, т.е. ×2).
// Фото: img/parts/<id>.webp — готовятся из img/parts_src скриптом tools/prepare_photos.py parts
const SLOTS = [
  { id: 'engine',     name: 'Двигатель',    icon: '⚙️', hp: 0.22 },
  { id: 'turbo',      name: 'Турбина',      icon: '🌀', hp: 0.20 },
  { id: 'gearbox',    name: 'КПП',          icon: '🕹️', hp: 0.12 },
  { id: 'exhaust',    name: 'Выхлоп',       icon: '💨', hp: 0.10 },
  { id: 'suspension', name: 'Подвеска',     icon: '🔩', hp: 0.10 },
  { id: 'wheels',     name: 'Диски и шины', icon: '🛞', hp: 0.10 },
  { id: 'brakes',     name: 'Тормоза',      icon: '🛑', hp: 0.08 },
  { id: 'bodykit',    name: 'Обвес',        icon: '🏎️', hp: 0.08 },
];

// Электромобили (релизное обновление): вместо двигателя, турбины, КПП и выхлопа — 3 свои детали
// (их сила = сумме четырёх заменяемых: максимум прокачки электромобиля тоже +100%)
const EV_SLOTS = [
  { id: 'motor',    name: 'Электромотор', icon: '⚡', hp: 0.26, ev: true },
  { id: 'battery',  name: 'Батарея',      icon: '🔋', hp: 0.24, ev: true },
  { id: 'reducer',  name: 'Редуктор',     icon: '⚙️', hp: 0.14, ev: true },
];
const ICE_ONLY = ['engine', 'turbo', 'gearbox', 'exhaust'];

// Шанс слияния 3 → 1 (из уровня). При неудаче сгорают все три детали.
const MERGE_CHANCE = { D: 100, C: 80, B: 60, A: 40 };
// релизное обновление: при неудаче остаётся 1 деталь (сгорают 2), шанс ниже, но каждая неудача
// даёт +10% к следующему слиянию того же уровня (сбрасывается после успеха) — в среднем «в ноль»
const MERGE_NEXT = { chance: { D: 100, C: 70, B: 50, A: 30 }, pity: 10, keep: 1 };
// полный комплект: все 8 деталей одного уровня — +5% мощности и +1% к доходу в час
const FULL_SET = { hp: 0.05, income: 0.01 };

// Кейсы с деталями: слот выпадает случайно, drops — шанс уровня в %.
// Кейс можно открыть и под конкретную деталь — тогда он дороже на SLOT_CASE_MARKUP.
// anySlotOnly — только со случайной деталью (самый дорогой кейс, чтобы Race/Elite не собирались слишком легко).
const PART_CASES = [
  { id: 'p_junk',    name: 'Разборка',          icon: '🪛', price: 14e3,  drops: { D: 85, C: 14, B: 1 } },
  { id: 'p_atelier', name: 'Тюнинг-ателье',     icon: '🔧', price: 49e3,  drops: { D: 30, C: 50, B: 18, A: 2 } },
  { id: 'p_race',    name: 'Гоночный цех',      icon: '⚡', price: 245e3, drops: { C: 30, B: 50, A: 18, S: 2 } },
  { id: 'p_factory', name: 'Заводской тюнинг',  icon: '🏭', price: 720e3, drops: { B: 40, A: 50, S: 10 }, anySlotOnly: true },
];

// Сколько кейсов деталей можно открыть за раз
const PART_COUNTS = [1, 3, 5, 10];
const CAR_COUNTS = [1, 3, 5];   // кейсы с машинами за раз (не больше свободных мест)

// ===== Номера (пока только локальный режим, PLATES_LOCAL_ONLY) =====
// Формат как в России: А123ВС 77. Каждый номер — в одном экземпляре. Ключ номера: 'А123ВС|77'.
const PLATES_LOCAL_ONLY = false;   // номера выпущены (общий реестр на сервере)
const PLATE_LETTERS = 'АВЕКМНОРСТУХ';
// регионы номеров: все основные коды регионов России + дополнительные трёхзначные
const PLATE_REGIONS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40',
  '41', '42', '43', '44', '45', '46', '47', '48', '49', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '60',
  '61', '62', '63', '64', '65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '83',
  '86', '87', '89', '90', '93', '95', '96', '97', '98', '99', '102', '113', '116', '121', '122', '123', '124', '125', '126', '134',
  '136', '138', '142', '147', '150', '152', '154', '159', '161', '163', '164', '173', '174', '177', '178', '186', '190', '196', '197', '199',
  '702', '716', '750', '761', '763', '774', '777', '790', '797', '799',
];
// с релизным обновлением — все остальные действующие коды (таблицы кодов 2026: МВД/Autonews/РИА)
const PLATE_REGIONS_NEXT = ['80', '81', '82', '84', '85', '92', '103', '155', '156', '180', '181', '184', '185', '193', '198', '250', '550', '977'];
// «очки красоты» номера → редкость и цена (см. Rules.plateInfo)
const PLATE_SCORE = {
  digits: { first9: 5, d777: 4.5, triple: 4, hundreds: 3, tens: 2.5, seq: 2.5, mirror: 1.5, pair: 0.5 },
  letters: { triple: 3, pair: 0.7 },
  combo: 1,                                            // одинаковые буквы + «сильные» цифры (А111АА, А001АА)
  blat: { 'АМР': 4, 'ЕКХ': 4, 'ООМ': 2.5, 'ВОР': 2 },  // «блатные» серии
  regionTop: ['77', '97', '99', '777'], regionTopScore: 1.5,
  regionMsk: ['177', '197', '199', '797', '799', '977'], regionMskScore: 1,
  regionSpb: ['78', '98', '178', '198'], regionSpbScore: 0.5,
};
const PLATE_RARITY_AT = { C: 1.5, B: 3, A: 5, S: 7.5 };   // от скольких очков редкость
const PLATE_VALUE = { base: 2000, k: 2.4 };               // цена = base · k^очки
// релизное обновление: цена ближе к реальному рынку (объявления 2025–2026): база по региону × множители
// за цифры и буквы; когда и цифры, и буквы «красивые» — множители чуть гасят друг друга (реальные цены растут не бесконечно)
const PLATE_REAL = {
  // сверено с объявлениями 2026 (gosnomeru.com и др.): Москва 77/97/99/777 — дороже всех, затем остальная Москва,
  // область, Петербург и города-миллионники, остальные регионы
  region: { top: 150e3, msk: 90e3, mo: 60e3, spb: 30e3, big: 25e3, other: 12e3 },
  regionMo: ['50', '90', '150', '190', '250', '550', '750', '790'],
  regionBig: ['02', '102', '702', '05', '16', '116', '716', '23', '93', '123', '193', '24', '124', '34', '134', '36', '136', '52', '152',
    '54', '154', '55', '155', '59', '159', '61', '161', '761', '63', '163', '763', '66', '96', '196', '74', '174', '774'],
  digits: { first9: 15, d777: 25, triple: 10, hundreds: 5, tens: 4, seq: 2.5, mirror: 2.5, pair: 1.3, plain: 1 },
  letters: { triple: 12, pair: 1.6, plain: 1 },
  combo: 3,           // одинаковые буквы + «сильные» цифры (А777АА, О009ОО) — ценятся отдельно
  blat: { 'АМР': 40, 'ЕКХ': 40, 'ООМ': 16.6, 'ВОР': 10.75 },
  // спецсерии ценятся только в своих регионах (АМР 74 — обычные буквы). По народным спискам (DRIVE2, specznak77 и др.)
  special: [
    { name: 'Москва', regions: ['77', '97', '99', '177', '197', '199', '777', '797', '799', '977'],
      series: { 'АМР': 40, 'ЕКХ': 40, 'ВОР': 40, 'АМО': 30, 'ММР': 20, 'ООМ': 17 } },
    { name: 'Подмосковье', regions: ['50', '90', '150', '190', '250', '550', '750', '790'], series: { 'АММ': 30, 'МММ': 25, 'АМО': 25, 'ВМО': 12, 'КМО': 12 } },
    { name: 'Ростов', regions: ['61', '161', '761'], series: { 'АРО': 20 } },
    { name: 'Новосибирск', regions: ['54', '154'], series: { 'НСО': 12 } },
    { name: 'Чечня', regions: ['95'], series: { 'ЕКХ': 40 } },
  ],
  specialAll: { 'ВОР': 10, 'ЕКХ': 5 },   // «народные» серии — ценятся и в других регионах, но меньше
  regionBase: { '95': 60e3 },   // регион с дорогими номерами (Е095КХ 95 — ~5,5 млн)
  soften: 0.5,        // доля меньшего множителя, которая «гасится»
  plainK: 0.2,        // обычный номер без особенностей — почти ничего не стоит
};
const PLATE_BUY_K = 10;                                    // (покупка конкретного номера убрана)
const PLATE_LIMIT_EXTRA = 5;                               // номеров у игрока — не больше, чем у него машин (гараж + витрина) + 5
// релизное обновление: номера на машинах — без лимита, в запасе (не на машине) — 5 (+ места за звёзды, + VIP)
const PLATE_STORE = { base: 5, max: 20 };                  // max — сколько мест можно докупить за звёзды
const PLATE_CASES = [
  // генерация номера (не кейс). Мифический — только в «Красивой» и очень редко (1,2%)
  { id: 'pl_basic', name: 'Обычная', icon: '🔖', price: 5e3, priceNext: 32e3, drops: { D: 0.844, C: 0.156 }, dropsNext: { D: 0.8439, C: 0.156, B: 0.0001 } },
  { id: 'pl_plus', name: 'Улучшенная', icon: '🏷️', price: 50e3, priceNext: 225e3, drops: { C: 0.538, B: 0.44, A: 0.022 } },
  { id: 'pl_nice', name: 'Красивая', icon: '✨', price: 500e3, priceNext: 1.55e6, drops: { B: 0.3, A: 0.688, S: 0.012 } },
];

// С релизом: в «Обычной» генерации можно выбрать регион. Цена — по региону: ожидаемая цена номера / payback × markup
// (Rules.plateRegionPrice, считается одинаково в игре и на сервере)
const PLATE_REGION_PICK = { caseId: 'pl_basic', payback: 0.93, markup: 1.1 };
// цена «Обычной» генерации в выбранном регионе — генерирует tools/plate_region_prices.mjs (не править руками)
// @region-prices:start
const PLATE_REGION_PRICE = {   // 60000 проб на регион, окупаемость ~85%
  '01': 35000, '02': 73000, '03': 36000, '04': 35000, '05': 73000, '06': 35000, '07': 35000, '08': 35000, '09': 35000, '10': 36000,
  '11': 35000, '12': 36000, '13': 35000, '14': 36000, '15': 35000, '16': 74000, '17': 35000, '18': 35000, '19': 35000, '20': 36000,
  '21': 35000, '22': 35000, '23': 73000, '24': 74000, '25': 36000, '26': 36000, '27': 35000, '28': 35000, '29': 35000, '30': 35000,
  '31': 35000, '32': 35000, '33': 35000, '34': 74000, '35': 36000, '36': 73000, '37': 36000, '38': 36000, '39': 35000, '40': 35000,
  '41': 35000, '42': 36000, '43': 35000, '44': 35000, '45': 35000, '46': 35000, '47': 35000, '48': 35000, '49': 35000, '50': 190000,
  '51': 35000, '52': 73000, '53': 36000, '54': 74000, '55': 73000, '56': 35000, '57': 35000, '58': 36000, '59': 73000, '60': 35000,
  '61': 74000, '62': 35000, '63': 74000, '64': 36000, '65': 35000, '66': 73000, '67': 36000, '68': 35000, '69': 35000, '70': 35000,
  '71': 35000, '72': 35000, '73': 35000, '74': 73000, '75': 35000, '76': 35000, '77': 460000, '78': 87000, '79': 36000, '80': 35000,
  '81': 35000, '82': 34000, '83': 35000, '84': 35000, '85': 36000, '86': 35000, '87': 36000, '89': 35000, '90': 190000, '92': 35000,
  '93': 72000, '95': 180000, '96': 73000, '97': 460000, '98': 88000, '99': 460000, '102': 73000, '103': 35000, '113': 36000, '116': 73000,
  '121': 35000, '122': 35000, '123': 73000, '124': 74000, '125': 35000, '126': 35000, '134': 73000, '136': 73000, '138': 35000, '142': 35000,
  '147': 35000, '150': 190000, '152': 74000, '154': 75000, '155': 74000, '156': 35000, '159': 73000, '161': 74000, '163': 74000, '164': 35000,
  '173': 36000, '174': 73000, '177': 280000, '178': 89000, '180': 36000, '181': 35000, '184': 35000, '185': 36000, '186': 35000, '190': 180000,
  '193': 71000, '196': 73000, '197': 280000, '198': 86000, '199': 280000, '250': 190000, '550': 190000, '702': 72000, '716': 74000, '750': 180000,
  '761': 74000, '763': 74000, '774': 72000, '777': 470000, '790': 180000, '797': 280000, '799': 280000, '977': 290000,
};
// @region-prices:end
// названия регионов по кодам (для выбора региона)
const PLATE_REGION_NAMES = {
  'Адыгея': ['01'], 'Башкортостан': ['02', '102', '702'], 'Бурятия': ['03', '103'], 'Республика Алтай': ['04'], 'Дагестан': ['05'],
  'Ингушетия': ['06'], 'Кабардино-Балкария': ['07'], 'Калмыкия': ['08'], 'Карачаево-Черкесия': ['09'], 'Карелия': ['10'], 'Коми': ['11'],
  'Марий Эл': ['12'], 'Мордовия': ['13', '113'], 'Якутия': ['14'], 'Северная Осетия': ['15'], 'Татарстан': ['16', '116', '716'], 'Тыва': ['17'],
  'Удмуртия': ['18'], 'Хакасия': ['19'], 'Чечня': ['20', '95'], 'Чувашия': ['21', '121'], 'Алтайский край': ['22', '122'],
  'Краснодарский край': ['23', '93', '123', '193'], 'Красноярский край': ['24', '124'], 'Приморский край': ['25', '125'], 'Ставропольский край': ['26', '126'],
  'Хабаровский край': ['27'], 'Амурская область': ['28'], 'Архангельская область': ['29'], 'Астраханская область': ['30'], 'Белгородская область': ['31'],
  'Брянская область': ['32'], 'Владимирская область': ['33'], 'Волгоградская область': ['34', '134'], 'Вологодская область': ['35'],
  'Воронежская область': ['36', '136'], 'Ивановская область': ['37'], 'Иркутская область': ['38', '138'], 'Калининградская область': ['39'],
  'Калужская область': ['40'], 'Камчатский край': ['41'], 'Кемеровская область': ['42', '142'], 'Кировская область': ['43'], 'Костромская область': ['44'],
  'Курганская область': ['45'], 'Курская область': ['46'], 'Ленинградская область': ['47', '147'], 'Липецкая область': ['48'], 'Магаданская область': ['49'],
  'Московская область': ['50', '90', '150', '190', '250', '550', '750', '790'], 'Мурманская область': ['51'], 'Нижегородская область': ['52', '152'],
  'Новгородская область': ['53'], 'Новосибирская область': ['54', '154'], 'Омская область': ['55', '155'], 'Оренбургская область': ['56', '156'],
  'Орловская область': ['57'], 'Пензенская область': ['58'], 'Пермский край': ['59', '159'], 'Псковская область': ['60'], 'Ростовская область': ['61', '161', '761'],
  'Рязанская область': ['62'], 'Самарская область': ['63', '163', '763'], 'Саратовская область': ['64', '164'], 'Сахалинская область': ['65'],
  'Свердловская область': ['66', '96', '196'], 'Смоленская область': ['67'], 'Тамбовская область': ['68'], 'Тверская область': ['69'], 'Томская область': ['70'],
  'Тульская область': ['71'], 'Тюменская область': ['72'], 'Ульяновская область': ['73', '173'], 'Челябинская область': ['74', '174', '774'],
  'Забайкальский край': ['75'], 'Ярославская область': ['76'], 'Москва': ['77', '97', '99', '177', '197', '199', '777', '797', '799', '977'],
  'Санкт-Петербург': ['78', '98', '178', '198'], 'Еврейская АО': ['79'], 'ДНР': ['80', '180'], 'ЛНР': ['81', '181'], 'Крым': ['82'], 'Ненецкий АО': ['83'],
  'Херсонская область': ['84', '184'], 'Запорожская область': ['85', '185'], 'Ханты-Мансийский АО': ['86', '186'], 'Чукотка': ['87'], 'Ямало-Ненецкий АО': ['89'],
  'Севастополь': ['92'],
};

// Наценка на кейс конкретной детали
const SLOT_CASE_MARKUP = 0.15;

// ===== Гонки (дрэг 402 м, 1 на 1 с ботом) =====
const RACE = {
  fuelMax: 15,                      // общий бак игрока (на все машины): столько гонок подряд
  carFuelMax: 5,                    // и у каждой машины свой бак: одна машина — не больше 5 гонок подряд
  // релизное обновление: чем реже машина, тем меньше её бак (секретки X — как S)
  carFuelBy: { D: 8, C: 6, B: 4, A: 3, S: 2 },
  fuelRegenMs: 20 * 60e3,           // +1 топлива каждые 20 минут
  prize: { D: 10e3, C: 50e3, B: 200e3, A: 800e3, S: 5e6 },   // приз за победу над средним соперником
  feeK: 0.3,                        // взнос = 30% приза, сгорает при поражении
  luck: 0.10,                       // случайность ±10% к мощности
  // мощность бота — от стоковой мощности твоей машины; mult — множитель приза
  diffs: [
    // с релизом: тренировка — слабый соперник без взноса (заработать, когда денег нет); бензин тратится
    { id: 'free',   name: 'Тренировка', color: '#8e8e93', power: [0.75, 0.92], mult: 0.3, cap: 15e3, noFee: true, next: true },   // приз не больше cap на любой машине
    { id: 'easy',   name: 'Лёгкий',  color: '#34c759', power: [0.85, 1.00], mult: 0.5 },
    { id: 'medium', name: 'Средний', color: '#ff9f0a', power: [1.10, 1.30], mult: 1 },
    { id: 'hard',   name: 'Сложный', color: '#ff3b30', power: [1.45, 1.80], mult: 2 },
  ],
  // реакция на старте (мс после зелёного) → множитель мощности
  starts: [
    { max: 150,      k: 1.04, name: 'Идеальный старт' },
    { max: 300,      k: 1.02, name: 'Хороший старт' },
    { max: 500,      k: 1.00, name: 'Нормальный старт' },
    { max: Infinity, k: 0.97, name: 'Поздний старт' },
  ],
  falseStartK: 0.92,
};

// Подработка (релизное обновление): мини-игра «Мойка» (Меню → «Подработка») — отмыть пятна грязи, награда min…max, раз в cdMs
const JOB = { cdMs: 10 * 60e3, min: 5e3, max: 15e3, spots: 8 };

// Апгрейд (релизное обновление): ставишь деньги, сам выбираешь шанс — выигрыш = ставка × (1 − edge) / шанс
const UPGRADE = { edge: 0.05, minChance: 1, maxChance: 75, maxBetK: 0.5, minBet: 10e3 };

// Гонки с друзьями (релизное обновление): вызов другу онлайн, ставка — сколько угодно (у обоих замораживается,
// победитель забирает обе). Каждый едет свой заезд в течение runMs. Свои попытки, бензин не тратится.
const DUEL = { perDay: 10, minBet: 10e3, acceptMs: 2 * 60e3, runMs: 5 * 60e3, log: 20 };

const BOT_NAMES = [
  'Турбо_Вася', 'DriftKing', 'Стас_JDM', 'Лёха_2107', 'NightRider', 'Бензин', 'Ахмед_GT', 'Kirill_M5',
  'Сашка_Буст', 'Shadow', 'Дед_на_Волге', 'Racer_777', 'Ника_STI', 'Гоша_Форсаж', 'Tokyo_Drift', 'Максон',
  'Ваня_Выхлоп', 'Ghost', 'Пашка_R34', 'Королева_дрэга', 'Медведь', 'Санёк_Supra', 'Volk', 'Lightning',
];

// ===== Награды =====

// Ежедневный бонус: 7 дней подряд, пропуск дня — снова день 1.
// money — рубли; parts: { case, n } — n деталей из кейса деталей; car — машина из кейса машин.
const DAILY = [
  { money: 20e3 },
  { parts: { case: 'p_junk', n: 3 } },
  { money: 60e3 },
  { parts: { case: 'p_atelier', n: 2 } },
  { car: 'city' },
  { money: 250e3 },
  { car: 'sport', parts: { case: 'p_race', n: 1 } },
];

// релизное обновление: бонус дня — 14 дней (ровно сезон), пропуск дня серию не сбрасывает
const DAILY_NEXT = [
  { money: 30e3 },
  { parts: { case: 'p_junk', n: 3 } },
  { money: 80e3 },
  { parts: { case: 'p_atelier', n: 2 } },
  { car: 'city' },
  { money: 200e3 },
  { car: 'sport', parts: { case: 'p_race', n: 1 } },
  { money: 400e3 },
  { parts: { case: 'p_race', n: 2 } },
  { car: 'city', fuel: true },
  { money: 700e3 },
  { parts: { case: 'p_factory', n: 1 } },
  { money: 1.5e6 },
  { car: 'elite', slots: 1 },
];

// Кейс наград: бесплатно раз в 4 часа
const REWARD_CASE = {
  everyMs: 4 * 3600e3,
  drops: [
    { kind: 'money', w: 50 },                       // доход гаража за 1–3 часа, минимум 20 000 ₽
    { kind: 'part',  w: 25, case: 'p_atelier' },
    { kind: 'fuel',  w: 15 },                       // полный бак
    { kind: 'car',   w: 10, case: 'city' },
  ],
  minMoney: 20e3,
};

// Покупка мест в гараже: 7-е место — firstPrice, каждое следующее ×growth
// firstPriceNext — с релизным обновлением (тест)
const GARAGE = { maxSlots: 30, firstPrice: 100e3, firstPriceNext: 500e3, growth: 2 };

// Награды за коллекцию
const COLLECTION_MILESTONES = [
  { n: 5,  money: 50e3 },
  { n: 10, money: 150e3, slots: 1 },
  { n: 20, money: 600e3 },
  { n: 30, money: 2e6,   slots: 1 },
  { n: 40, money: 8e6 },
  { n: 57, money: 50e6,  slots: 2 },    // вся коллекция (до релиза новых машин)
  { all: true, id: 'mall', money: 100e6, slots: 2, secretCase: 1, next: true },   // вся коллекция с новыми машинами + секретный кейс
];
const COUNTRY_REWARDS = { ru: 1e6, jp: 10e6, de: 20e6, it: 50e6, us: 10e6 };
// релизное обновление: бонусы крупнее (по стоимости коллекции страны) и награда за «Другие»
const COUNTRY_REWARDS_NEXT = { ru: 5e6, us: 20e6, jp: 20e6, de: 50e6, it: 80e6, xx: 100e6 };

// ===== Секретные машины (класс X) =====
// Выдаются за полную коллекцию страны (вместе с деньгами). Из кейсов не выпадают, не продаются.
// В гонках и тюнинге считаются как класс S.
RARITIES.X = { name: 'Секретная', color: '#d4a017' };
const SECRET_CARS = [
  { id: 'marussia', name: 'Маруся B2',          c: 'ru', r: 'X', hp: 420,  price: 250e6, body: 'sport', color: '#1a1a1a', secret: true },
  { id: 'grgt3',    name: 'Toyota GR GT3',      c: 'jp', r: 'X', hp: 550,  price: 250e6, body: 'sport', color: '#e9e9e9', secret: true },
  { id: 'p918',     name: 'Porsche 918 Spyder', c: 'de', r: 'X', hp: 887,  price: 300e6, body: 'sport', color: '#c9ccd1', secret: true },
  { id: 'zondar',   name: 'Pagani Zonda R',     c: 'it', r: 'X', hp: 750,  price: 350e6, body: 'sport', color: '#2b2b2b', secret: true },
  { id: 'tuatara',  name: 'SSC Tuatara',        c: 'us', r: 'X', hp: 1750, price: 350e6, body: 'sport', color: '#f2f2f2', secret: true },
];
CARS.push(...SECRET_CARS);

RARITIES.E = { name: 'Эксклюзивная', color: '#9be15d' };
const EXCL_CARS = [];
CARS.push(...EXCL_CARS);

const BETA_CAR = null;
if (BETA_CAR) CARS.push(BETA_CAR);

const PASS_CARS = [];
CARS.push(...PASS_CARS);

const DONOR_CAR = null, DONOR_TIERS = [], NAMED_CARS = [], AWARDS = {};

const NEXT_CARS = [];
CARS.push(...NEXT_CARS);
// одинаковый id у двух машин ломает игру (одна подменяет другую) — сразу видно в консоли и логах сервера
{ const seen = new Set(); for (const c of CARS) { if (seen.has(c.id)) console.error('Повтор id машины:', c.id); seen.add(c.id); } }
const SECRET_BY_COUNTRY = Object.fromEntries(SECRET_CARS.map(c => [c.c, c.id]));

// ===== Покраска =====
// Цена покраски = PAINT_K от стоимости машины, но не меньше PAINT_MIN
// Покраска временно выключена (код оставлен — чтобы вернуть, поставить true и выложить сервер)
const PAINT_ENABLED = false;
// старые машины (не из обновления) пока не красятся — у них нет «розовой» версии; сделаем фото — поставить true
const PAINT_OLD = false;
const PAINT_K = 0.05;
const PAINT_MIN = 5e3;
const PAINTS = [
  { id: 'red',    name: 'Красный',     hex: '#c8202a' },
  { id: 'orange', name: 'Оранжевый',   hex: '#f07a12' },
  { id: 'yellow', name: 'Жёлтый',      hex: '#f5c518' },
  { id: 'lime',   name: 'Лайм',        hex: '#7cc11e' },
  { id: 'green',  name: 'Зелёный',     hex: '#1f6e3a' },
  { id: 'cyan',   name: 'Бирюзовый',   hex: '#14a3b4' },
  { id: 'blue',   name: 'Синий',       hex: '#1e5bdc' },
  { id: 'navy',   name: 'Тёмно-синий', hex: '#17295c' },
  { id: 'purple', name: 'Фиолетовый',  hex: '#6c2bb8' },
  { id: 'pink',   name: 'Розовый',     hex: '#e8559a' },
  { id: 'white',  name: 'Белый',       hex: '#f2f2f2' },
  { id: 'silver', name: 'Серебристый', hex: '#a7adb5' },
  { id: 'graphite', name: 'Графит',    hex: '#4a4d52' },
  { id: 'black',  name: 'Чёрный',      hex: '#151517' },
];
// Машины, у которых маска кузова на фото получилась плохо (тёмный кузов сливается со стёклами и шинами)
const NO_PAINT = ['aurus', 'e36', 'g63', 'chiron', 'plaid', 'rs6', 'rx7', 'mustang67', 'moskvich412', 'vaz2107', 'evo9'];

// ===== Музей (витрина) =====
// Машина на витрине не ездит, не тюнингуется, не приносит доход и не занимает место в гараже
const MUSEUM = { startSlots: 4, maxSlots: 20, firstPrice: 500e3, growth: 2 };

// ===== Админ-панель =====
// Открывается 7 быстрыми нажатиями на заголовок экрана. В Telegram — только для этих ID.
// В обычном браузере (не в Telegram) открывается всегда — для тестов: там меняется только свой прогресс.
const ADMIN_IDS = [1217682856];

// ===== Уровни профиля и задания =====
// Опыт за действия
const XP = { carCase: 10, partCase: 3, race: 5, win: 10, merge: 8, install: 5, newCar: 25, daily: 20 };
// Опыт за кейсы, номера, слияние и установку деталей — не больше стольких в сутки (МСК):
// иначе опыт фармится почти бесплатно (купил кейсы — продал детали), а подарки за уровни дают деньги
const XP_GRIND_DAY = 300;
// Снятая деталь «остывает» 20 минут (её нельзя поставить или слить), и слот на той машине 20 минут пустует
const PART_COOLDOWN_MS = 20 * 60e3;
// Пауза между открытиями кейсов с деталями
const PART_CASE_PAUSE_MS = 10e3;
// Сколько опыта нужно с уровня L на L+1
const xpNeed = L => Math.round(100 * Math.pow(L, 1.35) / 10) * 10;
// Подарок за достижение уровня L: деньги за каждый уровень + крупный подарок каждые 5 уровней
const levelMoney = L => Math.round(15e3 * Math.pow(L, 1.6) / 1000) * 1000;
const LEVEL_GIFTS = {
  5:  { car: 'city' },
  10: { car: 'sport', slots: 1 },
  15: { parts: { case: 'p_factory', n: 2 } },
  20: { car: 'elite', slots: 1 },
  25: { parts: { case: 'p_factory', n: 5 } },
  30: { car: 'elite', slots: 2 },
};

// Сезонный пропуск (релизное обновление): 30 уровней = уровни игрока в сезоне.
// Бесплатная дорожка — обычные подарки за уровень (levelMoney + LEVEL_GIFTS), премиум — за звёзды, на один сезон.
// Купил позже — награды премиума за уже пройденные уровни выдаются сразу.
const PASS = { stars: 250, levels: 30 };
const passPrem = L => L === 30 ? { passCar: true }
  : L % 5 === 0 ? { cars: { case: { 5: 'sport', 10: 'elite', 15: 'sport', 20: 'elite', 25: 'elite' }[L], n: L === 15 || L === 25 ? 2 : 1 } }
  : L % 2 === 0 ? { money: levelMoney(L) }
  : { parts: { case: L < 10 ? 'p_atelier' : L < 20 ? 'p_race' : 'p_factory', n: L < 10 ? 2 : 1 } };

// Задания новичка — по очереди. stat — счётчик игрока (collection — машин в коллекции)
const NEWBIE_QUESTS = [
  { title: 'Открой стартовый кейс',          stat: 'carCases',  need: 1, money: 10e3,  xp: 30 },
  { title: 'Забери доход гаража',             stat: 'collects',  need: 1, money: 20e3,  xp: 30 },
  { title: 'Открой ещё один кейс машин',      stat: 'carCases',  need: 2, money: 30e3,  xp: 40 },
  { title: 'Открой кейс в Мастерской',        stat: 'partCases', need: 1, money: 20e3,  xp: 40 },
  { title: 'Поставь деталь на машину',        stat: 'installs',  need: 1, money: 30e3,  xp: 50 },
  { title: 'Выиграй гонку',                   stat: 'wins',      need: 1, money: 40e3,  xp: 50 },
  { title: 'Слей 3 детали в одну на складе',  stat: 'merged',    need: 1, money: 50e3,  xp: 60 },
  { title: 'Собери 5 машин в коллекции',      stat: 'collection', need: 5, money: 75e3, xp: 80 },
  { title: 'Проведи 3 гонки',                 stat: 'races',     need: 3, money: 50e3,  xp: 60 },
  { title: 'Выставь машину на витрину',       stat: 'museumIns', need: 1, money: 100e3, xp: 100 },
];

// Ежедневные задания: каждый день 3 из этого списка (одинаковые у всех), награда растёт с уровнем
const DAILY_QUESTS = [
  { id: 'cases3',  title: 'Открой 3 кейса машин',      stat: 'carCases',  need: 3,  money: 40e3 },
  { id: 'parts10', title: 'Открой 10 кейсов деталей',  stat: 'partCases', need: 10, money: 30e3 },
  { id: 'races5',  title: 'Проведи 5 гонок',           stat: 'races',     need: 5,  money: 30e3 },
  { id: 'wins3',   title: 'Выиграй 3 гонки',           stat: 'wins',      need: 3,  money: 40e3 },
  { id: 'merge2',  title: 'Слей детали 2 раза',        stat: 'merged',    need: 2,  money: 35e3 },
  { id: 'inst2',   title: 'Поставь 2 детали',          stat: 'installs',  need: 2,  money: 25e3 },
  { id: 'coll2',   title: 'Забери доход 2 раза',       stat: 'collects',  need: 2,  money: 20e3 },
  { id: 'sell1',   title: 'Продай машину',             stat: 'carsSold',  need: 1,  money: 20e3 },
  // релизное обновление (next — только когда обновление включено)
  { id: 'duel1',    title: 'Выиграй гонку с другом',     stat: 'duelWins',     need: 1, money: 50e3, next: true },
  { id: 'perfect1', title: 'Сделай идеальный старт',     stat: 'perfectStarts', need: 1, money: 30e3, next: true },
  { id: 'market1',  title: 'Выставь лот на площадку',    stat: 'marketLists',  need: 1, money: 25e3, next: true },
  { id: 'plate1',   title: 'Сгенерируй номер',           stat: 'plates',       need: 1, money: 25e3, next: true },
  { id: 'paint1',   title: 'Покрась машину',             stat: 'paints',       need: 1, money: 30e3, next: true },
];
// все 3 задания дня выполнены — бонус: кейс наград сразу (релизное обновление)
const DAILY_ALL_BONUS = { rcase: true, xp: 40 };
// недельные задания (релизное обновление): 3 в неделю, одинаковые у всех, награда — кейсы
const WEEKLY_QUESTS = [
  { id: 'w_wins',    title: 'Выиграй 30 гонок',             stat: 'wins',       need: 30, reward: { car: 'sport' } },
  { id: 'w_cases',   title: 'Открой 25 кейсов машин',       stat: 'carCases',   need: 25, reward: { parts: { case: 'p_race', n: 2 } } },
  { id: 'w_merge',   title: 'Слей детали 10 раз',           stat: 'merged',     need: 10, reward: { parts: { case: 'p_factory', n: 1 } } },
  { id: 'w_duels',   title: 'Выиграй 5 гонок с друзьями',   stat: 'duelWins',   need: 5,  reward: { money: 3e6 } },
  { id: 'w_coll',    title: 'Добавь 5 новых машин в коллекцию', stat: 'collection', need: 5, reward: { car: 'sport' } },
  { id: 'w_inst',    title: 'Поставь 15 деталей',           stat: 'installs',   need: 15, reward: { parts: { case: 'p_race', n: 2 } } },
  { id: 'w_sell',    title: 'Продай 10 машин',              stat: 'carsSold',   need: 10, reward: { money: 2e6 } },
  { id: 'w_collect', title: 'Забери доход 20 раз',          stat: 'collects',   need: 20, reward: { money: 1.5e6 } },
];
const WEEKLY_PER_WEEK = 3;
const WEEKLY_XP = 150;
const DAILY_QUESTS_PER_DAY = 3;
const DAILY_QUEST_XP = 40;

// ===== Сервер =====
// Адрес сервера (Cloudflare Worker). Пока пусто — игра работает локально, прогресс хранится на устройстве.
const API_URL = 'https://dropzone-api.dropzone-api.workers.dev';

// ===== Рейтинг (пока только локальный режим, выйдет вместе с номерами) =====
// «Всё время» — стоимость гаража (машины с деталями и номерами + витрина + номера без машины);
// «Неделя» — на сколько гараж вырос с понедельника (Москва). Призы топ-10 — в ночь на понедельник.
const RATING_LOCAL_ONLY = false;
const RATING_LIVE = true;     // сервер выдаёт недельные призы (false — выключить)
const WEEK_PRIZES = [10e6, 5e6, 3e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6];

// ===== Релизное обновление: пока только в браузере (локальный режим) =====
// Магазин, торговая площадка, контейнеры… В Telegram не видны, пока здесь true.
const NEXT_LOCAL_ONLY = true;

// Магазин за Telegram Stars (в тестовой версии оплата имитируется)
const SHOP = {
  packs: [                                   // игровые ₽ за звёзды: чем больше пакет — тем выгоднее (moneyNext — с релизом)
    { id: 'm50',   stars: 50,   money: 4e6,   moneyNext: 2e6,   cdMs: 3600e3 },   // cdMs — перезарядка (с релизом): раз в час
    { id: 'm150',  stars: 150,  money: 14e6,  moneyNext: 7.5e6 },
    { id: 'm500',  stars: 500,  money: 50e6,  moneyNext: 30e6,  cdMs: 900e3 },    // раз в 15 мин
    { id: 'm1000', stars: 1000, money: 110e6, moneyNext: 80e6 },
    { id: 'm2500', stars: 2500, money: 300e6, moneyNext: 300e6 },
  ],
  packLevel: { from: 0.25, max: 30 },        // с релизом пакеты ₽ растут с уровнем: на 1 ур. — четверть moneyNext, на 30 — весь (ровно по уровням)
  refuel: 25,                                // заправить все баки
  cool: 10,                                  // охладить все детали
  slot: 100,                                 // +1 место в гараже — первое в сезоне; каждое следующее ×slotGrowth
  plateSlot: 100,                            // +1 место для номера в запасе (до PLATE_STORE.max), тоже ×slotGrowth
  slotGrowth: 2,                             // цены мест растут с каждой покупкой и сбрасываются в новом сезоне (S.shopN)
  vip: { stars: 300, days: 14 },   // 19.10: на сезон (14 дней), было 30
  starter: { stars: 99, money: 1e6, cars: { case: 'city', n: 1 }, slots: 0, vipDays: 3 },   // один раз навсегда; ~×2 к ценам магазина (было 5 млн + 3 кейса + 2 места + VIP 7 дн — ×9)
};
// что из магазина уже продаётся в Telegram за настоящие звёзды (остальное — с релизом)
const SHOP_LIVE = ['m50'];
// Торговая площадка: цена от 50% до 300% стоимости, комиссия 5% с продавца (сгорает),
// лотов 5 (у VIP 10), лот висит 48 ч — потом вещь можно забрать обратно
const MARKET = { feeK: 0.05, minK: 0.5, maxK: 3, lots: 5, vipLots: 10, ttlMs: 48 * 3600e3, log: 30 };
// Аукцион на площадке: стартовая цена (от minK стоимости) + «купить сразу» по желанию, шаг +5%,
// ставка в последние 2 минуты продлевает на 2 минуты. Нет ставок — вещь возвращается без комиссии.
const MARKET_AUC = { hours: [1, 6, 24], stepK: 0.05, extendMs: 2 * 60e3 };

// Контейнеры — аукционы закрытых контейнеров с секретной машиной. Запускает админ (ивент).
// Шаг ставки +5%; ставка в последние 2 минуты продлевает аукцион на 2 минуты.
// Машина из контейнера (car.cont) — секретная, но её можно продать на торговой площадке.
// minLevel — с какого уровня можно ставить (защита от свежих аккаунтов-помощников)
const AUCTION = { stepK: 0.05, extendMs: 2 * 60e3, defStart: 10e6, defMs: 2 * 3600e3, round: 10e3, minLevel: 5 };

// VIP: топливо ×2 быстрее, детали остывают ×2 быстрее, подарок каждый день, +номера
const VIP = { fuelK: 2, cdK: 0.5, daily: 100e3, plates: 5, offlineH: 8 };   // 19.10: подарок 500 тыс → 100 тыс, номеров +10 → +5

// ===== Сезоны (релизное обновление) =====
// Сезон — 2 недели, с понедельника 00:00 МСК (epoch — начало сезона 1; на релизе поставить дату старта).
// В конце — призы топу по стоимости гаража, и почти всё сбрасывается. «Вечное» переходит дальше:
// Витрина славы (секретные машины), звёзды, значки сезонов, VIP, места за звёзды, стартовый набор.
// рейтинг закрыт до релиза (19.10, решение владельца): топ «за всё время» запомнен для наград, недельные призы не выдаются
const RATING_CLOSED = true;
const SEASON = {
  days: 14,
  epoch: Date.parse('2026-10-12T00:00:00+03:00'),
  prizes: [                                  // to — до какого места включительно
    { to: 1,   stars: 500, title: 'Чемпион сезона' },
    { to: 3,   stars: 250, title: 'Призёр сезона' },
    { to: 10,  stars: 50,  title: 'Топ-10 сезона' },
    { to: 100, title: 'Топ-100 сезона' },
  ],
};

// Поддержка: кнопка внизу Меню открывает профиль аккаунта поддержки в Telegram.
// live: false — пока только в браузерной тестовой версии; true — у всех в Telegram.
const SUPPORT = { url: 'https://t.me/dropezone_help', live: true };

// Приглашения: ссылка открывает игру с параметром r<ID пригласившего>
// inviter — пригласившему, когда друг дойдёт до minLevel (защита от накрутки пустыми аккаунтами); friend — другу сразу
// С релизным обновлением — снова первые суммы (inviterNext/friendNext), но пригласившему тоже только на minLevel друга
const REFERRAL = { inviterNow: 1e6, friendNow: 150e3, inviterNext: 100e3, friendNext: 50e3, minLevel: 3, link: 'https://t.me/dropezone_bot/dropezone?startapp=r',
  get inviter() { return globalThis.Rules?.nextActive() ? this.inviterNext : this.inviterNow; },
  get friend() { return globalThis.Rules?.nextActive() ? this.friendNext : this.friendNow; } };

// Чтобы эти данные видел и сервер (там файл подключается как модуль)
Object.assign(globalThis, {
  RARITIES, RARITY_ORDER, COUNTRIES, ORIGINS, CARS, CASES, PRICE_WEIGHT_POW, START_MONEY, GARAGE_START_SLOTS,
  SELL_K, INCOME_K, INCOME_BY, INCOME_SET, OFFLINE_MAX_MS, PART_TIERS, SLOTS, EV_SLOTS, ICE_ONLY, MERGE_CHANCE, MERGE_NEXT, FULL_SET, PART_CASES, SLOT_CASE_MARKUP,
  PART_COUNTS, CAR_COUNTS, PLATES_LOCAL_ONLY, PLATE_LETTERS, PLATE_REGIONS, PLATE_REGIONS_NEXT, PLATE_SCORE, PLATE_RARITY_AT, PLATE_VALUE, PLATE_REAL, PLATE_BUY_K, PLATE_LIMIT_EXTRA, PLATE_STORE, PLATE_CASES, PLATE_REGION_PICK, PLATE_REGION_NAMES, PLATE_REGION_PRICE, RACE, DUEL, UPGRADE, JOB, BOT_NAMES, SECRET_CARS, EXCL_CARS, SECRET_BY_COUNTRY, DAILY, REWARD_CASE, GARAGE,
  RATING_CLOSED, BETA_CAR, PASS_CARS, DONOR_CAR, DONOR_TIERS, NAMED_CARS, AWARDS, COLLECTION_MILESTONES, COUNTRY_REWARDS, COUNTRY_REWARDS_NEXT, PAINT_ENABLED, PAINT_OLD, PAINT_K, PAINT_MIN, PAINTS, NO_PAINT, MUSEUM, ADMIN_IDS, API_URL, REFERRAL, SUPPORT, SEASON, NEXT_LOCAL_ONLY, NEXT_CARS, NEW_CASE_UNTIL, SHOP, SHOP_LIVE, VIP, MARKET, MARKET_AUC, AUCTION, RATING_LOCAL_ONLY, RATING_LIVE, WEEK_PRIZES,
  XP, XP_GRIND_DAY, PART_COOLDOWN_MS, PART_CASE_PAUSE_MS, xpNeed, levelMoney, LEVEL_GIFTS, PASS, passPrem, NEWBIE_QUESTS, DAILY_QUESTS, DAILY_QUESTS_PER_DAY, DAILY_QUEST_XP, DAILY_NEXT, DAILY_ALL_BONUS, WEEKLY_QUESTS, WEEKLY_PER_WEEK, WEEKLY_XP,
});
