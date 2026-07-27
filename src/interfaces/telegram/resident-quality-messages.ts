import type { BotLanguage } from '../../application/localization/bot-language.js';

const messages = {
  ru: {
    accept_usage: '/accept ORDER',
    accepted: '{reference}: работа принята. Спасибо.',
    complaint_created: '{reference}: жалоба принята. Срок рассмотрения {dueAt}.',
    complaint_usage: '/complaint ORDER текст жалобы',
    feedback_saved: '{reference}: ваша оценка сохранена.',
    rate_usage: '/rate ORDER 1..5 необязательный комментарий',
    respond_saved: '{reference}: дополнительная информация принята.',
    respond_usage: '/respond TICKET дополнительная информация',
    rework_accepted: '{reference}: запрос на доработку принят.',
    rework_usage: '/rework ORDER причина',
    warranty: '{reference}: гарантия до {dueAt} ({days} дней).',
    warranty_usage: '/warranty ORDER',
  },
  uz: {
    accept_usage: '/accept ORDER',
    accepted: '{reference}: ish qabul qilindi. Rahmat.',
    complaint_created: '{reference}: shikoyat qabul qilindi. Ko‘rib chiqish muddati {dueAt}.',
    complaint_usage: '/complaint ORDER shikoyat matni',
    feedback_saved: '{reference}: bahoyingiz saqlandi.',
    rate_usage: '/rate ORDER 1..5 ixtiyoriy izoh',
    respond_saved: '{reference}: ma’lumot qabul qilindi.',
    respond_usage: '/respond TICKET qo‘shimcha ma’lumot',
    rework_accepted: '{reference}: qayta ishlash talabi qabul qilindi.',
    rework_usage: '/rework ORDER sabab',
    warranty: '{reference}: kafolat {dueAt} gacha ({days} kun).',
    warranty_usage: '/warranty ORDER',
  },
} as const;

export type ResidentQualityMessageKey = keyof (typeof messages)['uz'];

export function residentQualityMessage(
  language: BotLanguage,
  key: ResidentQualityMessageKey,
  parameters: Readonly<Record<string, number | string>> = {},
): string {
  return Object.entries(parameters).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    messages[language][key] as string,
  );
}
