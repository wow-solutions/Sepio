import type { ReactNode } from "react";
import type { Locale } from "@/i18n/routing";

/* Landing copy for all three locales. en + es are the locked handoff copy
   (Sepio Landing.html); ru is translated. Rich strings (emphasis, line breaks)
   are React nodes; the trailing "o" rule and brand names (LinkedIn, Sepio…),
   prices, icons and times are NOT translated and live in page.tsx. The
   Record<Locale, …> type makes TypeScript flag any locale that drops a key. */

const em = (s: ReactNode) => <em>{s}</em>;

export type LandingCopy = {
  nav: { howItWorks: string; platforms: string; features: string; pricing: string; faq: string; signIn: string; startFree: string };
  hero: { eyebrow: string; h1: ReactNode; lede: ReactNode; startFree: string; seeHow: string; tagLive: string; tag6: string; tagSchedule: string; tagNoCard: string };
  logosHeading: string;
  how: {
    eyebrow: string; h2: ReactNode; lede: string;
    steps: { num: string; title: ReactNode; body: string }[];
    write: ReactNode;
    adaptDesc: string[];
  };
  demo: {
    eyebrow: string; h2: ReactNode; lede: ReactNode;
    channelsLabel: string; connect: string; statusLive: string; statusDraft: string;
    postTitle: ReactNode; postMeta: string;
    editor: ReactNode[];
    previewLabel: string; pcSub: string; pcText1: ReactNode; pcText2: string;
  };
  platforms: { eyebrow: string; h2: ReactNode; lede: string; fmt: string[] };
  features: { eyebrow: string; h2: ReactNode; items: { title: ReactNode; body: string }[] };
  testimonial: { quote: ReactNode; role: string };
  pricing: {
    eyebrow: string; h2: ReactNode; perMonth: string; badge: string;
    tiers: { tier: string; name: ReactNode; sub: string; features: string[]; cta: string }[];
  };
  faq: { eyebrow: string; h2: ReactNode; items: { q: string; a: ReactNode }[] };
  finalCta: { h2: ReactNode; lede: string; startFree: string; bookDemo: string };
  footer: { desc: string; cols: { title: string; links: string[] }[]; legalRight: string };
};

