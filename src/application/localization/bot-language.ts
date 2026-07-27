export const botLanguages = ['uz', 'ru'] as const;
export type BotLanguage = (typeof botLanguages)[number];

export function botLanguageFromTelegram(languageCode: string | undefined): BotLanguage {
  return languageCode?.toLowerCase().startsWith('ru') ? 'ru' : 'uz';
}
