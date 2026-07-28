import { Keyboard } from 'grammy';

import type { BotLanguage } from '../../application/localization/bot-language.js';

export type ResidentMenuAction = 'help' | 'language' | 'new-request' | 'status';

const labels: Readonly<Record<BotLanguage, Readonly<Record<ResidentMenuAction, string>>>> = {
  ru: {
    help: 'ℹ️ Помощь',
    language: '🌐 Язык',
    'new-request': '🛠 Новая заявка',
    status: '🔎 Проверить статус',
  },
  uz: {
    help: 'ℹ️ Yordam',
    language: '🌐 Til',
    'new-request': '🛠 Yangi so‘rov',
    status: '🔎 Holatni tekshirish',
  },
};

export function residentMenuActionForText(text: string): ResidentMenuAction | undefined {
  for (const language of ['uz', 'ru'] as const) {
    for (const [action, label] of Object.entries(labels[language])) {
      if (text === label) return action as ResidentMenuAction;
    }
  }
  return undefined;
}

export function residentMainMenu(language: BotLanguage): Keyboard {
  const value = labels[language];
  return new Keyboard()
    .text(value['new-request'])
    .text(value.status)
    .row()
    .text(value.language)
    .text(value.help)
    .resized()
    .persistent();
}

export function isManualAddressButton(text: string): boolean {
  return text === '⌨️ Manzilni yozish' || text === '⌨️ Ввести адрес';
}
