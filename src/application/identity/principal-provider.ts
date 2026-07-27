import type { Principal } from '../../domain/identity/permissions.js';

export interface PrincipalProvider {
  load(userId: string): Promise<Principal | undefined>;
  loadByTelegramUserId(telegramUserId: bigint): Promise<Principal | undefined>;
}
