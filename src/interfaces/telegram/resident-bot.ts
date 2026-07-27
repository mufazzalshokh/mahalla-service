import { Bot, InlineKeyboard, Keyboard, type Context } from 'grammy';

import type { HandleResidentUpdateService } from '../../application/intake/handle-resident-update-service.js';
import type {
  ResidentUpdateCommand,
  ResidentUpdateInput,
} from '../../application/intake/intake-types.js';
import type { RespondToInformationService } from '../../application/requests/respond-to-information-service.js';
import { ResidentTelegramController, type TelegramReply } from './resident-telegram-controller.js';
import { translate } from './translations.js';

export interface ResidentBotOptions {
  readonly onError?: (error: Error, updateId: number) => void;
  readonly service: HandleResidentUpdateService;
  readonly respondToInformation?: RespondToInformationService;
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
  if (response.inlineActions.length > 0) {
    const keyboard = new InlineKeyboard();
    for (const action of response.inlineActions) {
      keyboard.text(action.label, action.data).row();
    }
    await ctx.reply(response.text, { reply_markup: keyboard });
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

  bot.command('start', (ctx) => dispatch(ctx, { kind: 'start' }, controller));
  bot.command('status', (ctx) =>
    dispatch(ctx, { kind: 'status', ticketNumber: ctx.match.trim().toUpperCase() }, controller),
  );
  bot.command('respond', async (ctx) => {
    if (!ctx.from || !options.respondToInformation) return;
    const [ticketNumber, ...informationParts] = ctx.match.trim().split(/\s+/u);
    const information = informationParts.join(' ').trim();
    if (!ticketNumber || information.length < 3) {
      await ctx.reply('/respond TICKET qo‘shimcha ma’lumot');
      return;
    }
    const request = await options.respondToInformation.execute(
      BigInt(ctx.from.id),
      ticketNumber,
      information,
    );
    await ctx.reply(`${request.ticketNumber}: ma’lumot qabul qilindi.`);
  });
  bot.on('callback_query:data', (ctx) =>
    dispatch(ctx, { data: ctx.callbackQuery.data, kind: 'callback' }, controller),
  );
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
    return dispatch(
      ctx,
      {
        kind: 'photo',
        photo: {
          fileId: photo.file_id,
          fileSize: photo.file_size ?? 0,
          fileUniqueId: photo.file_unique_id,
        },
      },
      controller,
    );
  });
  bot.on('message:text', (ctx) =>
    dispatch(ctx, { kind: 'text', text: ctx.message.text }, controller),
  );

  bot.catch(async ({ error, ctx }) => {
    const normalized = error instanceof Error ? error : new Error('Unknown Telegram handler error');
    options.onError?.(normalized, ctx.update.update_id);
    await ctx.reply(translate('uz-Latn', 'unexpected_error'));
  });
  return bot;
}
