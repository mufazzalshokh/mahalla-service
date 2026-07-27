import { DomainRuleError } from '../../domain/shared/domain-errors.js';
import type {
  CategoryOption,
  IntakeDraft,
  IntakePlan,
  IntakePlanningContext,
  IntakeResponse,
  ResponseAction,
  IntakeSession,
  ResidentUpdateCommand,
  SupportedLanguage,
} from './intake-types.js';

export const currentPrivacyNoticeVersion = '2026-07-27-v1';
const defaultLanguage: SupportedLanguage = 'uz-Latn';
const maximumPhotoBytes = 10 * 1024 * 1024;
const maximumPhotos = 3;

function initialSession(): IntakeSession {
  return { draft: { photos: [] }, step: 'CHOOSE_LANGUAGE', version: 0 };
}

function response(
  key: IntakeResponse['key'],
  language: SupportedLanguage,
  extra: Omit<IntakeResponse, 'key' | 'language'> = {},
): IntakeResponse {
  return { key, language, ...extra };
}

function next(
  current: IntakeSession,
  step: IntakeSession['step'],
  draft: IntakeDraft = current.draft,
  language: SupportedLanguage | undefined = current.language,
): IntakeSession {
  return {
    draft,
    ...(language ? { language } : {}),
    step,
    version: current.version + 1,
  };
}

function languageFromCallback(data: string): SupportedLanguage | undefined {
  if (data === 'lang:uz-Latn') return 'uz-Latn';
  if (data === 'lang:uz-Cyrl') return 'uz-Cyrl';
  return undefined;
}

