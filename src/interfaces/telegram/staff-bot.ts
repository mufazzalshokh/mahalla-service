import { Bot, InputFile } from 'grammy';

import type { StaffOperations } from '../../application/triage/staff-operations-service.js';
import { StaffTelegramController } from './staff-telegram-controller.js';

export interface StaffBotOptions {
  readonly onError?: (error: Error, updateId: number) => void;
  readonly operations: StaffOperations;
  readonly token: string;
}

export function createStaffBot(options: StaffBotOptions): Bot {
  const bot = new Bot(options.token);
  const controller = new StaffTelegramController(options.operations);
  bot.on('message:text', async (ctx) => {
    if (!ctx.from) return;
    const reply = await controller.handle(BigInt(ctx.from.id), ctx.message.text);
    if (typeof reply === 'string') await ctx.reply(reply);
    else {
      await ctx.replyWithDocument(
        new InputFile(Buffer.from(reply.content, 'utf8'), reply.fileName),
        {
          caption: reply.caption,
        },
      );
    }
  });
  bot.on('message:photo', async (ctx) => {
    if (!ctx.from) return;
    const photo = ctx.message.photo.at(-1);
    if (!photo) return;
    const reply = await controller.handleEvidence(BigInt(ctx.from.id), ctx.message.caption ?? '', {
      fileId: photo.file_id,
      fileSize: photo.file_size ?? 0,
      fileUniqueId: photo.file_unique_id,
    });
    await ctx.reply(reply);
  });
  bot.catch(async ({ error, ctx }) => {
    const normalized = error instanceof Error ? error : new Error('Unknown Telegram handler error');
    options.onError?.(normalized, ctx.update.update_id);
    await ctx.reply('Amal bajarilmadi. Buyruq va vakolatingizni tekshiring.');
  });
  return bot;
}
