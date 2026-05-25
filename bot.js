// ============================================================
//  JOB BOT — Полный код
//  Функции: вакансии по категориям, анкета кандидата,
//           HR-панель (добавить/удалить вакансию, просмотр резюме)
// ============================================================

const TelegramBot = require('node-telegram-bot-api');

// ── НАСТРОЙКИ ──────────────────────────────────────────────
const TOKEN      = '8977491857:AAF1KCcqN9a5GSDb76ugT4pAwU5lGzBhHAs';
const HR_ADMINS  = [527069680];
// ───────────────────────────────────────────────────────────

const bot = new TelegramBot(TOKEN, { polling: true });

// ── ДАННЫЕ (в памяти; для прода замени на БД) ──────────────
let vacancies = [
  { id: 1, title: 'Frontend Developer', company: 'TechCorp',  desc: 'React, TypeScript, 2+ года опыта. Удалённо.', category: 'IT'        },
  { id: 2, title: 'SMM-менеджер',       company: 'AgencyX',   desc: 'Instagram, TikTok, Reels. Опыт от 1 года.',  category: 'Маркетинг' },
  { id: 3, title: 'Менеджер по продажам', company: 'SalesHub', desc: 'B2B, холодные звонки, CRM.',                category: 'Продажи'   },
];

let resumes  = [];   // собранные анкеты
let sessions = {};   // временные сессии (шаги анкеты / добавления вакансии)
// ───────────────────────────────────────────────────────────

// ── КОНСТАНТЫ ──────────────────────────────────────────────
const CATEGORIES = ['IT', 'Маркетинг', 'Продажи', 'Финансы'];

const CAT_EMOJI = {
  'IT':        '💻',
  'Маркетинг': '📣',
  'Продажи':   '💰',
  'Финансы':   '📊',
};

// Шаги анкеты кандидата
const QUESTIONS = [
  { key: 'name',       text: '👤 *Шаг 1/5* — Как тебя зовут? (Имя Фамилия)' },
  { key: 'experience', text: '🗂 *Шаг 2/5* — Сколько лет опыта в этой сфере?' },
  { key: 'skills',     text: '🛠 *Шаг 3/5* — Перечисли ключевые навыки.' },
  { key: 'salary',     text: '💵 *Шаг 4/5* — Желаемая зарплата (в месяц)?' },
  { key: 'contact',    text: '📱 *Шаг 5/5* — Контакт для связи (телефон или @username).' },
];

// Шаги добавления вакансии HR-ом
const VACANCY_STEPS = [
  { key: 'title',    text: '📝 Введи *название должности*:' },
  { key: 'company',  text: '🏢 Введи *название компании*:' },
  { key: 'desc',     text: '📄 Введи *описание и требования*:' },
];
// ───────────────────────────────────────────────────────────

// ── HELPERS ────────────────────────────────────────────────
const isAdmin = (id) => HR_ADMINS.includes(id);

const mainMenu = {
  reply_markup: {
    keyboard: [
      ['📋 Открытые вакансии'],
      ['📄 Заполнить анкету'],
      ['📎 Отправить резюме файлом'],
    ],
    resize_keyboard: true,
  }
};

const hrMenu = {
  reply_markup: {
    keyboard: [
      ['➕ Добавить вакансию', '📋 Мои вакансии'],
      ['📥 Просмотреть резюме'],
      ['🔙 Главное меню'],
    ],
    resize_keyboard: true,
  }
};

function notifyHR(text) {
  HR_ADMINS.forEach(id => bot.sendMessage(id, text, { parse_mode: 'Markdown' }));
}
// ───────────────────────────────────────────────────────────


// ════════════════════════════════════════════════════════════
//  1. СТАРТ
// ════════════════════════════════════════════════════════════
bot.onText(/\/start/, (msg) => {
  delete sessions[msg.chat.id];
  const greeting = isAdmin(msg.chat.id)
    ? `Привет, HR! 👋 Используй /hr для панели администратора.`
    : `Привет, ${msg.from.first_name}! 👋\n\nЯ помогу найти работу или откликнуться на вакансию.`;

  bot.sendMessage(msg.chat.id, greeting, mainMenu);
});