function normalizePhone(value: string): string | undefined {
  const compact = value.replace(/[\s()-]/g, '');
  const normalized = compact.startsWith('+') ? compact : `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : undefined;
}

function reviewResponse(session: IntakeSession, language: SupportedLanguage): IntakeResponse {
  return response('review_request', language, {
    actions: [
      { data: 'submit:confirm', labelKey: 'button_confirm' },
      { data: 'intake:restart', labelKey: 'button_restart' },
    ],
    parameters: {
      address: session.draft.addressLine ?? '',
      category: session.draft.categoryLabel ?? '',
      description: session.draft.description ?? '',
      photoCount: String(session.draft.photos.length),
    },
  });
}

function categoryActions(categories: readonly CategoryOption[]): readonly ResponseAction[] {
  return categories.map((category) => ({
    data: `category:${category.id}`,
    labelKey: category.label,
  }));
}

export function planResidentUpdate(
  command: ResidentUpdateCommand,
  context: IntakePlanningContext,
): IntakePlan {
  const current = context.session ?? initialSession();
  const language = current.language ?? defaultLanguage;
  const input = command.input;

  if (input.kind === 'start' || (input.kind === 'callback' && input.data === 'intake:restart')) {
    const session = next(initialSession(), 'CHOOSE_LANGUAGE');
    return {
      response: response('choose_language', defaultLanguage, {
        actions: [
          { data: 'lang:uz-Latn', labelKey: "O'zbekcha" },
          { data: 'lang:uz-Cyrl', labelKey: 'Ўзбекча' },
        ],
      }),
      session,
    };
  }

  if (input.kind === 'status') {
    return {
      response: context.ticket
        ? response('status_result', language, {
            parameters: {
              status: context.ticket.status,
              ticketNumber: context.ticket.ticketNumber,
            },
          })
        : response('ticket_not_found', language),
      session: current,
    };
  }

  if (!context.session) {
    return { response: response('start_required', language), session: current };
  }

  if (current.step === 'CHOOSE_LANGUAGE' && input.kind === 'callback') {
    const selected = languageFromCallback(input.data);
    if (selected) {
      const session = next(current, 'ACCEPT_PRIVACY', current.draft, selected);
      return {
        response: response('privacy_notice', selected, {
          actions: [
            { data: 'consent:accept', labelKey: 'button_accept' },
            { data: 'consent:decline', labelKey: 'button_decline' },
          ],
          parameters: { version: currentPrivacyNoticeVersion },
        }),
        session,
      };
    }
  }

  if (current.step === 'ACCEPT_PRIVACY' && input.kind === 'callback') {
    if (input.data === 'consent:accept') {
      const session = next(current, 'SHARE_CONTACT');
      return {
        acceptPrivacyVersion: currentPrivacyNoticeVersion,
        response: response('share_contact', language, { requestContact: true }),
        session,
      };
    }
    if (input.data === 'consent:decline') {
      return { response: response('consent_required', language), session: current };
    }
  }

  if (current.step === 'SHARE_CONTACT' && input.kind === 'contact') {
    if (input.contactTelegramUserId !== command.telegramUserId) {
      return {
        response: response('contact_must_be_own', language, { requestContact: true }),
        session: current,
      };
    }
    const phone = normalizePhone(input.phone);
    if (!phone) {
      return {
        response: response('invalid_contact', language, { requestContact: true }),
        session: current,
      };
    }
    const session = next(current, 'CHOOSE_CATEGORY', { ...current.draft, phone });
    return {
      response: response('choose_category', language, {
        actions: categoryActions(context.categories),
        categories: context.categories,
      }),
      session,
    };
  }

  if (current.step === 'CHOOSE_CATEGORY' && input.kind === 'callback') {
    const id = input.data.startsWith('category:') ? input.data.slice('category:'.length) : '';
    const category = context.categories.find((candidate) => candidate.id === id);
    if (category) {
      const session = next(current, 'ENTER_DESCRIPTION', {
        ...current.draft,
        categoryId: category.id,
        categoryLabel: category.label,
      });
      return { response: response('enter_description', language), session };
    }
    return {
      response: response('invalid_category', language, {
        actions: categoryActions(context.categories),
        categories: context.categories,
      }),
      session: current,
    };
  }

  if (current.step === 'ENTER_DESCRIPTION' && input.kind === 'text') {
    const description = input.text.trim();
    if (description.length < 10 || description.length > 2_000) {
      return { response: response('invalid_description', language), session: current };
    }
    const session = next(current, 'ENTER_ADDRESS', { ...current.draft, description });
    return { response: response('enter_address', language), session };
  }

  if (current.step === 'ENTER_ADDRESS' && (input.kind === 'text' || input.kind === 'location')) {
    const addressLine = input.kind === 'text' ? input.text.trim() : 'Telegram shared location';
    const invalidCoordinates =
      input.kind === 'location' &&
      (input.latitude < -90 ||
        input.latitude > 90 ||
        input.longitude < -180 ||
        input.longitude > 180);
    if (addressLine.length < 3 || addressLine.length > 500 || invalidCoordinates) {
      return { response: response('invalid_address', language), session: current };
    }
    const session = next(current, 'ADD_PHOTOS', {
      ...current.draft,
      addressLine,
      ...(input.kind === 'location'
        ? { latitude: input.latitude, longitude: input.longitude }
        : {}),
    });
    return {
      response: response('add_photos', language, {
        actions: [{ data: 'photos:done', labelKey: 'button_done' }],
      }),
      session,
    };
  }

  if (current.step === 'ADD_PHOTOS' && input.kind === 'photo') {
    if (input.photo.fileSize <= 0 || input.photo.fileSize > maximumPhotoBytes) {
      return { response: response('photo_invalid', language), session: current };
    }
    if (current.draft.photos.length >= maximumPhotos) {
      return { response: response('photo_limit', language), session: current };
    }
    const session = next(current, 'ADD_PHOTOS', {
      ...current.draft,
      photos: [...current.draft.photos, input.photo],
    });
    return {
      response: response('photo_added', language, {
        actions: [{ data: 'photos:done', labelKey: 'button_done' }],
        parameters: { count: String(session.draft.photos.length) },
      }),
      session,
    };
  }

  if (current.step === 'ADD_PHOTOS' && input.kind === 'callback' && input.data === 'photos:done') {
    const session = next(current, 'REVIEW');
    return { response: reviewResponse(session, language), session };
  }

  if (current.step === 'REVIEW' && input.kind === 'callback' && input.data === 'submit:confirm') {
    const required = [
      current.draft.phone,
      current.draft.categoryId,
      current.draft.description,
      current.draft.addressLine,
    ];
    if (required.some((value) => !value)) {
      throw new DomainRuleError('INCOMPLETE_INTAKE', 'Intake draft is incomplete');
    }
    return {
      response: response('submitted', language, {
        parameters: { ticketNumber: '__GENERATED_TICKET__' },
      }),
      session: next(current, 'SUBMITTED'),
      submit: true,
    };
  }

  return { response: response('start_required', language), session: current };
}
