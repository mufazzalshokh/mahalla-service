import { createHash } from 'node:crypto';

import { formatUzs, type PaymentMethod } from '../../domain/commercial/commercial-policy.js';
import {
  formatTashkentDate,
  formatTashkentDateTime,
} from '../../domain/shared/tashkent-date-time.js';

export function documentChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

const heading = 'MAHALLA SERVICE — OPERATIONAL DOCUMENT / ОПЕРАЦИОННЫЙ ДОКУМЕНТ';

export function quotationDocument(input: {
  readonly code: string;
  readonly laborAmount: bigint;
  readonly materialAmount: bigint;
  readonly orderNumber: string;
  readonly otherAmount: bigint;
  readonly scope: string;
  readonly totalAmount: bigint;
  readonly validUntil: Date;
}): string {
  return [
    heading,
    'NARX TAKLIFI / КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',
    `Hujjat / Документ: ${input.code}`,
    `Buyurtma / Заказ: ${input.orderNumber}`,
    `Amal qilish muddati / Действует до: ${formatTashkentDate(input.validUntil)}`,
    `Ish hajmi / Объём работ: ${input.scope}`,
    `Mehnat / Работа: ${formatUzs(input.laborAmount)}`,
    `Material / Материалы: ${formatUzs(input.materialAmount)}`,
    `Boshqa / Прочее: ${formatUzs(input.otherAmount)}`,
    `Jami / Итого: ${formatUzs(input.totalAmount)}`,
    '',
    'Bu pilot operatsion yozuvi. Soliq hisob-fakturasi yoki elektron imzolangan shartnoma emas.',
    'Это пилотная операционная запись, не налоговый счёт и не договор с электронной подписью.',
  ].join('\n');
}

export function contractReferenceDocument(input: {
  readonly code: string;
  readonly externalReference: string;
  readonly orderNumber: string;
  readonly quotationCode: string;
  readonly termsSummary: string;
}): string {
  return [
    heading,
    'SHARTNOMA MA’LUMOTI / ССЫЛКА НА ДОГОВОР',
    `Hujjat / Документ: ${input.code}`,
    `Buyurtma / Заказ: ${input.orderNumber}`,
    `Narx taklifi / Предложение: ${input.quotationCode}`,
    `Tashqi raqam / Внешний номер: ${input.externalReference}`,
    `Qisqa shartlar / Краткие условия: ${input.termsSummary}`,
    '',
    'Bu tizim shartnoma mavjudligini qayd etadi; elektron imzo yaratmaydi.',
    'Система фиксирует наличие договора, но не создаёт электронную подпись.',
  ].join('\n');
}

export function acceptanceCertificateDocument(input: {
  readonly code: string;
  readonly issuedAt: Date;
  readonly orderNumber: string;
  readonly summary: string;
}): string {
  return [
    heading,
    'QABUL QILISH DALOLATNOMASI / АКТ ПРИЁМКИ',
    `Hujjat / Документ: ${input.code}`,
    `Buyurtma / Заказ: ${input.orderNumber}`,
    `Sana / Дата: ${formatTashkentDateTime(input.issuedAt)}`,
    `Natija / Результат: ${input.summary}`,
    '',
    'Operatsion qabul yozuvi. Yuridik kuch va imzo talablari alohida tasdiqlanishi kerak.',
    'Операционная запись приёмки. Юридическая сила и требования к подписи требуют отдельного согласования.',
  ].join('\n');
}

function paymentMethod(method: PaymentMethod): string {
  const values: Record<PaymentMethod, string> = {
    BANK_TRANSFER: 'Bank o‘tkazmasi / Банковский перевод',
    CASH: 'Naqd / Наличные',
    OTHER: 'Boshqa / Другое',
  };
  return values[method];
}

export function paymentReceiptDocument(input: {
  readonly amount: bigint;
  readonly code: string;
  readonly method: PaymentMethod;
  readonly orderNumber: string;
  readonly paidAt: Date;
  readonly proofReference: string;
}): string {
  return [
    heading,
    'TO‘LOV YOZUVI / ЗАПИСЬ ОБ ОПЛАТЕ',
    `Hujjat / Документ: ${input.code}`,
    `Buyurtma / Заказ: ${input.orderNumber}`,
    `Sana / Дата: ${formatTashkentDateTime(input.paidAt)}`,
    `Usul / Способ: ${paymentMethod(input.method)}`,
    `Summa / Сумма: ${formatUzs(input.amount)}`,
    `Tasdiq / Подтверждение: ${input.proofReference}`,
    '',
    'Qo‘lda kiritilgan operatsion yozuv. Fiskal chek emas.',
    'Ручная операционная запись, не фискальный чек.',
  ].join('\n');
}