const en: LandingCopy = {
  nav: { howItWorks: "How it works", platforms: "Platforms", features: "Features", pricing: "Pricing", faq: "FAQ", signIn: "Sign in", startFree: "Start free" },
  hero: {
    eyebrow: "Now in beta · for marketing operators",
    h1: <>One brand.<br />{em("Every")} feed.</>,
    lede: <>Sepio publishes one voice across {em("LinkedIn, Telegram, Instagram, TikTok, Threads and your blog")} — adapting format, length and tone to each platform, on the schedule you set.</>,
    startFree: "Start free", seeHow: "See how it works",
    tagLive: "Live now", tag6: "6 platforms", tagSchedule: "Schedule weeks ahead", tagNoCard: "No credit card",
  },
  logosHeading: "Trusted by operators at",
  how: {
    eyebrow: "How it works · three steps",
    h2: <>Write once.<br />Sepio handles the {em("rest.")}</>,
    lede: "No more rewriting the same idea six times. One source of truth, six platforms, one voice — at the cadence your audience expects.",
    steps: [
      { num: "01 · Compose", title: <>{em("Write")} in one editor.</>, body: "A clean Markdown surface, optimised for long-form thinking. Headings, lists, links — everything translates cleanly downstream." },
      { num: "02 · Adapt", title: <>Sepio shapes each {em("platform.")}</>, body: "LinkedIn gets a hook and a P.S. TikTok gets a 9:16 cover and a script. Telegram gets the long version. You stay one voice." },
      { num: "03 · Schedule", title: <>Publish on {em("your")} schedule.</>, body: "Set posting windows per platform once. Sepio drops each version into its slot — review and approve, or let it run." },
    ],
    write: <>Three lessons from {em("Q4")}.<br /><br />The cuttlefish doesn&apos;t choose its arms — each one runs its own errand while one brain stays focused on the next move</>,
    adaptDesc: ["Hook + 3 bullets + P.S. ~ 280 words", "Full essay, headers, no cap", "3-thread version, 500 chars each", "Carousel · 7 slides · caption 220c", "9:16 cover + 60s script", "Markdown + meta + cover"],
  },
  demo: {
    eyebrow: "The product · live demo",
    h2: <>A composer that {em("knows")}<br />where each post lands.</>,
    lede: <>Write in the middle. Channels in the rail. Live preview in the panel — exactly how the post will look in the app it&apos;s heading to.</>,
    channelsLabel: "Channels", connect: "+ Connect channel", statusLive: "live", statusDraft: "draft",
    postTitle: <>Three lessons from {em("Q4.")}</>, postMeta: "Wed · 09:00 · 6 platforms",
    editor: [
      <><em>The cuttlefish</em> doesn&apos;t choose which arm moves — each runs its own errand while one brain stays focused on the next move.</>,
      <>Marketing automation works the same way. You don&apos;t write six posts; you write one voice and let the system shape each platform.</>,
      <>Three lessons that worked for us in Q4</>,
    ],
    previewLabel: "Preview · LinkedIn", pcSub: "Founder · Sepio • 1d",
    pcText1: <>The cuttlefish doesn&apos;t choose which arm moves. <strong>Marketing automation works the same way.</strong></>,
    pcText2: "3 lessons that worked for us in Q4 ↓",
  },
  platforms: {
    eyebrow: "Six platforms · one composer",
    h2: <>Native shapes for {em("every")} feed.</>,
    lede: "Each platform gets a version that reads as if written specifically for it — never reposted from somewhere else.",
    fmt: ["Hook + post", "Long form", "Carousel", "9:16 + script", "3-thread", "SEO + meta"],
  },
  features: {
    eyebrow: "Built for operators",
    h2: <>Everything you need.<br />{em("Nothing")} you don&apos;t.</>,
    items: [
      { title: <>Brand {em("voice")} memory.</>, body: "Sepio learns your phrasing, your favourite metaphors, the words you'd never use. Every adapted post sounds like you — not like a template." },
      { title: <>Weeks of {em("schedule.")}</>, body: "Plan a quarter in one afternoon. Sepio holds the queue, surfaces gaps, and reshuffles when you push something new to the top." },
      { title: <>Approve before {em("publish.")}</>, body: "Review every variation in the platform's native preview. Tap to publish, tap to hold, tap to rewrite — no surprises after it goes out." },
      { title: <>Reach across {em("platforms.")}</>, body: "One dashboard for what worked, where. Cross-platform analytics that compares performance honestly — not LinkedIn-only vanity metrics." },
    ],
  },
  testimonial: {
    quote: <><em>“</em>I used to spend Sundays rewriting Monday&apos;s post six times. Now I write it once on Friday and Sepio runs the week. It paid for itself in {em("nine days.")}<em>”</em></>,
    role: "Marketing consultant · 18 clients",
  },
  pricing: {
    eyebrow: "Pricing · monthly, cancel anytime",
    h2: <>Operator-priced.<br />Not {em("enterprise")}-priced.</>,
    perMonth: "month", badge: "most chosen",
    tiers: [
      { tier: "Solo", name: <>For {em("one")} brand.</>, sub: "Founders writing for themselves.", features: ["1 brand voice", "6 platforms connected", "30 scheduled posts / month", "Native previews", "No team seats"], cta: "Start free" },
      { tier: "Operator", name: <>For {em("marketing")} consultants.</>, sub: "Ship for multiple clients without burning out.", features: ["10 brand voices", "Unlimited platforms", "Unlimited posts", "5 team seats", "Approval workflows", "Cross-platform analytics"], cta: "Start free trial" },
      { tier: "Studio", name: <>For {em("agencies.")}</>, sub: "Run dozens of accounts under one roof.", features: ["Unlimited brand voices", "White-label client portal", "Unlimited seats", "SSO + audit log", "Priority support"], cta: "Talk to sales" },
    ],
  },
  faq: {
    eyebrow: "Common questions",
    h2: <>{em("FAQ")} — answers, briefly.</>,
    items: [
      { q: "Will my posts sound AI-written?", a: <>No. Sepio adapts {em("your")} writing, it doesn&apos;t generate new copy from a prompt. We never replace your voice — we restructure it for each platform&apos;s format.</> },
      { q: "Which platforms do you support today?", a: <>LinkedIn, Telegram, Instagram, TikTok, Threads, and any blog via RSS or direct API. {em("X (Twitter)")} is in beta — ask if you need access.</> },
      { q: "Can I review before each post goes live?", a: <>Always. Every variation lands in a {em("review queue")} by default. You can switch on auto-publish per channel once you trust the output.</> },
      { q: "Is my content stored privately?", a: <>Yes. Your drafts, brand voice, and scheduling data stay {em("encrypted")} and never feed any shared model. SOC 2 Type II audit in 2026.</> },
    ],
  },
  finalCta: {
    h2: <>One {em("brand,")}<br />every {em("feed.")}</>,
    lede: "14-day trial. No credit card. Connect your platforms in under three minutes.",
    startFree: "Start free", bookDemo: "Book a demo",
  },
  footer: {
    desc: "An operator-grade publishing automation. One brand voice, every feed — built around the cephalopod metaphor for a reason.",
    cols: [
      { title: "Product", links: ["How it works", "Features", "Platforms", "Pricing"] },
      { title: "Company", links: ["About", "Blog", "Changelog", "Careers"] },
      { title: "Resources", links: ["Docs", "API", "Templates", "Status"] },
      { title: "Legal", links: ["Privacy", "Terms", "Security", "DPA"] },
    ],
    legalRight: "Made for operators, not marketers",
  },
};

