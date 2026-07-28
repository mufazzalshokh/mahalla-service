import { Bot, InlineKeyboard, Keyboard, type Context } from 'grammy';

import type { HandleResidentUpdateService } from '../../application/intake/handle-resident-update-service.js';
import type {
  ResidentUpdateCommand,
  ResidentUpdateInput,
} from '../../application/intake/intake-types.js';
import type { RespondToInformationService } from '../../application/requests/respond-to-information-service.js';
import type { ResidentQualityService } from '../../application/quality/quality-service.js';
import { formatTashkentDateTime } from '../../domain/shared/tashkent-date-time.js';
import {
  botLanguageFromTelegram,
  type BotLanguage,
} from '../../application/localization/bot-language.js';
import { ResidentTelegramController, type TelegramReply } from './resident-telegram-controller.js';
import { translate } from './translations.js';
import { residentQualityMessage } from './resident-quality-messages.js';
import {
  isManualAddressButton,
  residentMainMenu,
  residentMenuActionForText,
} from './resident-menu.js';
import { PhotoAlbumBuffer } from './photo-album-buffer.js';
import { TransientStore } from './transient-store.js';
import type { UpdateRateLimiter } from './update-rate-limiter.js';

export interface ResidentBotOptions {
  readonly onError?: (error: Error, updateId: number) => void;
  readonly onUpdate?: (
    outcome: 'failed' | 'rate_limited' | 'succeeded',
    durationMilliseconds: number,
  ) => void;
  readonly rateLimiter?: UpdateRateLimiter;
  readonly service: HandleResidentUpdateService;
  readonly respondToInformation?: RespondToInformationService;
  readonly quality?: ResidentQualityService;
  readonly token: string;
}

function command(ctx: Context, input: ResidentUpdateInput): ResidentUpdateCommand | undefined {
  if (!ctx.from) return undefined;
  return {
    input,
    telegramUserId: BigInt(ctx.from.id),
    updateId: BigInt(ctx.update.update_id),
  };
}

async function reply(ctx: Context, response: TelegramReply): Promise<void> {
  if (response.contactLabel) {
    const keyboard = new Keyboard().requestContact(response.contactLabel).resized().oneTime();
    await ctx.reply(response.text, { reply_markup: keyboard });
    return;
  }
  if (response.locationLabel && response.manualAddressLabel) {
    const keyboard = new Keyboard()
      .requestLocation(response.locationLabel)
      .text(response.manualAddressLabel)
      .resized()
      .oneTime();
    await ctx.reply(response.text, { reply_markup: keyboard });
    return;
  }
  if (response.inlineActions.length > 0) {
    const keyboard = new InlineKeyboard();
    for (const [index, action] of response.inlineActions.entries()) {
      keyboard.text(action.label, action.data);
      if ((index + 1) % response.actionColumns === 0) keyboard.row();
    }
    await ctx.reply(response.text, { reply_markup: keyboard });
    if (response.mainMenuLanguage) {
      const supported = response.mainMenuLanguage === 'ru' ? 'ru' : 'uz-Latn';
      await ctx.reply(translate(supported, 'main_menu_ready'), {
        reply_markup: residentMainMenu(response.mainMenuLanguage),
      });
    }
    return;
  }
  if (response.mainMenuLanguage) {
    await ctx.reply(response.text, { reply_markup: residentMainMenu(response.mainMenuLanguage) });
    return;
  }
  await ctx.reply(response.text, { reply_markup: { remove_keyboard: true } });
}

async function dispatch(
  ctx: Context,
  input: ResidentUpdateInput,
  controller: ResidentTelegramController,
): Promise<void> {
  const updateCommand = command(ctx, input);
  if (!updateCommand) return;
  const result = await controller.handle(updateCommand);
  await reply(ctx, result);
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
}

