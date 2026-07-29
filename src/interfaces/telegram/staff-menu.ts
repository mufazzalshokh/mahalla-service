import { InlineKeyboard, Keyboard } from 'grammy';

import type { BotLanguage } from '../../application/localization/bot-language.js';

export type StaffMenuAction =
  | 'complaints'
  | 'finance'
  | 'help'
  | 'language'
  | 'mine'
  | 'notifications'
  | 'overdue'
  | 'pdca'
  | 'queue'
  | 'reports'
  | 'staff';

const labels: Readonly<Record<BotLanguage, Readonly<Record<StaffMenuAction, string>>>> = {
  ru: {
    complaints: '📝 Жалобы',
    finance: '💰 Финансы',
    help: 'ℹ️ Помощь',
    language: '🌐 Язык',
    mine: '🧰 Мои работы',
    notifications: '🔔 Уведомления',
    overdue: '⚠️ Просроченные',
    pdca: '🔄 PDCA',
    queue: '📥 Заявки',
    reports: '📊 Отчёты',
    staff: '👥 Сотрудники',
  },
  uz: {
    complaints: '📝 Shikoyatlar',
    finance: '💰 Moliya',
    help: 'ℹ️ Yordam',
    language: '🌐 Til',
    mine: '🧰 Mening ishlarim',
    notifications: '🔔 Xabarlar',
    overdue: '⚠️ Kechikkanlar',
    pdca: '🔄 PDCA',
    queue: '📥 So‘rovlar',
    reports: '📊 Hisobotlar',
    staff: '👥 Xodimlar',
  },
};

export function staffMenuActionForText(text: string): StaffMenuAction | undefined {
  for (const language of ['uz', 'ru'] as const) {
    for (const [action, label] of Object.entries(labels[language])) {
      if (text === label) return action as StaffMenuAction;
    }
  }
  return undefined;
}

export function staffMainMenu(language: BotLanguage): Keyboard {
  const value = labels[language];
  return new Keyboard()
    .text(value.queue)
    .text(value.mine)
    .row()
    .text(value.overdue)
    .text(value.complaints)
    .row()
    .text(value.reports)
    .text(value.finance)
    .row()
    .text(value.pdca)
    .text(value.notifications)
    .row()
    .text(value.language)
    .text(value.staff)
    .row()
    .text(value.help)
    .resized()
    .persistent();
}

export function staffLanguageMenu(): InlineKeyboard {
  return new InlineKeyboard().text("🇺🇿 O'zbekcha", 'lang:uz').text('🇷🇺 Русский', 'lang:ru');
}

export function staffReportMenu(language: BotLanguage): InlineKeyboard {
  return new InlineKeyboard()
    .text(language === 'ru' ? 'Неделя' : 'Hafta', 'report:week')
    .text(language === 'ru' ? 'Месяц' : 'Oy', 'report:month')
    .row()
    .text(language === 'ru' ? 'CSV за неделю' : 'Haftalik CSV', 'reportcsv:week')
    .text(language === 'ru' ? 'CSV за месяц' : 'Oylik CSV', 'reportcsv:month');
}

export function staffFinanceMenu(language: BotLanguage): InlineKeyboard {
  const name = (uz: string, ru: string): string => (language === 'ru' ? ru : uz);
  return new InlineKeyboard()
    .text(name('📊 Buyurtma moliyasi', '📊 Финансы заказа'), 'finance:summary')
    .row()
    .text(name('⚙️ Rejimni sozlash', '⚙️ Настроить режим'), 'finance:configure')
    .text(name('🧾 Narx taklifi', '🧾 Предложение'), 'finance:quote')
    .row()
    .text(name('✅ Taklifni tasdiqlash', '✅ Принять предложение'), 'finance:acceptquote')
    .text(name('📄 Shartnoma', '📄 Договор'), 'finance:contract')
    .row()
    .text(name('📝 Qabul dalolatnomasi', '📝 Акт приёмки'), 'finance:certificate')
    .row()
    .text(name('💵 To‘lov', '💵 Оплата'), 'finance:payment')
    .text(name('🧮 Xarajat', '🧮 Расход'), 'finance:expense')
    .row()
    .text(name('📥 Hujjatni olish', '📥 Получить документ'), 'finance:document');
}

export function staffEntityMenu(
  kind: 'complaint' | 'document' | 'notification' | 'order' | 'pdca' | 'request' | 'staff',
  references: readonly string[],
): InlineKeyboard | undefined {
  if (references.length === 0) return undefined;
  const keyboard = new InlineKeyboard();
  references.forEach((reference) => keyboard.text(reference, `entity:${kind}:${reference}`).row());
  return keyboard;
}

export function staffAccessListMenu(
  references: readonly string[],
  language: BotLanguage,
): InlineKeyboard {
  const keyboard = new InlineKeyboard().text(
    language === 'ru' ? '➕ Добавить сотрудника' : '➕ Xodim qo‘shish',
    'staff:add',
  );
  if (references.length > 0) keyboard.row();
  references.forEach((reference, index) => {
    keyboard.text(reference, `entity:staff:${reference}`);
    if (index < references.length - 1) keyboard.row();
  });
  return keyboard;
}

