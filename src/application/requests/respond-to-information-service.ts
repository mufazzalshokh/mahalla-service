import type { PrincipalProvider } from '../identity/principal-provider.js';
import { EntityNotFoundError } from '../../domain/shared/domain-errors.js';
import type { RequestRecord } from './request-repository.js';
import type { TransitionRequestService } from './transition-request-service.js';

export class RespondToInformationService {
  constructor(
    private readonly principals: PrincipalProvider,
    private readonly transitions: TransitionRequestService,
  ) {}

  async execute(
    telegramUserId: bigint,
    ticketNumber: string,
    information: string,
  ): Promise<RequestRecord> {
    const principal = await this.principals.loadByTelegramUserId(telegramUserId);
    if (!principal) throw new EntityNotFoundError('TelegramUser', String(telegramUserId));
    return this.transitions.execute(
      {
        data: { providedInformation: information },
        ticketNumber: ticketNumber.trim().toUpperCase(),
        to: 'VALIDATING',
      },
      principal,
    );
  }
}
