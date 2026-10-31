// Игровые данные: герои, умения с ветками, пассивы, дары алтарей, монстры, локации.

export const CLASSES = {
  warrior: {
    name: 'Страж Пепла', title: 'Ближний бой', sprite: 'warrior', hp: 190, speed: 4.5, armor: 0.15,
    color: '#ff9a3c', lore: 'Латы, остывший пепел и клинок, что помнит каждую битву.',
    skills: ['cleave', 'leap', 'whirl', 'cry'], cost: 0,
  },
  mage: {
    name: 'Пиромантка', title: 'Магия огня', sprite: 'mage', hp: 130, speed: 4.6, armor: 0,
    color: '#ffb040', lore: 'Её волосы горят, и этот огонь не гаснет даже в Бездне.',
    skills: ['firebolt', 'meteor', 'blink', 'orbs'], cost: 0,
  },
  hunter: {
    name: 'Охотница', title: 'Дальний бой', sprite: 'hunter', hp: 150, speed: 5.0, armor: 0.05,
    color: '#4af0cc', lore: 'Лунная тетива бьёт без промаха, а капканы ждут в темноте.',
    skills: ['arrow', 'trap', 'roll', 'rain'], cost: 0,
  },
};

// Каждое умение: база → одна из трёх веток (руна) → II → III.
// Значения веток читает skills.js; здесь — названия и описания для дерева.
export const SKILLS = {
  // ─── Страж Пепла
  cleave: {
    name: 'Рассечение', icon: 'slash', color: '#ffd8a0', cd: 0.42, dmg: 15, req: 1, key: 'ЛКМ',
    desc: 'Широкий удар клинком перед собой.',
    runes: [
      { name: 'Круговой замах', icon: 'whirl', color: '#ffe0a0', desc: 'Удар по кругу на 360°.', t2: 'Радиус +30%.', t3: 'Каждый 4-й удар оглушает на 1 с.' },
      { name: 'Кровавый клинок', icon: 'fang', color: '#ff4040', desc: 'Удары вызывают кровотечение.', t2: 'Лечение 1% здоровья за попадание.', t3: 'Кровотечение распространяется при смерти цели.' },
      { name: 'Ударная волна', icon: 'wind', color: '#9ad8ff', desc: 'Каждый 3-й удар запускает волну.', t2: 'Волна шире и бьёт сильнее.', t3: 'Каждый 2-й удар запускает волну.' },
    ],
  },
  leap: {
    name: 'Прыжок', icon: 'leap', color: '#ffb040', cd: 6, dmg: 40, req: 2, key: 'ПКМ',
    desc: 'Прыжок к курсору и удар по земле.',
    runes: [
      { name: 'Землетряс', icon: 'burst', color: '#d8a060', desc: 'Радиус удара +50%, оглушение.', t2: 'Оглушение 2 с.', t3: 'Через секунду — второй толчок.' },
      { name: 'Огненный след', icon: 'flame', color: '#ff7a2a', desc: 'В точке приземления — пылающая земля.', t2: 'Огонь горит дольше.', t3: 'Прыжок оставляет огонь по всей траектории.' },
      { name: 'Двойной прыжок', icon: 'double', color: '#ffe080', desc: '2 заряда.', t2: 'Перезарядка −25%.', t3: '3 заряда.' },
    ],
  },
  whirl: {
    name: 'Вихрь клинков', icon: 'whirl', color: '#ffe0b0', cd: 9, dmg: 9, req: 4, key: 'Пробел',
    desc: 'Вращение 2 с: урон всем вокруг, движение быстрее.',
    runes: [
      { name: 'Воронка', icon: 'wind', color: '#a0d0ff', desc: 'Притягивает врагов.', t2: 'Длится 3 с.', t3: 'В конце — взрыв.' },
      { name: 'Кровавый вихрь', icon: 'vamp', color: '#ff4a4a', desc: 'Лечит за каждое попадание.', t2: 'Лечение ×2.', t3: 'Неуязвимость во время вихря.' },
      { name: 'Огненный смерч', icon: 'flame', color: '#ff8a3a', desc: 'Выпускает огненные смерчи.', t2: 'Больше смерчей.', t3: 'Смерчи наводятся на врагов.' },
    ],
  },
  cry: {
    name: 'Боевой клич', icon: 'cry', color: '#ffcf6a', cd: 18, dmg: 0, req: 6, key: 'E',
    desc: '+30% урона и +20% брони на 8 с.',
    runes: [
      { name: 'Ярость', icon: 'fist', color: '#ff6a3a', desc: '+30% скорости атаки.', t2: 'Длится 12 с.', t3: 'Убийства продлевают клич.' },
      { name: 'Устрашение', icon: 'skull', color: '#c8a8ff', desc: 'Враги вокруг бегут в страхе.', t2: 'Страх 3 с и замедление.', t3: 'Напуганные получают +50% урона.' },
      { name: 'Призыв предков', icon: 'shield', color: '#8ae0ff', desc: 'Призывает 2 призрачных воинов.', t2: 'Воины сильнее.', t3: '3 воина.' },
    ],
  },
  // ─── Пиромантка
  firebolt: {
    name: 'Огненная искра', icon: 'bolt', color: '#ffb040', cd: 0.34, dmg: 13, req: 1, key: 'ЛКМ',
    desc: 'Сгусток пламени летит к курсору.',
    runes: [
      { name: 'Раскол', icon: 'double', color: '#ffd060', desc: 'При попадании делится на 3 искры.', t2: 'Осколки сильнее.', t3: 'Делится на 5.' },
      { name: 'Копьё пламени', icon: 'arrow', color: '#ff8030', desc: 'Пронзает врагов насквозь.', t2: 'Быстрее и дальше.', t3: 'Поджигает всех на пути.' },
      { name: 'Взрыв', icon: 'burst', color: '#ff6020', desc: 'Взрывается по площади.', t2: 'Радиус +40%.', t3: 'Взрыв оставляет пылающую землю.' },
    ],
  },
  meteor: {
    name: 'Метеор', icon: 'meteor', color: '#ff9a3c', cd: 5, dmg: 55, req: 2, key: 'ПКМ',
    desc: 'С неба падает метеор в точку курсора.',
    runes: [
      { name: 'Метеоритный дождь', icon: 'rain', color: '#ffb040', desc: 'Падает 5 метеоров поменьше.', t2: '7 метеоров.', t3: 'Каждый оставляет огонь.' },
      { name: 'Пылающая земля', icon: 'flame', color: '#ff6a20', desc: 'Оставляет огненную лужу.', t2: 'Лужа больше.', t3: 'Лужа втягивает врагов.' },
      { name: 'Ледяная комета', icon: 'frost', color: '#9af0ff', desc: 'Замораживает врагов на 2 с.', t2: 'Заморозка 3 с.', t3: 'Замёрзшие получают ×2 урона.' },
    ],
  },
  blink: {
    name: 'Скачок', icon: 'blink', color: '#c9a8ff', cd: 4, dmg: 20, req: 4, key: 'Пробел',
    desc: 'Мгновенный перенос к курсору.',
    runes: [
      { name: 'Пламенный путь', icon: 'flame', color: '#ff8a3a', desc: 'Оставляет след огня.', t2: 'След жжёт сильнее.', t3: 'Перезарядка −1 с.' },
      { name: 'Двойник', icon: 'blink', color: '#b48cff', desc: 'Оставляет двойника-приманку.', t2: 'Двойник взрывается.', t3: 'Двойник стреляет искрами.' },
      { name: 'Нова', icon: 'burst', color: '#ffe0a0', desc: 'Вспышка огня в точке прибытия.', t2: 'Отбрасывает врагов.', t3: 'Вспышка и на старте.' },
    ],
  },
  orbs: {
    name: 'Пламенные сферы', icon: 'orbs', color: '#ffb040', cd: 14, dmg: 12, req: 6, key: 'E',
    desc: '3 сферы вращаются вокруг 10 с.',
    runes: [
      { name: 'Хоровод', icon: 'orbs', color: '#ffd080', desc: '5 сфер.', t2: 'Радиус орбиты больше.', t3: '7 сфер.' },
      { name: 'Залп', icon: 'bolt', color: '#ff7a3a', desc: 'Сферы стреляют в ближайших врагов.', t2: 'Чаще.', t3: 'Выстрелы взрываются.' },
      { name: 'Сверхнова', icon: 'burst', color: '#fff0a0', desc: 'По окончании сферы взрываются.', t2: 'Сильнее взрыв.', t3: 'Взрыв оглушает.' },
    ],
  },
  // ─── Охотница
  arrow: {
    name: 'Лунная стрела', icon: 'arrow', color: '#bff4ff', cd: 0.3, dmg: 12, req: 1, key: 'ЛКМ',
    desc: 'Быстрый выстрел к курсору.',
    runes: [
      { name: 'Веер', icon: 'rain', color: '#d8f8ff', desc: '3 стрелы веером.', t2: '5 стрел.', t3: 'Стрелы пронзают 1 цель.' },
      { name: 'Рикошет', icon: 'chain', color: '#8af0d0', desc: 'Отскакивает к 2 целям.', t2: 'К 4 целям.', t3: 'Каждый отскок +20% урона.' },
      { name: 'Звёздная стрела', icon: 'storm', color: '#c9a8ff', desc: 'Пронзает всех.', t2: 'Урон +30%.', t3: 'Шанс 25% вызвать молнию.' },
    ],
  },
  trap: {
    name: 'Капкан', icon: 'trap', color: '#4af0cc', cd: 5, dmg: 45, req: 2, key: 'ПКМ',
    desc: 'Бросает капкан, который взрывается при касании.',
    runes: [
      { name: 'Россыпь', icon: 'trap', color: '#8af0a0', desc: '3 капкана.', t2: '5 капканов.', t3: 'Перезарядка −30%.' },
      { name: 'Ядовитое облако', icon: 'storm', color: '#8aff60', desc: 'Оставляет облако яда.', t2: 'Облако больше.', t3: 'Яд замедляет.' },
      { name: 'Громовой капкан', icon: 'chain', color: '#9ad8ff', desc: 'Цепная молния по 5 целям.', t2: 'По 8 целям.', t3: 'Капкан срабатывает 3 раза.' },
    ],
  },
  roll: {
    name: 'Кувырок', icon: 'roll', color: '#bff4ff', cd: 3, dmg: 0, req: 4, key: 'Пробел',
    desc: 'Рывок, неуязвимость на время кувырка.',
    runes: [
      { name: 'Шипы', icon: 'trap', color: '#c8c8d8', desc: 'Рассыпает шипы, замедляя врагов.', t2: 'Шипы ранят.', t3: 'Перезарядка −1 с.' },
      { name: 'Залп в прыжке', icon: 'rain', color: '#d8f8ff', desc: 'Выпускает 8 стрел вокруг.', t2: '12 стрел.', t3: 'Стрелы самонаводятся.' },
      { name: 'Тень', icon: 'blink', color: '#9a8aff', desc: 'Следующие 3 выстрела — критические.', t2: '5 выстрелов.', t3: 'Невидимость 2 с.' },
    ],
  },
  rain: {
    name: 'Ливень стрел', icon: 'rain', color: '#bff4ff', cd: 12, dmg: 10, req: 6, key: 'E',
    desc: 'Стрелы 3 с падают в точку курсора.',
    runes: [
      { name: 'Шквал', icon: 'rain', color: '#e0f8ff', desc: 'Площадь +50%.', t2: 'Длится 5 с.', t3: 'Площадь следует за героиней.' },
      { name: 'Ястреб', icon: 'wind', color: '#ffd080', desc: 'Призывает ястреба на 15 с.', t2: 'Ястреб быстрее.', t3: '2 ястреба.' },
      { name: 'Звездопад', icon: 'storm', color: '#c9a8ff', desc: 'Падают молнии вместо стрел.', t2: 'Молнии чаще.', t3: 'Молнии оглушают.' },
    ],
  },
};