// ════════════════════════════════════════════════════════════
//  2. ПРОСМОТР ВАКАНСИЙ — выбор категории
// ════════════════════════════════════════════════════════════
bot.onText(/📋 Открытые вакансии/, (msg) => {
  delete sessions[msg.chat.id];

  const buttons = CATEGORIES.map(cat => ([{
    text: `${CAT_EMOJI[cat]} ${cat}`,
    callback_data: `cat_${cat}`,
  }]));
  buttons.push([{ text: '🔍 Все вакансии', callback_data: 'cat_all' }]);

  bot.sendMessage(msg.chat.id, '📂 Выбери категорию:', {
    reply_markup: { inline_keyboard: buttons }
  });
});


// ════════════════════════════════════════════════════════════
//  3. ОТПРАВИТЬ РЕЗЮМЕ — запуск анкеты напрямую
// ════════════════════════════════════════════════════════════
bot.onText(/📄 Заполнить анкету/, (msg) => {
  sessions[msg.chat.id] = { type: 'resume', step: 0, answers: {}, vacancyId: null, vacancyTitle: 'Общее резюме' };
  bot.sendMessage(msg.chat.id, QUESTIONS[0].text, { parse_mode: 'Markdown' });
});

// Подсказка для отправки файла
bot.onText(/📎 Отправить резюме файлом/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '📎 Отправь свой файл резюме прямо сюда в чат.\n\n✅ Принимаем: PDF, DOC, DOCX\n📏 Максимальный размер: 20 МБ\n\nПросто прикрепи файл и отправь — мы его получим!',
    { parse_mode: 'Markdown' }
  );
});


// ════════════════════════════════════════════════════════════
//  4. HR — ПАНЕЛЬ
// ════════════════════════════════════════════════════════════
bot.onText(/\/hr/, (msg) => {
  if (!isAdmin(msg.chat.id)) return bot.sendMessage(msg.chat.id, '⛔ Нет доступа.');
  delete sessions[msg.chat.id];
  bot.sendMessage(msg.chat.id, '👨‍💼 *HR-панель*\nВыбери действие:', { parse_mode: 'Markdown', ...hrMenu });
});

bot.onText(/🔙 Главное меню/, (msg) => {
  delete sessions[msg.chat.id];
  bot.sendMessage(msg.chat.id, 'Главное меню:', mainMenu);
});

// Добавить вакансию
bot.onText(/➕ Добавить вакансию/, (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  sessions[msg.chat.id] = { type: 'addVacancy', step: 0, data: {} };
  bot.sendMessage(msg.chat.id, VACANCY_STEPS[0].text, { parse_mode: 'Markdown' });
});

// Мои вакансии
bot.onText(/📋 Мои вакансии/, (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  if (vacancies.length === 0) return bot.sendMessage(msg.chat.id, 'Вакансий пока нет.');

  bot.sendMessage(msg.chat.id, `📋 *Всего вакансий: ${vacancies.length}*`, { parse_mode: 'Markdown' });
  vacancies.forEach(v => {
    bot.sendMessage(msg.chat.id,
      `${CAT_EMOJI[v.category] || '🔹'} *${v.title}*\n🏢 ${v.company}\n📂 ${v.category}\n📄 ${v.desc}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🗑 Удалить', callback_data: `del_${v.id}` }]]
        }
      }
    );
  });
});

// Просмотр резюме
bot.onText(/📥 Просмотреть резюме/, (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  if (resumes.length === 0) return bot.sendMessage(msg.chat.id, 'Резюме пока не поступали.');

  bot.sendMessage(msg.chat.id, `📥 *Всего резюме: ${resumes.length}*`, { parse_mode: 'Markdown' });
  resumes.forEach((r, i) => {
    const a = r.answers;
    bot.sendMessage(msg.chat.id,
      `━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Резюме #${i + 1}*\n` +
      `📌 Вакансия: ${r.vacancyTitle}\n` +
      `👤 ${a.name || '—'}\n` +
      `🗂 Опыт: ${a.experience || '—'}\n` +
      `🛠 Навыки: ${a.skills || '—'}\n` +
      `💵 Зарплата: ${a.salary || '—'}\n` +
      `📱 Контакт: ${a.contact || '—'}\n` +
      `📅 ${r.date}`,
      { parse_mode: 'Markdown' }
    );
  });
});