export function staffAccessActions(reference: string, language: BotLanguage): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      language === 'ru' ? '⏸ Приостановить' : '⏸ Kirishni to‘xtatish',
      `prompt:suspendstaff:${reference}`,
    )
    .text(
      language === 'ru' ? '▶️ Восстановить' : '▶️ Kirishni tiklash',
      `action:restorestaff:${reference}`,
    );
}

export function staffRoleMenu(language: BotLanguage): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      language === 'ru' ? '🧑‍💼 Оператор-менеджер' : '🧑‍💼 Operator-menejer',
      'staffrole:operator_manager',
    )
    .row()
    .text(language === 'ru' ? '🧰 Исполнитель' : '🧰 Ijrochi', 'staffrole:executor');
}

export function referencesFromText(text: string, prefix: string): readonly string[] {
  return [...new Set(text.match(new RegExp(`${prefix}-\\d{4}-\\d{8}`, 'gu')) ?? [])];
}

export function requestActions(reference: string, language: BotLanguage): InlineKeyboard {
  return new InlineKeyboard()
    .text(language === 'ru' ? '👁 Подробности' : '👁 Tafsilotlar', `action:details:${reference}`)
    .row()
    .text(
      language === 'ru' ? '1️⃣ Начать проверку' : '1️⃣ Tekshiruvni boshlash',
      `action:validate:${reference}`,
    )
    .row()
    .text(
      language === 'ru' ? '2️⃣ Запросить данные' : '2️⃣ Ma’lumot so‘rash',
      `prompt:info:${reference}`,
    )
    .row()
    .text(
      language === 'ru' ? '🔎 Похожие заявки' : '🔎 O‘xshash so‘rovlar',
      `action:duplicates:${reference}`,
    )
    .text(
      language === 'ru' ? '3️⃣ Оценить приоритет' : '3️⃣ Ustuvorlikni baholash',
      `prompt:triage:${reference}`,
    )
    .row()
    .text(
      language === 'ru' ? '4️⃣ Создать заказ' : '4️⃣ Buyurtma yaratish',
      `action:register:${reference}`,
    )
    .row()
    .text(language === 'ru' ? 'Отклонить' : 'Rad etish', `prompt:reject:${reference}`);
}

export function orderActions(reference: string, language: BotLanguage): InlineKeyboard {
  return new InlineKeyboard()
    .text(language === 'ru' ? 'Принять' : 'Qabul qilish', `action:accept:${reference}`)
    .text(language === 'ru' ? 'Исполнители' : 'Ijrochilar', `action:executors:${reference}`)
    .row()
    .text(language === 'ru' ? 'Ход работы' : 'Ish jarayoni', `prompt:progress:${reference}`)
    .text(language === 'ru' ? 'Приостановить' : 'To‘xtatish', `prompt:block:${reference}`)
    .text(language === 'ru' ? 'Продолжить' : 'Davom ettirish', `action:unblock:${reference}`)
    .row()
    .text('📷 BEFORE', `photo:BEFORE:${reference}`)
    .text('📷 AFTER', `photo:AFTER:${reference}`)
    .row()
    .text(
      language === 'ru' ? 'Завершить работу' : 'Ishni yakunlash',
      `prompt:complete:${reference}`,
    )
    .text(language === 'ru' ? 'Чек-лист' : 'Tekshiruv ro‘yxati', `action:checklist:${reference}`)
    .row()
    .text(
      language === 'ru' ? 'Принять работу' : 'Ishni qabul qilish',
      `action:approve:${reference}`,
    )
    .text(language === 'ru' ? 'На доработку' : 'Qayta ishlash', `prompt:rework:${reference}`)
    .row()
    .text(
      language === 'ru' ? 'Начать доработку' : 'Qayta ishni boshlash',
      `action:startrework:${reference}`,
    );
}

export function complaintActions(reference: string, language: BotLanguage): InlineKeyboard {
  return new InlineKeyboard()
    .text(language === 'ru' ? 'Решить' : 'Hal qilish', `prompt:resolve:${reference}`)
    .text(language === 'ru' ? 'Отклонить' : 'Rad etish', `prompt:rejectcomplaint:${reference}`)
    .row()
    .text(
      language === 'ru' ? 'Открыть доработку' : 'Qayta ish ochish',
      `prompt:reopen:${reference}`,
    );
}

export function pdcaActions(reference: string, language: BotLanguage): InlineKeyboard {
  const name = (uz: string, ru: string): string => (language === 'ru' ? ru : uz);
  return new InlineKeyboard()
    .text(name('Bajarish', 'Выполнение'), `prompt:pdca_DO:${reference}`)
    .text(name('Tekshirish', 'Проверка'), `prompt:pdca_CHECK:${reference}`)
    .row()
    .text(name('Standartlash', 'Стандартизация'), `prompt:pdca_ACT:${reference}`)
    .text(name('Yakunlash', 'Завершить'), `prompt:pdca_COMPLETED:${reference}`)
    .row()
    .text(name('Bekor qilish', 'Отменить'), `prompt:pdca_CANCELLED:${reference}`);
}