export const TIER_REQ = [0, 3, 8, 14]; // уровень героя для ветки I, II, III

export const PASSIVES = [
  { id: 'vit', name: 'Живучесть', icon: 'heart', color: '#ff5050', max: 5, desc: '+12% здоровья' },
  { id: 'pow', name: 'Мощь', icon: 'fist', color: '#ff9a3c', max: 5, desc: '+8% урона' },
  { id: 'crit', name: 'Меткость', icon: 'eye', color: '#ffe060', max: 5, desc: '+4% шанс крита' },
  { id: 'cdr', name: 'Ритм', icon: 'hourglass', color: '#9ad8ff', max: 5, desc: '−5% перезарядки' },
  { id: 'spd', name: 'Проворство', icon: 'boot', color: '#8affa0', max: 3, desc: '+5% скорости' },
  { id: 'leech', name: 'Жажда', icon: 'fang', color: '#ff4040', max: 3, desc: 'Лечение 1.5% за убийство' },
  { id: 'mag', name: 'Магнетизм', icon: 'magnet', color: '#c9a8ff', max: 2, desc: '+40% радиус сбора' },
];

// Дары алтарей — временные, до гибели героя (как в рогаликах).
export const BOONS = [
  { id: 'burn', name: 'Пепельное касание', icon: 'flame', color: '#ff7a2a', max: 3, desc: (l) => `Удары поджигают: ${4 * l} урона/с на 3 с.` },
  { id: 'chain', name: 'Цепная молния', icon: 'chain', color: '#9ad8ff', max: 3, desc: (l) => `${10 + l * 5}% шанс молнии на ${2 + l} цели.` },
  { id: 'chill', name: 'Хлад Бездны', icon: 'frost', color: '#9af0ff', max: 3, desc: (l) => `Удары замедляют на ${15 + l * 10}%.` },
  { id: 'vamp', name: 'Вампиризм', icon: 'vamp', color: '#ff4a4a', max: 3, desc: (l) => `Лечение ${l * 0.6}% урона.` },
  { id: 'burst', name: 'Костяные осколки', icon: 'burst', color: '#e8dcc0', max: 3, desc: (l) => `Враги взрываются при смерти (${8 * l} урона).` },
  { id: 'aegis', name: 'Эгида', icon: 'shield', color: '#8ae0ff', max: 3, desc: (l) => `Щит на ${15 * l} урона, восстанавливается.` },
  { id: 'haste', name: 'Попутный ветер', icon: 'wind', color: '#8affa0', max: 3, desc: (l) => `+${8 * l}% скорости и −${5 * l}% перезарядки.` },
  { id: 'echo', name: 'Эхо', icon: 'double', color: '#ffe080', max: 3, desc: (l) => `${10 * l}% шанс повторить основную атаку.` },
  { id: 'greed', name: 'Жадность', icon: 'coin', color: '#ffd040', max: 3, desc: (l) => `+${25 * l}% золота и опыта.` },
  { id: 'storm', name: 'Гроза', icon: 'storm', color: '#c9a8ff', max: 3, desc: (l) => `Каждые ${5 - l} с молния бьёт ближайшего врага.` },
  { id: 'might', name: 'Сила титана', icon: 'fist', color: '#ff9a3c', max: 3, desc: (l) => `+${15 * l}% урона.` },
];

