const L = '[\\p{L}\\p{N}_]';
const BOUNDARY = `(?:(?<!${L})(?=${L})|(?<=${L})(?!${L}))`;
function rx(r: RegExp, flags = 'iu'): RegExp {
  return new RegExp(r.source.replace(/\\b/g, BOUNDARY).replace(/\\w/g, L), flags);
}

export const DIRECTIONS = [
  { id: 'backend', label: 'Backend', emoji: '⚙️' },
  { id: 'frontend', label: 'Frontend', emoji: '🖥' },
  { id: 'mobile', label: 'Мобильная разработка', emoji: '📱' },
  { id: 'qa', label: 'Тестирование (QA)', emoji: '🧪' },
  { id: 'data', label: 'Аналитика данных', emoji: '📊' },
  { id: 'ml', label: 'ML / Data Science', emoji: '🤖' },
  { id: 'devops', label: 'DevOps / SRE', emoji: '🛠' },
  { id: 'security', label: 'Кибербезопасность', emoji: '🛡' },
  { id: 'analyst', label: 'Системный / бизнес-анализ', emoji: '🧩' },
  { id: 'design', label: 'UX/UI-дизайн', emoji: '🎨' },
  { id: 'onec', label: '1С-разработка', emoji: '🧾' },
  { id: 'gamedev', label: 'GameDev', emoji: '🎮' },
  { id: 'product', label: 'Продукт / проекты', emoji: '🚀' },
  { id: 'other', label: 'Другое в IT', emoji: '💡' },
] as const;

export type DirectionId = (typeof DIRECTIONS)[number]['id'];
export const DIRECTION_IDS = DIRECTIONS.map((d) => d.id) as DirectionId[];

export function directionLabel(id: string): string {
  return DIRECTIONS.find((d) => d.id === id)?.label ?? id;
}

const DIRECTION_RULES: [DirectionId, RegExp][] = [
  ['onec', rx(/\b1\s?[сc]\b|1[сc]-/)],
  ['security', rx(/безопасн|security|pentest|пентест|\bsoc\b|appsec|кибер/)],
  ['ml', rx(/\bml\b|machine learning|машинн\w* обучен|data scien|computer vision|\bnlp\b|\bllm\b|нейросет|deep learning/)],
  ['analyst', rx(/системн\w* аналит|бизнес[- ]аналит|system analy|business analy/)],
  ['data', rx(/аналитик|data analy|data engineer|дата-инженер|\bbi\b|\bdwh\b|analyst/)],
  ['devops', rx(/devops|\bsre\b|инфраструктур|kubernetes|системн\w* администр|сисадмин|администратор/)],
  ['qa', rx(/\bqa\b|\baqa\b|тестировщ|quality assurance|автотест|функциональн\w* тестир|ручн\w* тестир|тестирован\w* по\b/)],
  ['mobile', rx(/android|\bios\b|mobile|мобильн|flutter|swift/)],
  ['frontend', rx(/front[- ]?end|фронтенд|верстальщ|react|\bvue|angular|веб-разработ/)],
  ['gamedev', rx(/gamedev|геймдев|unity|unreal|игров/)],
  ['design', rx(/дизайн|design|\bux\b|\bui\b|figma/)],
  ['product', rx(/product manager|продакт|project manager|менеджер\w* проект|продукт/)],
  ['backend', rx(/back[- ]?end|бэкенд|бекенд|\bjava\b|python|golang|\bgo\b|c\+\+|c#|\.net|\bphp|node\.?js|разработчик|разработк|программист|developer|engineer|инженер/)],
];

export function classifyDirection(text: string): DirectionId {
  for (const [id, re] of DIRECTION_RULES) if (re.test(text)) return id;
  return 'other';
}

const IT_RE = rx(
  /разработ|программист|developer|devops|тестировщ|\bqa\b|аналитик данных|data|\bml\b|frontend|backend|фронтенд|бэкенд|\b1[сc]\b|python|\bjava\b|golang|c\+\+|c#|javascript|typescript|\bsql\b|linux|\bweb\b|веб-|\bit\b|айти|информационн\w* технолог|кибер|системн\w* администр|системн\w* аналит|ux\/ui/,
);
export function looksLikeIT(text: string): boolean {
  return IT_RE.test(text);
}

const INTERN_RE = rx(/стаж[её]р|стажировк|практикант|\bintern|trainee|без опыта|студент|начинающ|junior|младш/);
export function looksLikeInternship(text: string): boolean {
  return INTERN_RE.test(text);
}

const STACK: { id: string; re: RegExp }[] = [
  { id: 'Python', re: rx(/python|django|fastapi|flask|pandas/) },
  { id: 'Java', re: rx(/\bjava\b|spring/) },
  { id: 'Kotlin', re: rx(/kotlin/) },
  { id: 'Go', re: rx(/\bgolang\b|\bGo\b/, 'u') },
  { id: 'C++', re: rx(/c\+\+/) },
  { id: 'C#', re: rx(/c#|\.net\b|unity/) },
  { id: 'JavaScript', re: rx(/javascript|\bjs\b|node\.?js/) },
  { id: 'TypeScript', re: rx(/typescript/) },
  { id: 'React', re: rx(/react/) },
  { id: 'Vue', re: rx(/\bvue/) },
  { id: 'PHP', re: rx(/\bphp|laravel|symfony/) },
  { id: 'Swift', re: rx(/swift|\bios\b/) },
  { id: 'Android', re: rx(/android/) },
  { id: 'Flutter', re: rx(/flutter|\bdart\b/) },
  { id: 'SQL', re: rx(/\bsql|postgres|mysql|clickhouse|oracle|greenplum|\bсубд\b|баз\w* данных/) },
  { id: 'Linux', re: rx(/linux|\bbash\b|unix/) },
  { id: 'Docker', re: rx(/docker|kubernetes|\bk8s\b/) },
  { id: 'Git', re: rx(/\bgit\b|github|gitlab/) },
  { id: 'ML', re: rx(/pytorch|tensorflow|scikit|sklearn|машинн\w* обучен|machine learning|\bml\b/) },
  { id: '1С', re: rx(/\b1\s?[сc]\b/) },
  { id: 'Figma', re: rx(/figma/) },
  { id: 'Excel/BI', re: rx(/excel|power bi|tableau|datalens|superset/) },
  { id: 'Rust', re: rx(/\brust\b/) },
];

export const STACK_IDS = STACK.map((s) => s.id);

export function extractStack(text: string): string[] {
  return STACK.filter((s) => s.re.test(text)).map((s) => s.id);
}

export const FORMATS = [
  { id: 'remote', label: 'Удалённо' },
  { id: 'hybrid', label: 'Гибрид' },
  { id: 'office', label: 'Офис' },
] as const;

export const QUICK_CITIES = ['Казань', 'Иннополис', 'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург'];

export function normalizeCity(raw: string): string {
  return raw
    .replace(/^(г\.?|город)\s+/iu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
