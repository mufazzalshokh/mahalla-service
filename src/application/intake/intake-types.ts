export const supportedLanguages = ['uz-Latn', 'uz-Cyrl', 'ru'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const intakeSteps = [
  'CHOOSE_LANGUAGE',
  'ACCEPT_PRIVACY',
  'SHARE_CONTACT',
  'CHOOSE_CATEGORY',
  'ENTER_DESCRIPTION',
  'ENTER_ADDRESS',
  'ADD_PHOTOS',
  'REVIEW',
  'SUBMITTED',
] as const;
export type IntakeStep = (typeof intakeSteps)[number];

export interface IntakePhoto {
  readonly fileId: string;
  readonly fileSize: number;
  readonly fileUniqueId: string;
}

export interface IntakeDraft {
  readonly addressLine?: string | undefined;
  readonly categoryId?: string | undefined;
  readonly categoryLabel?: string | undefined;
  readonly description?: string | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly phone?: string | undefined;
  readonly photos: readonly IntakePhoto[];
}

export interface IntakeSession {
  readonly draft: IntakeDraft;
  readonly language?: SupportedLanguage | undefined;
  readonly step: IntakeStep;
  readonly version: number;
}

export interface CategoryOption {
  readonly id: string;
  readonly label: string;
}

export interface TicketStatusView {
  readonly status: string;
  readonly ticketNumber: string;
}

export type ResidentUpdateInput =
  | { readonly kind: 'start' }
  | { readonly data: string; readonly kind: 'callback' }
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly contactTelegramUserId: bigint;
      readonly kind: 'contact';
      readonly phone: string;
    }
  | { readonly kind: 'location'; readonly latitude: number; readonly longitude: number }
  | { readonly kind: 'photo'; readonly photo: IntakePhoto }
  | { readonly kind: 'status'; readonly ticketNumber: string };

export interface ResidentUpdateCommand {
  readonly input: ResidentUpdateInput;
  readonly telegramUserId: bigint;
  readonly updateId: bigint;
}

export type MessageKey =
  | 'choose_language'
  | 'privacy_notice'
  | 'consent_required'
  | 'share_contact'
  | 'contact_must_be_own'
  | 'invalid_contact'
  | 'choose_category'
  | 'invalid_category'
  | 'enter_description'
  | 'invalid_description'
  | 'enter_address'
  | 'invalid_address'
  | 'add_photos'
  | 'photo_added'
  | 'photo_invalid'
  | 'photo_limit'
  | 'review_request'
  | 'submitted'
  | 'status_result'
  | 'ticket_not_found'
  | 'start_required';

export interface ResponseAction {
  readonly data: string;
  readonly labelKey: string;
}

export interface IntakeResponse {
  readonly actions?: readonly ResponseAction[] | undefined;
  readonly categories?: readonly CategoryOption[] | undefined;
  readonly key: MessageKey;
  readonly language: SupportedLanguage;
  readonly parameters?: Readonly<Record<string, string>> | undefined;
  readonly requestContact?: boolean | undefined;
}

export interface IntakePlanningContext {
  readonly categories: readonly CategoryOption[];
  readonly session?: IntakeSession | undefined;
  readonly ticket?: TicketStatusView | undefined;
}

export interface IntakePlan {
  readonly acceptPrivacyVersion?: string | undefined;
  readonly response: IntakeResponse;
  readonly session: IntakeSession;
  readonly submit?: boolean | undefined;
}