// Монстры. hp/dmg — на уровне 1. ai: melee | ranged | charger | exploder | caster | boss
export const ENEMIES = {
  ghoul: { name: 'Гуль', sprite: 'ghoul', hp: 26, dmg: 8, speed: 2.1, r: 0.32, ai: 'melee', xp: 3, range: 0.9 },
  skelWarrior: { name: 'Скелет', sprite: 'skelWarrior', hp: 32, dmg: 10, speed: 2.4, r: 0.32, ai: 'melee', xp: 4, range: 1.0 },
  skelArcher: { name: 'Костяной лучник', sprite: 'skelArcher', hp: 20, dmg: 9, speed: 2.0, r: 0.3, ai: 'ranged', xp: 4, range: 7, proj: 'bone' },
  hound: { name: 'Могильный пёс', sprite: 'hound', hp: 18, dmg: 7, speed: 4.4, r: 0.3, ai: 'melee', xp: 3, range: 0.9 },
  brute: { name: 'Труподел', sprite: 'brute', hp: 140, dmg: 22, speed: 1.6, r: 0.55, ai: 'melee', xp: 18, range: 1.4, heavy: true },
  imp: { name: 'Бес', sprite: 'imp', hp: 22, dmg: 9, speed: 3.0, r: 0.3, ai: 'ranged', xp: 4, range: 6, proj: 'fire', fly: true },
  ashHound: { name: 'Пепельный пёс', sprite: 'ashHound', hp: 26, dmg: 9, speed: 4.6, r: 0.3, ai: 'melee', xp: 4, range: 0.9 },
  cinder: { name: 'Тлеющий', sprite: 'cinder', hp: 18, dmg: 28, speed: 3.2, r: 0.32, ai: 'exploder', xp: 4, range: 1.1 },
  magmaGolem: { name: 'Магмовый голем', sprite: 'magmaGolem', hp: 180, dmg: 24, speed: 1.4, r: 0.6, ai: 'melee', xp: 22, range: 1.5, heavy: true },
  wraith: { name: 'Призрак', sprite: 'wraith', hp: 30, dmg: 11, speed: 3.2, r: 0.3, ai: 'melee', xp: 5, range: 0.9, fly: true },
  shade: { name: 'Тень Бездны', sprite: 'shade', hp: 34, dmg: 11, speed: 4.8, r: 0.32, ai: 'melee', xp: 5, range: 0.9 },
  voidCaster: { name: 'Безликий', sprite: 'voidCaster', hp: 34, dmg: 12, speed: 2.2, r: 0.32, ai: 'ranged', xp: 6, range: 7, proj: 'void', fly: true },
  frostGuard: { name: 'Ледяной страж', sprite: 'frostGuard', hp: 200, dmg: 26, speed: 1.7, r: 0.55, ai: 'melee', xp: 24, range: 1.5, heavy: true },
  // боссы
  shepherd: { name: 'Пастырь Костей', sprite: 'shepherd', hp: 1400, dmg: 24, speed: 1.6, r: 0.9, ai: 'boss', xp: 250, range: 1.8, boss: 'shepherd' },
  crucible: { name: 'Горнило', sprite: 'crucible', hp: 2400, dmg: 32, speed: 1.4, r: 1.1, ai: 'boss', xp: 420, range: 2.2, boss: 'crucible' },
  abyss: { name: 'Око Бездны', sprite: 'abyss', hp: 3600, dmg: 36, speed: 1.2, r: 1.2, ai: 'boss', xp: 700, range: 2.0, boss: 'abyss', fly: true },
};

