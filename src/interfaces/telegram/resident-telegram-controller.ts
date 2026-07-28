import type { HandleResidentUpdateService } from '../../application/intake/handle-resident-update-service.js';
import type { ResidentUpdateCommand } from '../../application/intake/intake-types.js';
import { renderResponse, translate } from './translations.js';

export interface TelegramInlineAction {
  readonly data: string;
  readonly label: string;
}

export interface TelegramReply {
  readonly actionColumns: number;
  readonly contactLabel?: string | undefined;
  readonly inlineActions: readonly TelegramInlineAction[];
  readonly text: string;
}

export class ResidentTelegramController {
  constructor(private readonly service: HandleResidentUpdateService) {}

  async handle(command: ResidentUpdateCommand): Promise<TelegramReply> {
    const response = await this.service.execute(command);
    return {
      actionColumns: response.actionColumns ?? 1,
      ...(response.requestContact
        ? { contactLabel: translate(response.language, 'share_contact') }
        : {}),
      inlineActions: (response.actions ?? []).map((action) => ({
        data: action.data,
        label: translate(response.language, action.labelKey),
      })),
      text: renderResponse(response),
    };
  }
}