// ════════════════════════════════════════════════════════════
//  5. CALLBACK — категории, отклик, удаление вакансии
// ════════════════════════════════════════════════════════════
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data   = query.data;

  // ── Фильтр по категории ────────────────────────────────
  if (data.startsWith('cat_')) {
    const selected = data.replace('cat_', '');
    const filtered = selected === 'all'
      ? vacancies
      : vacancies.filter(v => v.category === selected);

    bot.answerCallbackQuery(query.id);

    if (filtered.length === 0) {
      return bot.sendMessage(chatId, '😔 В этой категории пока нет вакансий.');
    }

    bot.sendMessage(chatId, `Найдено вакансий: *${filtered.length}*`, { parse_mode: 'Markdown' });

    filtered.forEach(v => {
      bot.sendMessage(chatId,
        `${CAT_EMOJI[v.category] || '🔹'} *${v.title}*\n🏢 ${v.company}\n📂 ${v.category}\n\n${v.desc}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '✉️ Откликнуться', callback_data: `apply_${v.id}` }]]
          }
        }
      );
    });
  }

  // ── Откликнуться — запуск анкеты ──────────────────────
  if (data.startsWith('apply_')) {
    const vacancyId = parseInt(data.replace('apply_', ''));
    const vacancy   = vacancies.find(v => v.id === vacancyId);
    if (!vacancy) return bot.answerCallbackQuery(query.id, { text: 'Вакансия не найдена.' });

    sessions[chatId] = { type: 'resume', step: 0, answers: {}, vacancyId, vacancyTitle: vacancy.title };
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId,
      `✉️ Отклик на *${vacancy.title}* (${vacancy.company})\n\n${QUESTIONS[0].text}`,
      { parse_mode: 'Markdown' }
    );
  }

  // ── Удалить вакансию (HR) ─────────────────────────────
  if (data.startsWith('del_')) {
    if (!isAdmin(chatId)) return bot.answerCallbackQuery(query.id, { text: '⛔ Нет доступа.' });
    const id = parseInt(data.replace('del_', ''));
    vacancies = vacancies.filter(v => v.id !== id);
    bot.answerCallbackQuery(query.id, { text: '✅ Вакансия удалена!' });
    bot.editMessageText('🗑 *Вакансия удалена*', {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
    });
  }
});


// ════════════════════════════════════════════════════════════
//  6. ОБРАБОТКА ТЕКСТА — анкета и добавление вакансии
// ════════════════════════════════════════════════════════════
bot.on('message', (msg) => {
  if (!msg.text) return;
  const text    = msg.text.trim();
  const chatId  = msg.chat.id;
  const session = sessions[chatId];

  // Игнорируем команды и кнопки меню
  const menuKeywords = ['/start', '/hr', '📋', '📄', '➕', '📥', '🔙'];
  if (menuKeywords.some(k => text.startsWith(k))) return;
  if (!session) return;

  // ── Анкета кандидата ───────────────────────────────────
  if (session.type === 'resume') {
    const q = QUESTIONS[session.step];
    session.answers[q.key] = text;
    session.step++;

    if (session.step < QUESTIONS.length) {
      // Следующий вопрос
      bot.sendMessage(chatId, QUESTIONS[session.step].text, { parse_mode: 'Markdown' });
    } else {
      // Анкета завершена
      const a = session.answers;
      const summary =
        `📥 *Новый отклик!*\n` +
        `📌 Вакансия: ${session.vacancyTitle}\n` +
        `👤 ${a.name}\n` +
        `🗂 Опыт: ${a.experience}\n` +
        `🛠 Навыки: ${a.skills}\n` +
        `💵 Зарплата: ${a.salary}\n` +
        `📱 Контакт: ${a.contact}\n` +
        `📅 ${new Date().toLocaleString('ru')}`;

      bot.sendMessage(chatId,
        `✅ Анкета отправлена!\n\nМы свяжемся с тобой: *${a.contact}*`,
        { parse_mode: 'Markdown', ...mainMenu }
      );

      notifyHR(summary);
      resumes.push({
        from: msg.from.username || msg.from.first_name,
        vacancyTitle: session.vacancyTitle,
        answers: a,
        date: new Date().toLocaleString('ru'),
      });
      delete sessions[chatId];
    }
  }

  // ── Добавление вакансии HR-ом ──────────────────────────
  if (session.type === 'addVacancy') {
    const step = VACANCY_STEPS[session.step];
    session.data[step.key] = text;
    session.step++;

    if (session.step < VACANCY_STEPS.length) {
      bot.sendMessage(chatId, VACANCY_STEPS[session.step].text, { parse_mode: 'Markdown' });
    } else {
      // Выбор категории
      const buttons = CATEGORIES.map(cat => ([{
        text: `${CAT_EMOJI[cat]} ${cat}`,
        callback_data: `newcat_${cat}`,
      }]));
      bot.sendMessage(chatId, '📂 Выбери *категорию* для вакансии:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });
    }
  }
});

// Выбор категории при добавлении новой вакансии
bot.on('callback_query', (query) => {
  if (!query.data.startsWith('newcat_')) return;
  const chatId  = query.message.chat.id;
  const session = sessions[chatId];
  if (!session || session.type !== 'addVacancy') return;

  const category = query.data.replace('newcat_', '');
  const newVacancy = {
    id:       Date.now(),
    title:    session.data.title,
    company:  session.data.company,
    desc:     session.data.desc,
    category,
  };
  vacancies.push(newVacancy);
  delete sessions[chatId];

  bot.answerCallbackQuery(query.id);
  bot.sendMessage(chatId,
    `✅ *Вакансия добавлена!*\n\n` +
    `${CAT_EMOJI[category]} *${newVacancy.title}*\n` +
    `🏢 ${newVacancy.company}\n` +
    `📂 ${category}\n` +
    `📄 ${newVacancy.desc}`,
    { parse_mode: 'Markdown', ...hrMenu }
  );
});


// ════════════════════════════════════════════════════════════
//  7. ПОЛУЧЕНИЕ ФАЙЛА-РЕЗЮМЕ (PDF/DOC)
// ════════════════════════════════════════════════════════════
bot.on('document', (msg) => {
  const chatId = msg.chat.id;
  const fileName = msg.document.file_name || 'резюме';
  const resume = {
    from:         msg.from.username || msg.from.first_name,
    vacancyTitle: 'Файл-резюме',
    answers:      { contact: msg.from.username ? `@${msg.from.username}` : `id: ${msg.from.id}` },
    file_name:    fileName,
    date:         new Date().toLocaleString('ru'),
  };
  resumes.push(resume);

  bot.sendMessage(chatId,
    `✅ Резюме *${fileName}* получено!\n\nМы рассмотрим его и свяжемся с тобой в ближайшее время. 🙌`,
    { parse_mode: 'Markdown', ...mainMenu }
  );

  notifyHR(`📎 *Новое резюме-файл!*\n👤 От: ${msg.from.username ? '@' + msg.from.username : msg.from.first_name}\n📄 Файл: ${fileName}\n📅 ${resume.date}`);
  HR_ADMINS.forEach(id => bot.forwardMessage(id, chatId, msg.message_id));
});

console.log('✅ Job Bot запущен...');