const es: LandingCopy = {
  nav: { howItWorks: "Cómo funciona", platforms: "Plataformas", features: "Funciones", pricing: "Precios", faq: "FAQ", signIn: "Iniciar sesión", startFree: "Empezar gratis" },
  hero: {
    eyebrow: "Ahora en beta · para operadores de marketing",
    h1: <>Una marca.<br />{em("Cada")} feed.</>,
    lede: <>Sepio publica una sola voz en {em("LinkedIn, Telegram, Instagram, TikTok, Threads y tu blog")} — adaptando formato, extensión y tono a cada plataforma, en el horario que decidas.</>,
    startFree: "Empezar gratis", seeHow: "Cómo funciona",
    tagLive: "En vivo", tag6: "6 plataformas", tagSchedule: "Programación semanal", tagNoCard: "Sin tarjeta",
  },
  logosHeading: "Usado por operadores en",
  how: {
    eyebrow: "Cómo funciona · tres pasos",
    h2: <>Escribe una vez.<br />Sepio se encarga del {em("resto.")}</>,
    lede: "Ya no reescribas la misma idea seis veces. Una fuente, seis plataformas, una voz — al ritmo que tu audiencia espera.",
    steps: [
      { num: "01 · Redactar", title: <>{em("Escribe")} en un editor.</>, body: "Un editor Markdown limpio, optimizado para pensar largo. Títulos, listas, enlaces — todo se traduce limpio en cada destino." },
      { num: "02 · Adaptar", title: <>Sepio adapta a cada {em("plataforma.")}</>, body: "LinkedIn recibe un gancho y un P.D. TikTok recibe una portada 9:16 y un guion. Telegram recibe la versión larga. Tú sigues siendo una sola voz." },
      { num: "03 · Programar", title: <>Publica en {em("tu")} horario.</>, body: "Configura ventanas de publicación una vez por plataforma. Sepio lanza cada versión en su slot — revisas y apruebas, o lo dejas correr." },
    ],
    write: <>Tres lecciones del {em("Q4")}.<br /><br />La sepia no elige sus brazos — cada uno hace su tarea mientras un solo cerebro se queda en la siguiente jugada</>,
    adaptDesc: ["Gancho + 3 viñetas + P.D.", "Ensayo completo, sin límite", "Hilo de 3, 500 caracteres", "Carrusel · 7 slides · caption", "Portada 9:16 + guion 60s", "Markdown + meta + portada"],
  },
  demo: {
    eyebrow: "El producto · demo en vivo",
    h2: <>Un editor que {em("sabe")}<br />dónde aterriza cada post.</>,
    lede: <>Escribe en el centro. Canales en el rail. Vista previa en el panel — exactamente como se verá el post en la app a la que va.</>,
    channelsLabel: "Canales", connect: "+ Conectar canal", statusLive: "vivo", statusDraft: "borrador",
    postTitle: <>Tres lecciones del {em("Q4.")}</>, postMeta: "Mié · 09:00 · 6 plataformas",
    editor: [
      <><em>La sepia</em> no elige qué brazo mover — cada uno hace su tarea mientras un solo cerebro se queda en la siguiente jugada.</>,
      <>El marketing automatizado funciona igual. No escribes seis posts; escribes una voz y dejas que el sistema dé forma a cada plataforma.</>,
      <>Tres lecciones que nos funcionaron en Q4</>,
    ],
    previewLabel: "Vista previa · LinkedIn", pcSub: "Fundadora · Sepio • 1d",
    pcText1: <>La sepia no elige qué brazo mover. <strong>El marketing automatizado funciona igual.</strong></>,
    pcText2: "3 lecciones que nos funcionaron en Q4 ↓",
  },
  platforms: {
    eyebrow: "Seis plataformas · un editor",
    h2: <>Formato nativo para {em("cada")} feed.</>,
    lede: "Cada plataforma recibe una versión que se lee como escrita específicamente para ella — nunca reposteada de otro sitio.",
    fmt: ["Gancho + post", "Forma larga", "Carrusel", "9:16 + guion", "Hilo de 3", "SEO + meta"],
  },
  features: {
    eyebrow: "Construido para operadores",
    h2: <>Todo lo necesario.<br />{em("Nada")} de más.</>,
    items: [
      { title: <>Memoria de la {em("voz")} de marca.</>, body: "Sepio aprende tu forma de hablar, tus metáforas favoritas, las palabras que nunca usarías. Cada post adaptado suena como tú — no como una plantilla." },
      { title: <>Semanas de {em("programación.")}</>, body: "Planea un trimestre en una tarde. Sepio mantiene la cola, muestra huecos y reordena cuando subes algo nuevo arriba." },
      { title: <>Aprueba antes de {em("publicar.")}</>, body: "Revisa cada variación en la vista previa nativa. Tap para publicar, tap para retener, tap para reescribir — sin sorpresas al salir." },
      { title: <>Alcance entre {em("plataformas.")}</>, body: "Un panel para ver qué funcionó y dónde. Analítica que compara entre plataformas honestamente — no solo métricas vanidosas de LinkedIn." },
    ],
  },
  testimonial: {
    quote: <><em>“</em>Antes pasaba los domingos reescribiendo seis veces el post del lunes. Ahora lo escribo una vez el viernes y Sepio mueve la semana. Se pagó solo en {em("nueve días.")}<em>”</em></>,
    role: "Consultor de marketing · 18 clientes",
  },
  pricing: {
    eyebrow: "Precios · mensual, cancela cuando quieras",
    h2: <>Precio de operador.<br />No de {em("empresa.")}</>,
    perMonth: "mes", badge: "más elegido",
    tiers: [
      { tier: "Solo", name: <>Para {em("una")} marca.</>, sub: "Fundadores que escriben para sí mismos.", features: ["1 voz de marca", "6 plataformas conectadas", "30 posts programados / mes", "Vistas previas nativas", "Sin asientos de equipo"], cta: "Empezar gratis" },
      { tier: "Operador", name: <>Para {em("consultores")} de marketing.</>, sub: "Publica para varios clientes sin quemarte.", features: ["10 voces de marca", "Plataformas ilimitadas", "Posts ilimitados", "5 asientos de equipo", "Flujos de aprobación", "Analítica multiplataforma"], cta: "Probar gratis" },
      { tier: "Estudio", name: <>Para {em("agencias.")}</>, sub: "Gestiona docenas de cuentas bajo un techo.", features: ["Voces ilimitadas", "Portal de cliente white-label", "Asientos ilimitados", "SSO + log de auditoría", "Soporte prioritario"], cta: "Hablar con ventas" },
    ],
  },
  faq: {
    eyebrow: "Preguntas comunes",
    h2: <>{em("FAQ")} — respuestas breves.</>,
    items: [
      { q: "¿Mis posts sonarán a IA?", a: <>No. Sepio adapta {em("tu")} escritura, no genera copy nuevo desde un prompt. Nunca reemplazamos tu voz — reestructuramos para el formato de cada plataforma.</> },
      { q: "¿Qué plataformas soportan hoy?", a: <>LinkedIn, Telegram, Instagram, TikTok, Threads y cualquier blog vía RSS o API directa. {em("X (Twitter)")} está en beta — pide acceso si lo necesitas.</> },
      { q: "¿Puedo revisar antes de publicar?", a: <>Siempre. Cada variación entra a una {em("cola de revisión")} por defecto. Activas auto-publicación por canal cuando confíes en el resultado.</> },
      { q: "¿Mi contenido se guarda en privado?", a: <>Sí. Tus borradores, voz de marca y datos quedan {em("encriptados")} y nunca alimentan ningún modelo compartido. SOC 2 Tipo II en 2026.</> },
    ],
  },
  finalCta: {
    h2: <>Una {em("marca,")}<br />cada {em("feed.")}</>,
    lede: "Prueba de 14 días. Sin tarjeta. Conecta tus plataformas en menos de tres minutos.",
    startFree: "Empezar gratis", bookDemo: "Pedir demo",
  },
  footer: {
    desc: "Una automatización de publicaciones nivel operador. Una voz de marca, cada feed — construida con metáfora cefalópoda por una razón.",
    cols: [
      { title: "Producto", links: ["Cómo funciona", "Funciones", "Plataformas", "Precios"] },
      { title: "Empresa", links: ["Acerca de", "Blog", "Cambios", "Trabaja"] },
      { title: "Recursos", links: ["Documentación", "API", "Plantillas", "Estado"] },
      { title: "Legal", links: ["Privacidad", "Términos", "Seguridad", "DPA"] },
    ],
    legalRight: "Hecho para operadores, no para marketers",
  },
};

