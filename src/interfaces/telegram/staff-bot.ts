import { Bot, InlineKeyboard, InputFile, type Context } from 'grammy';

import type {
  StaffOperationResult,
  StaffOperations,
} from '../../application/triage/staff-operations-service.js';
import {
  botLanguageFromTelegram,
  type BotLanguage,
} from '../../application/localization/bot-language.js';
import { DomainRuleError } from '../../domain/shared/domain-errors.js';
import { StaffTelegramController } from './staff-telegram-controller.js';
import {
  complaintActions,
  orderActions,
  pdcaActions,
  referencesFromText,
  requestActions,
  staffEntityMenu,
  staffLanguageMenu,
  staffMainMenu,
  staffMenuActionForText,
  staffReportMenu,
  type StaffMenuAction,
} from './staff-menu.js';
import { TransientStore } from './transient-store.js';

export interface StaffBotOptions {
  readonly onError?: (error: Error, updateId: number) => void;
  readonly operations: StaffOperations;
  readonly token: string;
}

interface PendingText {
  readonly prefix: string;
  readonly prompt: Readonly<Record<BotLanguage, string>>;
}

interface PendingPhoto {
  readonly orderNumber: string;
  readonly phase: 'AFTER' | 'BEFORE';
}

interface InspectionItemState {
  readonly code: string;
  readonly result?: 'FAIL' | 'PASS';
}

interface InspectionState {
  readonly items: readonly InspectionItemState[];
  readonly orderNumber: string;
}

function localized(language: BotLanguage, uz: string, ru: string): string {
  return language === 'ru' ? ru : uz;
}

function referencesForCommand(command: string, text: string): InlineKeyboard | undefined {
  if (command === '/queue') return staffEntityMenu('request', referencesFromText(text, 'MCK'));
  if (command === '/mine' || command === '/overdue') {
    return staffEntityMenu('order', referencesFromText(text, 'ORD'));
  }
  if (command === '/complaints') {
    return staffEntityMenu('complaint', referencesFromText(text, 'CMP'));
  }
  if (command === '/pdca') return staffEntityMenu('pdca', referencesFromText(text, 'PDC'));
  if (command === '/failednotifications') {
    return staffEntityMenu('notification', referencesFromText(text, 'NTF'));
  }
  return undefined;
}

function inspectionKeyboard(state: InspectionState, language: BotLanguage): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  state.items.forEach((item, index) => {
    const marker = item.result === 'PASS' ? '✅' : item.result === 'FAIL' ? '❌' : '⬜';
    keyboard.text(`${marker} ${item.code}`, `inspect:toggle:${index}`).row();
  });
  return keyboard.text(
    localized(language, 'Tekshiruvni saqlash', 'Сохранить проверку'),
    'inspect:submit',
  );
}

function checklistItems(text: string): readonly InspectionItemState[] {
  return text
    .split('\n')
    .slice(1)
    .map((line) => /^(\w+)\s+[—-]/u.exec(line)?.[1])
    .filter((code): code is string => Boolean(code))
    .map((code) => ({ code }));
}

function executorsKeyboard(
  orderNumber: string,
  text: string,
  language: BotLanguage,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const line of text.split('\n')) {
    const code = /^([A-Z0-9_-]+)\s+[—-]/u.exec(line)?.[1];
    if (code) keyboard.text(code, `assign:${orderNumber}:${code}`).row();
  }
  return keyboard.text(localized(language, 'Orqaga', 'Назад'), `entity:order:${orderNumber}`);
}

