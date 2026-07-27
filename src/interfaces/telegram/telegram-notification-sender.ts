import { Api, GrammyError } from 'grammy';

import {
  NotificationDeliveryError,
  type ClaimedNotification,
  type NotificationSender,
} from '../../application/notifications/notification-repository.js';
import type { NotificationTemplateKey } from '../../domain/notifications/notification-policy.js';
import { formatTashkentDateTime } from '../../domain/shared/tashkent-date-time.js';

type Template = (notification: ClaimedNotification) => string;

function dueAt(value: string | undefined): string | undefined {
  return value ? formatTashkentDateTime(value) : undefined;
}

const latinTemplates: Readonly<Record<NotificationTemplateKey, Template>> = {
  'executor.assignment_created': ({ payload }) =>
    `${payload.reference}: sizga yangi topshiriq biriktirildi.${payload.dueAt ? ` Muddat: ${dueAt(payload.dueAt)}.` : ''}`,
  'executor.deadline_reminder': ({ payload }) =>
    `${payload.reference}: topshiriq muddati yaqinlashmoqda.${payload.dueAt ? ` Muddat: ${dueAt(payload.dueAt)}.` : ''}`,
  'executor.rework_required': ({ payload }) =>
    `${payload.reference}: qayta ishlash talab qilindi.${payload.dueAt ? ` Muddat: ${dueAt(payload.dueAt)}.` : ''}`,
  'operator.assignment_rejected': ({ payload }) =>
    `${payload.reference}: ijrochi topshiriqni rad etdi. Yangi ijrochi belgilang.`,
  'operator.complaint_created': ({ payload }) =>
    `${payload.reference}: yangi shikoyat. Ko‘rib chiqish muddati: ${dueAt(payload.dueAt) ?? 'belgilanmagan'}.`,
  'operator.complaint_review_overdue': ({ payload }) =>
    `${payload.reference}: shikoyatni ko‘rib chiqish muddati o‘tgan.`,
  'operator.complaint_review_reminder': ({ payload }) =>
    `${payload.reference}: shikoyat ko‘rib chiqish muddati yaqin.`,
  'operator.deadline_overdue': ({ payload }) =>
    `${payload.reference}: buyurtma muddati o‘tgan. Holat: ${payload.status ?? 'noma’lum'}.`,
  'operator.order_blocked': ({ payload }) => `${payload.reference}: ish to‘siq sababli bloklandi.`,
  'resident.acceptance_requested': ({ payload }) =>
    `${payload.reference}: ish yakunlandi. Natijani /status orqali tekshirib, qabul qiling yoki qayta ishlash so‘rang.`,
  'resident.complaint_decided': ({ payload }) =>
    `${payload.reference}: shikoyat holati ${payload.status ?? 'yangilandi'}.`,
  'resident.information_requested': ({ payload }) =>
    `${payload.reference}: qo‘shimcha ma’lumot kerak. Botdagi ko‘rsatmaga javob bering.`,
  'resident.status_changed': ({ payload }) =>
    `${payload.reference}: holat ${payload.status ?? 'yangilandi'}.`,
};

const cyrillicTemplates: Readonly<Record<NotificationTemplateKey, Template>> = {
  ...latinTemplates,
  'resident.acceptance_requested': ({ payload }) =>
    `${payload.reference}: иш якунланди. Натижани /status орқали текшириб, қабул қилинг ёки қайта ишлаш сўранг.`,
  'resident.complaint_decided': ({ payload }) =>
    `${payload.reference}: шикоят ҳолати ${payload.status ?? 'янгиланди'}.`,
  'resident.information_requested': ({ payload }) =>
    `${payload.reference}: қўшимча маълумот керак. Ботдаги кўрсатмага жавоб беринг.`,
  'resident.status_changed': ({ payload }) =>
    `${payload.reference}: ҳолат ${payload.status ?? 'янгиланди'}.`,
};

export function renderTelegramNotification(notification: ClaimedNotification): string {
  const templates = notification.language === 'uz-Cyrl' ? cyrillicTemplates : latinTemplates;
  return templates[notification.payload.templateKey](notification);
}

export class TelegramNotificationSender implements NotificationSender {
  private readonly residentApi?: Api;
  private readonly staffApi?: Api;

  constructor(residentToken?: string, staffToken?: string) {
    if (residentToken) this.residentApi = new Api(residentToken);
    if (staffToken) this.staffApi = new Api(staffToken);
  }

  async send(notification: ClaimedNotification): Promise<{ readonly providerMessageId?: string }> {
    const api = notification.audience === 'RESIDENT' ? this.residentApi : this.staffApi;
    if (!api) throw new NotificationDeliveryError('BOT_TOKEN_NOT_CONFIGURED', false);
    if (notification.recipientTelegramUserId === null) {
      throw new NotificationDeliveryError('RECIPIENT_TELEGRAM_ID_MISSING', false);
    }
    try {
      const message = await api.sendMessage(
        notification.recipientTelegramUserId.toString(),
        renderTelegramNotification(notification),
      );
      return { providerMessageId: String(message.message_id) };
    } catch (error) {
      if (error instanceof GrammyError) {
        const retryable = error.error_code === 429 || error.error_code >= 500;
        throw new NotificationDeliveryError(`TELEGRAM_${error.error_code}`, retryable);
      }
      throw new NotificationDeliveryError('TELEGRAM_NETWORK', true);
    }
  }
}
