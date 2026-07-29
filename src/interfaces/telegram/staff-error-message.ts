import type { BotLanguage } from '../../application/localization/bot-language.js';
import { DomainRuleError } from '../../domain/shared/domain-errors.js';

const messages = {
  ru: {
    forbidden: 'У вас нет доступа к этому действию. Попросите администратора проверить вашу роль.',
    invalidTransition:
      'Это действие пока недоступно. Откройте «Заявки» и выполните пронумерованные шаги по порядку, начиная с проверки.',
    notFound: 'Заявка не найдена. Обновите список через «Заявки» и выберите номер заново.',
    priorityRequired: 'Сначала нажмите «3️⃣ Оценить приоритет», затем создайте заказ.',
    retry: 'Не удалось выполнить действие. Повторите через меню.',
  },
  uz: {
    forbidden: 'Bu amal uchun ruxsatingiz yo‘q. Administratordan rolingizni tekshirishni so‘rang.',
    invalidTransition:
      'Bu amalga hali navbat kelmagan. “So‘rovlar”ni ochib, raqamlangan bosqichlarni tekshiruvdan boshlab ketma-ket bajaring.',
    notFound: 'So‘rov topilmadi. “So‘rovlar” orqali ro‘yxatni yangilang va raqamni qayta tanlang.',
    priorityRequired: 'Avval “3️⃣ Ustuvorlikni baholash”ni bosing, keyin buyurtma yarating.',
    retry: 'Amal bajarilmadi. Menyu orqali qayta urinib ko‘ring.',
  },
} as const;

export function staffErrorMessage(error: unknown, language: BotLanguage): string {
  if (!(error instanceof DomainRuleError)) return messages[language].retry;

  switch (error.code) {
    case 'COMMAND_INVALID':
      return error.message;
    case 'FORBIDDEN':
      return messages[language].forbidden;
    case 'INVALID_TRANSITION':
    case 'REQUEST_NOT_VALIDATING':
      return messages[language].invalidTransition;
    case 'PRIORITY_REQUIRED':
      return messages[language].priorityRequired;
    case 'NOT_FOUND':
      return messages[language].notFound;
    default:
      return messages[language].retry;
  }
}