export function createStaffBot(options: StaffBotOptions): Bot {
  const bot = new Bot(options.token);
  const controller = new StaffTelegramController(options.operations);
  const languages = new TransientStore<BotLanguage>(24 * 60 * 60 * 1_000, 500);
  const pendingText = new TransientStore<PendingText>(30 * 60 * 1_000, 500);
  const pendingPhoto = new TransientStore<PendingPhoto>(30 * 60 * 1_000, 500);
  const inspections = new TransientStore<InspectionState>(30 * 60 * 1_000, 500);

  const userKey = (ctx: Context): string | undefined => ctx.from?.id.toString();
  const language = (ctx: Context): BotLanguage => {
    const key = userKey(ctx);
    if (!key) return 'uz';
    const selected = languages.get(key);
    if (selected) return selected;
    const detected = botLanguageFromTelegram(ctx.from?.language_code);
    languages.set(key, detected);
    return detected;
  };

  const replyResult = async (
    ctx: Context,
    result: StaffOperationResult,
    keyboard?: InlineKeyboard,
  ): Promise<void> => {
    if (typeof result === 'string') {
      await ctx.reply(result, keyboard ? { reply_markup: keyboard } : undefined);
      return;
    }
    await ctx.replyWithDocument(
      new InputFile(Buffer.from(result.content, 'utf8'), result.fileName),
      {
        caption: result.caption,
      },
    );
  };

  const execute = async (
    ctx: Context,
    command: string,
  ): Promise<StaffOperationResult | undefined> => {
    if (!ctx.from) return undefined;
    const selected = language(ctx);
    const result = await controller.handle(BigInt(ctx.from.id), command, selected);
    await replyResult(
      ctx,
      result,
      typeof result === 'string' ? referencesForCommand(command, result) : undefined,
    );
    return result;
  };

  const showMenu = async (ctx: Context): Promise<void> => {
    const selected = language(ctx);
    await ctx.reply(localized(selected, 'Kerakli bo‘limni tanlang.', 'Выберите нужный раздел.'), {
      reply_markup: staffMainMenu(selected),
    });
  };

  const menuAction = async (ctx: Context, action: StaffMenuAction): Promise<void> => {
    const selected = language(ctx);
    const commands: Partial<Record<StaffMenuAction, string>> = {
      complaints: '/complaints',
      help: '/help',
      mine: '/mine',
      notifications: '/failednotifications',
      overdue: '/overdue',
      pdca: '/pdca',
      queue: '/queue',
    };
    if (action === 'language') {
      await ctx.reply(localized(selected, 'Tilni tanlang.', 'Выберите язык.'), {
        reply_markup: staffLanguageMenu(),
      });
      return;
    }
    if (action === 'reports') {
      await ctx.reply(localized(selected, 'Hisobot turini tanlang.', 'Выберите отчёт.'), {
        reply_markup: staffReportMenu(selected),
      });
      return;
    }
    const command = commands[action];
    if (command) await execute(ctx, command);
  };

  bot.on('message:text', async (ctx) => {
    const key = userKey(ctx);
    if (!key) return;
    const text = ctx.message.text.trim();
    if (text === '/start' || text === '/menu') {
      pendingText.delete(key);
      await showMenu(ctx);
      return;
    }
    const action = staffMenuActionForText(text);
    if (action) {
      pendingText.delete(key);
      await menuAction(ctx, action);
      return;
    }
    const pending = pendingText.get(key);
    if (pending && !text.startsWith('/')) {
      pendingText.delete(key);
      await execute(ctx, `${pending.prefix} ${text}`);
      return;
    }
    await execute(ctx, text);
  });

  bot.on('callback_query:data', async (ctx) => {
    const key = userKey(ctx);
    if (!key) return;
    const selected = language(ctx);
    const data = ctx.callbackQuery.data;
    const [kind, action, reference] = data.split(':');

    if (kind === 'lang' && (action === 'uz' || action === 'ru')) {
      languages.set(key, action);
      pendingText.delete(key);
      await ctx.answerCallbackQuery();
      await showMenu(ctx);
      return;
    }
    if ((kind === 'report' || kind === 'reportcsv') && (action === 'week' || action === 'month')) {
      await ctx.answerCallbackQuery();
      await execute(ctx, `/${kind} ${action}`);
      return;
    }
    if (kind === 'entity' && reference) {
      const menus: Record<string, InlineKeyboard> = {
        complaint: complaintActions(reference, selected),
        notification: new InlineKeyboard().text(
          localized(selected, 'Qayta yuborish', 'Отправить повторно'),
          `action:retrynotification:${reference}`,
        ),
        order: orderActions(reference, selected),
        pdca: pdcaActions(reference, selected),
        request: requestActions(reference, selected),
      };
      const keyboard = menus[action ?? ''];
      await ctx.answerCallbackQuery();
      if (keyboard) await ctx.reply(reference, { reply_markup: keyboard });
      return;
    }
    if (kind === 'action' && action && reference) {
      const commands: Readonly<Record<string, string>> = {
        accept: `/accept ${reference}`,
        approve: `/approve ${reference}`,
        duplicates: `/duplicates ${reference}`,
        register: `/register ${reference}`,
        retrynotification: `/retrynotification ${reference}`,
        startrework: `/startrework ${reference}`,
        unblock: `/unblock ${reference}`,
        validate: `/validate ${reference}`,
      };
      await ctx.answerCallbackQuery();
      if (action === 'executors') {
        const result = await execute(ctx, `/executors ${reference}`);
        if (typeof result === 'string') {
          await ctx.reply(localized(selected, 'Ijrochini tanlang.', 'Выберите исполнителя.'), {
            reply_markup: executorsKeyboard(reference, result, selected),
          });
        }
        return;
      }
      if (action === 'checklist') {
        const result = await execute(ctx, `/checklist ${reference}`);
        if (typeof result === 'string') {
          const state = { items: checklistItems(result), orderNumber: reference };
          inspections.set(key, state);
          await ctx.reply(localized(selected, 'Har bandni belgilang.', 'Отметьте каждый пункт.'), {
            reply_markup: inspectionKeyboard(state, selected),
          });
        }
        return;
      }
      const command = commands[action];
      if (command) await execute(ctx, command);
      return;
    }
    if (kind === 'prompt' && action && reference) {
      const prompts: Readonly<Record<string, PendingText>> = {
        block: {
          prefix: `/block ${reference}`,
          prompt: { ru: 'Напишите причину остановки.', uz: 'To‘xtatish sababini yozing.' },
        },
        complete: {
          prefix: `/complete ${reference}`,
          prompt: { ru: 'Напишите итог работы.', uz: 'Yakuniy hisobotni yozing.' },
        },
        info: {
          prefix: `/info ${reference}`,
          prompt: { ru: 'Какую информацию запросить?', uz: 'Qanday ma’lumot so‘ralsin?' },
        },
        progress: {
          prefix: `/progress ${reference}`,
          prompt: { ru: 'Опишите ход работы.', uz: 'Ish jarayonini yozing.' },
        },
        reject: {
          prefix: `/reject ${reference}`,
          prompt: { ru: 'Напишите причину отказа.', uz: 'Rad etish sababini yozing.' },
        },
        rejectcomplaint: {
          prefix: `/closecomplaint ${reference} reject`,
          prompt: {
            ru: 'Напишите причину отклонения жалобы.',
            uz: 'Shikoyatni rad etish sababini yozing.',
          },
        },
        reopen: {
          prefix: `/reopen ${reference}`,
          prompt: { ru: 'Напишите причину доработки.', uz: 'Qayta ish sababini yozing.' },
        },
        resolve: {
          prefix: `/closecomplaint ${reference} resolve`,
          prompt: { ru: 'Напишите решение по жалобе.', uz: 'Shikoyat yechimini yozing.' },
        },
        rework: {
          prefix: `/rework ${reference}`,
          prompt: { ru: 'Что нужно доработать?', uz: 'Nimani qayta ishlash kerak?' },
        },
        triage: {
          prefix: `/triage ${reference}`,
          prompt: {
            ru: 'Введите 4 оценки от 0 до 5: безопасность срочность затронутые жители социальное влияние. Например: 2 3 2 2',
            uz: '0 dan 5 gacha 4 baho kiriting: xavfsizlik shoshilinchlik ta’sirlangan aholi ijtimoiy ta’sir. Masalan: 2 3 2 2',
          },
        },
      };
      const pdcaStage = action.startsWith('pdca_') ? action.slice('pdca_'.length) : undefined;
      const pending = pdcaStage
        ? {
            prefix: `/pdca move ${reference} ${pdcaStage}`,
            prompt: {
              ru: 'Кратко напишите основание изменения этапа.',
              uz: 'Bosqich o‘zgarishi sababini qisqa yozing.',
            },
          }
        : prompts[action];
      await ctx.answerCallbackQuery();
      if (pending) {
        pendingText.set(key, pending);
        await ctx.reply(pending.prompt[selected]);
      }
      return;
    }
    if (kind === 'photo' && (action === 'BEFORE' || action === 'AFTER') && reference) {
      pendingPhoto.set(key, { orderNumber: reference, phase: action });
      await ctx.answerCallbackQuery();
      await ctx.reply(
        localized(selected, 'Endi suratni yuboring.', 'Теперь отправьте фотографию.'),
      );
      return;
    }
    if (kind === 'assign' && action && reference) {
      pendingText.set(key, {
        prefix: `/assign ${action} ${reference}`,
        prompt: {
          ru: 'Введите срок в формате ДД.ММ.ГГГГ ЧЧ:мм, например 30.07.2026 18:00.',
          uz: 'Muddatni KK.OO.YYYY SS:dd formatida kiriting, masalan 30.07.2026 18:00.',
        },
      });
      await ctx.answerCallbackQuery();
      await ctx.reply(pendingText.get(key)?.prompt[selected] ?? '');
      return;
    }
    if (kind === 'inspect' && action) {
      const state = inspections.get(key);
      await ctx.answerCallbackQuery();
      if (!state) return;
      if (action === 'toggle' && reference) {
        const index = Number(reference);
        const items = state.items.map((item, itemIndex) =>
          itemIndex === index
            ? { ...item, result: item.result === 'PASS' ? ('FAIL' as const) : ('PASS' as const) }
            : item,
        );
        const updated = { ...state, items };
        inspections.set(key, updated);
        await ctx.editMessageReplyMarkup({ reply_markup: inspectionKeyboard(updated, selected) });
        return;
      }
      if (action === 'submit') {
        if (state.items.length === 0 || state.items.some((item) => !item.result)) {
          await ctx.reply(
            localized(selected, 'Barcha bandlarni belgilang.', 'Отметьте все пункты.'),
          );
          return;
        }
        inspections.delete(key);
        pendingText.set(key, {
          prefix: `/inspect ${state.orderNumber} ${state.items.map(({ code, result }) => `${code}=${result}`).join(',')}`,
          prompt: { ru: 'Напишите краткий итог проверки.', uz: 'Tekshiruv xulosasini yozing.' },
        });
        await ctx.reply(pendingText.get(key)?.prompt[selected] ?? '');
      }
    }
  });

  bot.on('message:photo', async (ctx) => {
    if (!ctx.from) return;
    const photo = ctx.message.photo.at(-1);
    if (!photo) return;
    const key = ctx.from.id.toString();
    const pending = pendingPhoto.get(key);
    const caption = pending
      ? `/evidence ${pending.orderNumber} ${pending.phase}`
      : (ctx.message.caption ?? '');
    if (pending) pendingPhoto.delete(key);
    const result = await controller.handleEvidence(
      BigInt(ctx.from.id),
      caption,
      {
        fileId: photo.file_id,
        fileSize: photo.file_size ?? 0,
        fileUniqueId: photo.file_unique_id,
      },
      language(ctx),
    );
    await ctx.reply(result);
  });

  bot.catch(async ({ error, ctx }) => {
    const normalized = error instanceof Error ? error : new Error('Unknown Telegram handler error');
    options.onError?.(normalized, ctx.update.update_id);
    const selected = language(ctx);
    const safeMessage =
      normalized instanceof DomainRuleError && normalized.code === 'COMMAND_INVALID'
        ? normalized.message
        : localized(
            selected,
            'Amal bajarilmadi. Menyudan qayta urinib ko‘ring.',
            'Не удалось выполнить действие. Повторите через меню.',
          );
    await ctx.reply(safeMessage);
  });
  return bot;
}