export const ELITE_AFFIX = [
  { id: 'fast', name: 'Быстрый', desc: 'скорость' },
  { id: 'tough', name: 'Каменный', desc: 'здоровье' },
  { id: 'fire', name: 'Пылающий', desc: 'огненная аура' },
  { id: 'vamp', name: 'Кровопийца', desc: 'лечится ударами' },
  { id: 'summ', name: 'Повелитель', desc: 'призывает слуг' },
  { id: 'frost', name: 'Ледяной', desc: 'замедляет' },
];
export const ELITE_NAMES = ['Гнилозуб', 'Мрачень', 'Костолом', 'Пеплокрад', 'Скорбный', 'Чернокрыл', 'Вой Глубин', 'Хрипун', 'Мор', 'Палач Лик'];

export const BIOME_MOBS = {
  crypt: { common: ['ghoul', 'ghoul', 'skelWarrior', 'skelArcher', 'hound'], heavy: ['brute'] },
  forge: { common: ['ashHound', 'imp', 'cinder', 'cinder', 'skelWarrior'], heavy: ['magmaGolem'] },
  frost: { common: ['wraith', 'shade', 'voidCaster', 'voidCaster', 'skelArcher'], heavy: ['frostGuard'] },
};

export const AREAS = [
  { name: 'Пепельный склеп', biome: 'crypt', lvl: 1, obj: ['obelisk', 'elite'], size: 64 },
  { name: 'Галерея костей', biome: 'crypt', lvl: 3, obj: ['ritual', 'obelisk'], size: 72 },
  { name: 'Престол Пастыря', biome: 'crypt', lvl: 5, obj: ['boss'], boss: 'shepherd', size: 60 },
  { name: 'Шлаковые копи', biome: 'forge', lvl: 7, obj: ['elite', 'obelisk'], size: 72 },
  { name: 'Река магмы', biome: 'forge', lvl: 9, obj: ['ritual', 'elite'], size: 78 },
  { name: 'Сердце Горнила', biome: 'forge', lvl: 11, obj: ['boss'], boss: 'crucible', size: 62 },
  { name: 'Стылые залы', biome: 'frost', lvl: 13, obj: ['obelisk', 'ritual'], size: 78 },
  { name: 'Безмолвный ледник', biome: 'frost', lvl: 15, obj: ['elite', 'obelisk', 'ritual'], size: 84 },
  { name: 'Око Бездны', biome: 'frost', lvl: 17, obj: ['boss'], boss: 'abyss', size: 64 },
];

export const OBJ_TEXT = {
  obelisk: (d, n) => `Разрушить обелиски порчи ${d}/${n}`,
  elite: (d, n, name) => `Убить вожака: ${name}`,
  ritual: (d, n) => `Провести ритуал ${Math.floor(d)}%`,
  boss: (d, n, name) => `Победить: ${name}`,
};

export const xpForLevel = (lvl) => Math.round(22 * Math.pow(lvl, 1.55));
export const MAX_LEVEL = 40;