const ru: LandingCopy = {
  nav: { howItWorks: "Как работает", platforms: "Платформы", features: "Возможности", pricing: "Цены", faq: "Вопросы", signIn: "Войти", startFree: "Начать бесплатно" },
  hero: {
    eyebrow: "Сейчас в бете · для маркетинг-операторов",
    h1: <>Один бренд.<br />{em("Каждая")} лента.</>,
    lede: <>Sepio публикует один голос в {em("LinkedIn, Telegram, Instagram, TikTok, Threads и твоём блоге")} — подстраивая формат, длину и тон под каждую платформу, по расписанию, которое ты задаёшь.</>,
    startFree: "Начать бесплатно", seeHow: "Как это работает",
    tagLive: "В эфире", tag6: "6 платформ", tagSchedule: "Расписание на недели", tagNoCard: "Без карты",
  },
  logosHeading: "Им пользуются операторы из",
  how: {
    eyebrow: "Как это работает · три шага",
    h2: <>Напиши один раз.<br />Sepio сделает {em("остальное.")}</>,
    lede: "Хватит переписывать одну идею шесть раз. Один источник, шесть платформ, один голос — в ритме, которого ждёт твоя аудитория.",
    steps: [
      { num: "01 · Написать", title: <>{em("Пиши")} в одном редакторе.</>, body: "Чистый Markdown-редактор для длинных мыслей. Заголовки, списки, ссылки — всё аккуратно переносится дальше." },
      { num: "02 · Адаптировать", title: <>Sepio подгоняет каждую {em("платформу.")}</>, body: "LinkedIn получает хук и P.S. TikTok — обложку 9:16 и сценарий. Telegram — длинную версию. А голос остаётся один." },
      { num: "03 · Запланировать", title: <>Публикуй по {em("своему")} расписанию.</>, body: "Один раз задай окна публикации для каждой платформы. Sepio раскладывает версии по слотам — проверяй и подтверждай, или пусть идёт само." },
    ],
    write: <>Три урока из {em("Q4")}.<br /><br />Каракатица не выбирает свои руки — каждая делает своё дело, пока один мозг сосредоточен на следующем ходе</>,
    adaptDesc: ["Хук + 3 пункта + P.S. ~ 280 слов", "Полное эссе, без лимита", "Тред из 3, по 500 знаков", "Карусель · 7 слайдов · подпись", "Обложка 9:16 + сценарий 60с", "Markdown + мета + обложка"],
  },
  demo: {
    eyebrow: "Продукт · живое демо",
    h2: <>Редактор, который {em("знает,")}<br />где окажется каждый пост.</>,
    lede: <>Пиши по центру. Каналы — в рейле. Превью — в панели, ровно так, как пост будет выглядеть в нужном приложении.</>,
    channelsLabel: "Каналы", connect: "+ Подключить канал", statusLive: "в эфире", statusDraft: "черновик",
    postTitle: <>Три урока из {em("Q4.")}</>, postMeta: "Ср · 09:00 · 6 платформ",
    editor: [
      <><em>Каракатица</em> не выбирает, какой рукой двигать — каждая делает своё дело, пока один мозг держит следующий ход.</>,
      <>Маркетинговая автоматизация работает так же. Ты не пишешь шесть постов; ты пишешь один голос, а система придаёт форму каждой платформе.</>,
      <>Три урока, которые сработали у нас в Q4</>,
    ],
    previewLabel: "Превью · LinkedIn", pcSub: "Основатель · Sepio • 1д",
    pcText1: <>Каракатица не выбирает, какой рукой двигать. <strong>Маркетинговая автоматизация работает так же.</strong></>,
    pcText2: "3 урока, которые сработали у нас в Q4 ↓",
  },
  platforms: {
    eyebrow: "Шесть платформ · один редактор",
    h2: <>Родной формат для {em("каждой")} ленты.</>,
    lede: "Каждая платформа получает версию, которая читается так, будто написана именно для неё — а не перепощена откуда-то ещё.",
    fmt: ["Хук + пост", "Лонгрид", "Карусель", "9:16 + сценарий", "Тред из 3", "SEO + мета"],
  },
  features: {
    eyebrow: "Сделано для операторов",
    h2: <>Всё, что нужно.<br />{em("Ничего")} лишнего.</>,
    items: [
      { title: <>Память {em("голоса")} бренда.</>, body: "Sepio запоминает твои формулировки, любимые метафоры, слова, которые ты бы никогда не использовал. Каждый адаптированный пост звучит как ты — а не как шаблон." },
      { title: <>Недели {em("расписания.")}</>, body: "Спланируй квартал за один вечер. Sepio держит очередь, показывает пробелы и пересобирает её, когда ты ставишь новое наверх." },
      { title: <>Подтверждай до {em("публикации.")}</>, body: "Проверяй каждую версию в родном превью платформы. Тап — опубликовать, тап — придержать, тап — переписать. Никаких сюрпризов после выхода." },
      { title: <>Охват по {em("платформам.")}</>, body: "Одна панель: что сработало и где. Кросс-платформенная аналитика честно сравнивает результаты — а не только тщеславные метрики LinkedIn." },
    ],
  },
  testimonial: {
    quote: <><em>«</em>Раньше я тратил воскресенья, переписывая понедельничный пост по шесть раз. Теперь пишу его один раз в пятницу, и Sepio ведёт всю неделю. Он окупился за {em("девять дней.")}<em>»</em></>,
    role: "Маркетинг-консультант · 18 клиентов",
  },
  pricing: {
    eyebrow: "Цены · помесячно, отмена в любой момент",
    h2: <>Цена оператора.<br />Не {em("корпоративная.")}</>,
    perMonth: "мес", badge: "выбирают чаще",
    tiers: [
      { tier: "Solo", name: <>Для {em("одного")} бренда.</>, sub: "Фаундеры, которые пишут сами.", features: ["1 голос бренда", "6 подключённых платформ", "30 запланированных постов / мес", "Родные превью", "Без мест для команды"], cta: "Начать бесплатно" },
      { tier: "Operator", name: <>Для {em("маркетинг")}-консультантов.</>, sub: "Веди нескольких клиентов, не выгорая.", features: ["10 голосов брендов", "Платформы без лимита", "Посты без лимита", "5 мест для команды", "Согласование", "Кросс-платформенная аналитика"], cta: "Начать бесплатно" },
      { tier: "Studio", name: <>Для {em("агентств.")}</>, sub: "Десятки аккаунтов под одной крышей.", features: ["Голоса без лимита", "White-label портал для клиентов", "Места без лимита", "SSO + журнал аудита", "Приоритетная поддержка"], cta: "Связаться с продажами" },
    ],
  },
  faq: {
    eyebrow: "Частые вопросы",
    h2: <>{em("FAQ")} — коротко по делу.</>,
    items: [
      { q: "Мои посты будут звучать как ИИ?", a: <>Нет. Sepio адаптирует {em("твой")} текст, а не генерирует новый из промпта. Мы не подменяем твой голос — мы перестраиваем его под формат каждой платформы.</> },
      { q: "Какие платформы поддерживаются сейчас?", a: <>LinkedIn, Telegram, Instagram, TikTok, Threads и любой блог через RSS или прямой API. {em("X (Twitter)")} в бете — попроси доступ, если нужно.</> },
      { q: "Можно проверить пост до публикации?", a: <>Всегда. Каждая версия по умолчанию попадает в {em("очередь проверки")}. Авто-публикацию по каналу можно включить, когда начнёшь доверять результату.</> },
      { q: "Мой контент хранится приватно?", a: <>Да. Черновики, голос бренда и расписание {em("шифруются")} и никогда не попадают в общие модели. Аудит SOC 2 Type II в 2026.</> },
    ],
  },
  finalCta: {
    h2: <>Один {em("бренд,")}<br />каждая {em("лента.")}</>,
    lede: "14 дней пробного периода. Без карты. Подключи платформы меньше чем за три минуты.",
    startFree: "Начать бесплатно", bookDemo: "Заказать демо",
  },
  footer: {
    desc: "Автоматизация публикаций уровня оператора. Один голос бренда, каждая лента — и метафора головоногого здесь не случайно.",
    cols: [
      { title: "Продукт", links: ["Как работает", "Возможности", "Платформы", "Цены"] },
      { title: "Компания", links: ["О нас", "Блог", "Изменения", "Вакансии"] },
      { title: "Ресурсы", links: ["Документация", "API", "Шаблоны", "Статус"] },
      { title: "Правовое", links: ["Приватность", "Условия", "Безопасность", "DPA"] },
    ],
    legalRight: "Сделано для операторов, не для маркетологов",
  },
};

export const landingCopy: Record<Locale, LandingCopy> = { en, es, ru };