export function createResidentBot(options: ResidentBotOptions): Bot {
  const bot = new Bot(options.token);
  const controller = new ResidentTelegramController(options.service);
  const languages = new TransientStore<BotLanguage>(24 * 60 * 60 * 1_000, 5_000);
  const pendingStatus = new TransientStore<true>(10 * 60 * 1_000, 5_000);
  const language = (ctx: Context): BotLanguage => {
    if (!ctx.from) return 'uz';
    return languages.get(ctx.from.id.toString()) ?? botLanguageFromTelegram(ctx.from.language_code);
  };

  const handleError = async (ctx: Context, error: unknown): Promise<void> => {
    const normalized = error instanceof Error ? error : new Error('Unknown Telegram handler error');
    options.onError?.(normalized, ctx.update.update_id);
    await ctx.reply(translate(language(ctx) === 'ru' ? 'ru' : 'uz-Latn', 'unexpected_error'));
  };

  bot.use(async (ctx, next) => {
    const startedAt = performance.now();
    try {
      if (ctx.from && options.rateLimiter) {
        const decision = options.rateLimiter.consume(ctx.from.id.toString());
        if (!decision.allowed) {
          options.onUpdate?.('rate_limited', performance.now() - startedAt);
          await ctx.reply(
            translate(language(ctx) === 'ru' ? 'ru' : 'uz-Latn', 'rate_limited', {
              seconds: String(decision.retryAfterSeconds),
            }),
          );
          return;
        }
      }
      await next();
      options.onUpdate?.('succeeded', performance.now() - startedAt);
    } catch (error: unknown) {
      options.onUpdate?.('failed', performance.now() - startedAt);
      throw error;
    }
  });

  interface PhotoEnvelope {
    readonly ctx: Context;
    readonly input: Extract<ResidentUpdateInput, { readonly kind: 'photo' }>;
  }
  const photoAlbums = new PhotoAlbumBuffer<PhotoEnvelope>(
    async (items) => {
      const ordered = [...items].sort(
        (left, right) => left.ctx.update.update_id - right.ctx.update.update_id,
      );
      let final: { readonly ctx: Context; readonly response: TelegramReply } | undefined;
      for (const item of ordered) {
        const updateCommand = command(item.ctx, item.input);
        if (!updateCommand) continue;
        final = { ctx: item.ctx, response: await controller.handle(updateCommand) };
      }
      if (final) await reply(final.ctx, final.response);
    },
    (error, items) => {
      const last = items.at(-1);
      if (last) void handleError(last.ctx, error);
    },
  );

  const showMainMenu = async (ctx: Context): Promise<void> => {
    const selected = language(ctx);
    await ctx.reply(translate(selected === 'ru' ? 'ru' : 'uz-Latn', 'main_menu_ready'), {
      reply_markup: residentMainMenu(selected),
    });
  };
  bot.command('start', async (ctx) => {
    if (ctx.from) pendingStatus.delete(ctx.from.id.toString());
    await showMainMenu(ctx);
  });
  bot.command('menu', showMainMenu);
  bot.command('status', (ctx) =>
    dispatch(ctx, { kind: 'status', ticketNumber: ctx.match.trim().toUpperCase() }, controller),
  );
  bot.command('respond', async (ctx) => {
    if (!ctx.from || !options.respondToInformation) return;
    const [ticketNumber, ...informationParts] = ctx.match.trim().split(/\s+/u);
    const information = informationParts.join(' ').trim();
    if (!ticketNumber || information.length < 3) {
      await ctx.reply(residentQualityMessage(language(ctx), 'respond_usage'));
      return;
    }
    const request = await options.respondToInformation.execute(
      BigInt(ctx.from.id),
      ticketNumber,
      information,
    );
    await ctx.reply(
      residentQualityMessage(language(ctx), 'respond_saved', { reference: request.ticketNumber }),
    );
  });
  bot.command('accept', async (ctx) => {
    if (!ctx.from || !options.quality) return;
    const orderNumber = ctx.match.trim().toUpperCase();
    if (!orderNumber) {
      await ctx.reply(residentQualityMessage(language(ctx), 'accept_usage'));
      return;
    }
    const order = await options.quality.accept(BigInt(ctx.from.id), orderNumber);
    await ctx.reply(
      residentQualityMessage(language(ctx), 'accepted', { reference: order.orderNumber }),
    );
  });
  bot.command('rework', async (ctx) => {
    if (!ctx.from || !options.quality) return;
    const [rawOrderNumber, ...reasonParts] = ctx.match.trim().split(/\s+/u);
    const reason = reasonParts.join(' ').trim();
    if (!rawOrderNumber || reason.length < 3) {
      await ctx.reply(residentQualityMessage(language(ctx), 'rework_usage'));
      return;
    }
    const order = await options.quality.requireRework(
      BigInt(ctx.from.id),
      rawOrderNumber.toUpperCase(),
      reason,
    );
    await ctx.reply(
      residentQualityMessage(language(ctx), 'rework_accepted', { reference: order.orderNumber }),
    );
  });
  bot.command('rate', async (ctx) => {
    if (!ctx.from || !options.quality) return;
    const [rawOrderNumber, rawRating, ...commentParts] = ctx.match.trim().split(/\s+/u);
    if (!rawOrderNumber || !rawRating) {
      await ctx.reply(residentQualityMessage(language(ctx), 'rate_usage'));
      return;
    }
    await options.quality.feedback(
      BigInt(ctx.from.id),
      rawOrderNumber.toUpperCase(),
      Number(rawRating),
      commentParts.join(' ').trim() || undefined,
    );
    await ctx.reply(
      residentQualityMessage(language(ctx), 'feedback_saved', {
        reference: rawOrderNumber.toUpperCase(),
      }),
    );
  });
  bot.command('complaint', async (ctx) => {
    if (!ctx.from || !options.quality) return;
    const [rawOrderNumber, ...reasonParts] = ctx.match.trim().split(/\s+/u);
    const reason = reasonParts.join(' ').trim();
    if (!rawOrderNumber || reason.length < 5) {
      await ctx.reply(residentQualityMessage(language(ctx), 'complaint_usage'));
      return;
    }
    const complaint = await options.quality.complaint(
      BigInt(ctx.from.id),
      rawOrderNumber.toUpperCase(),
      reason,
    );
    await ctx.reply(
      residentQualityMessage(language(ctx), 'complaint_created', {
        dueAt: formatTashkentDateTime(complaint.reviewDueAt),
        reference: complaint.code,
      }),
    );
  });
  bot.command('warranty', async (ctx) => {
    if (!ctx.from || !options.quality) return;
    const orderNumber = ctx.match.trim().toUpperCase();
    if (!orderNumber) {
      await ctx.reply(residentQualityMessage(language(ctx), 'warranty_usage'));
      return;
    }
    const warranty = await options.quality.warranty(BigInt(ctx.from.id), orderNumber);
    await ctx.reply(
      residentQualityMessage(language(ctx), 'warranty', {
        days: warranty.warrantyDays,
        dueAt: formatTashkentDateTime(warranty.endsAt),
        reference: orderNumber,
      }),
    );
  });
  bot.on('callback_query:data', (ctx) => {
    if (ctx.from && ctx.callbackQuery.data.startsWith('lang:')) {
      const selected = ctx.callbackQuery.data.slice('lang:'.length);
      if (selected === 'ru' || selected === 'uz-Latn') {
        languages.set(ctx.from.id.toString(), selected === 'ru' ? 'ru' : 'uz');
      }
    }
    if (ctx.callbackQuery.data.startsWith('status:')) {
      return dispatch(
        ctx,
        {
          kind: 'status',
          ticketNumber: ctx.callbackQuery.data.slice('status:'.length).toUpperCase(),
        },
        controller,
      );
    }
    return dispatch(ctx, { data: ctx.callbackQuery.data, kind: 'callback' }, controller);
  });
  bot.on('message:contact', (ctx) =>
    dispatch(
      ctx,
      {
        contactTelegramUserId: BigInt(ctx.message.contact.user_id ?? 0),
        kind: 'contact',
        phone: ctx.message.contact.phone_number,
      },
      controller,
    ),
  );
  bot.on('message:location', (ctx) =>
    dispatch(
      ctx,
      {
        kind: 'location',
        latitude: ctx.message.location.latitude,
        longitude: ctx.message.location.longitude,
      },
      controller,
    ),
  );
  bot.on('message:photo', (ctx) => {
    const photo = ctx.message.photo.at(-1);
    if (!photo) return Promise.resolve();
    const input = {
      kind: 'photo',
      photo: {
        fileId: photo.file_id,
        fileSize: photo.file_size ?? 0,
        fileUniqueId: photo.file_unique_id,
      },
    } as const;
    photoAlbums.add(ctx.from.id.toString(), { ctx, input });
    return Promise.resolve();
  });
  bot.on('message:text', async (ctx) => {
    const key = ctx.from.id.toString();
    const text = ctx.message.text;
    if (isManualAddressButton(text)) {
      await dispatch(ctx, { data: 'address:manual', kind: 'callback' }, controller);
      return;
    }
    const menuAction = residentMenuActionForText(text);
    if (menuAction === 'new-request' || menuAction === 'language') {
      pendingStatus.delete(key);
      await ctx.reply(translate(language(ctx) === 'ru' ? 'ru' : 'uz-Latn', 'new_request_started'), {
        reply_markup: { remove_keyboard: true },
      });
      await dispatch(ctx, { kind: 'start' }, controller);
      return;
    }
    if (menuAction === 'status') {
      pendingStatus.set(key, true);
      await ctx.reply(translate(language(ctx) === 'ru' ? 'ru' : 'uz-Latn', 'enter_ticket_number'));
      return;
    }
    if (menuAction === 'help') {
      const selected = language(ctx);
      await ctx.reply(translate(selected === 'ru' ? 'ru' : 'uz-Latn', 'resident_help'), {
        reply_markup: residentMainMenu(selected),
      });
      return;
    }
    if (pendingStatus.get(key)) {
      pendingStatus.delete(key);
      await dispatch(ctx, { kind: 'status', ticketNumber: text.trim().toUpperCase() }, controller);
      return;
    }
    await dispatch(ctx, { kind: 'text', text }, controller);
  });

  bot.catch(async ({ error, ctx }) => {
    await handleError(ctx, error);
  });
  return bot;
}
