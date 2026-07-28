import { DomainRuleError } from '../../domain/shared/domain-errors.js';
import {
  addTashkentCalendarDays,
  formatTashkentDate,
  formatTashkentDateTime,
  parseTashkentIsoDateHour,
} from '../../domain/shared/tashkent-date-time.js';
import type {
  CategoryOption,
  IntakeDraft,
  IntakePlan,
  IntakePlanningContext,
  IntakeResponse,
  ResponseAction,
  IntakeSession,
  ResidentUpdateCommand,
  ResidentDeclaredUrgency,
  SupportedLanguage,
} from './intake-types.js';

export const currentPrivacyNoticeVersion = '2026-07-28-v2';
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
  if (data === 'lang:ru') return 'ru';
  return undefined;
}

function normalizePhone(value: string): string | undefined {
  const compact = value.replace(/[\s()-]/g, '');
  const normalized = compact.startsWith('+') ? compact : `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : undefined;
}

function normalizeFullName(value: string): string | undefined {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  const parts = normalized.split(' ');
  return normalized.length >= 3 &&
    normalized.length <= 120 &&
    parts.length >= 2 &&
    parts.every((part) => /\p{L}/u.test(part))
    ? normalized
    : undefined;
}

function urgencyFromCallback(data: string): ResidentDeclaredUrgency | undefined {
  const value = data.startsWith('urgency:') ? data.slice('urgency:'.length) : '';
  return value === 'CRITICAL' || value === 'IMPORTANT' || value === 'PLANNED' ? value : undefined;
}

function urgencyActions(): readonly ResponseAction[] {
  return [
    { data: 'urgency:CRITICAL', labelKey: 'button_urgency_critical' },
    { data: 'urgency:IMPORTANT', labelKey: 'button_urgency_important' },
    { data: 'urgency:PLANNED', labelKey: 'button_urgency_planned' },
  ];
}

function dateActions(urgency: ResidentDeclaredUrgency, now: Date): readonly ResponseAction[] {
  const startDay = urgency === 'PLANNED' ? 1 : 0;
  const dayCount = urgency === 'CRITICAL' ? 3 : urgency === 'IMPORTANT' ? 4 : 7;
  const actions: ResponseAction[] =
    urgency === 'CRITICAL' ? [{ data: 'visit:asap', labelKey: 'button_visit_asap' }] : [];
  for (let offset = startDay; offset < startDay + dayCount; offset += 1) {
    const date = addTashkentCalendarDays(now, offset);
    if (parseTashkentIsoDateHour(date, 23).getTime() <= now.getTime()) continue;
    const label = formatTashkentDate(parseTashkentIsoDateHour(date, 12));
    actions.push({ data: `visit:date:${date}`, labelKey: `📅 ${label}` });
  }
  return actions;
}

const visitPeriods = [
  { end: 6, key: 'button_period_night', start: 0 },
  { end: 12, key: 'button_period_morning', start: 6 },
  { end: 18, key: 'button_period_day', start: 12 },
  { end: 24, key: 'button_period_evening', start: 18 },
] as const;

function periodActions(date: string, now: Date): readonly ResponseAction[] {
  return visitPeriods
    .filter(({ end }) => parseTashkentIsoDateHour(date, end - 1).getTime() > now.getTime())
    .map(({ key, start }) => ({ data: `visit:period:${start}`, labelKey: key }));
}

function slotActions(date: string, periodStart: number, now: Date): readonly ResponseAction[] {
  return Array.from({ length: 6 }, (_, index) => periodStart + index)
    .filter((hour) => parseTashkentIsoDateHour(date, hour).getTime() > now.getTime())
    .map((hour) => ({
      data: `visit:slot:${hour}`,
      labelKey: `🕐 ${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`,
    }));
}

function urgencyLabel(
  urgency: ResidentDeclaredUrgency | undefined,
  language: SupportedLanguage,
): string {
  return urgency ? responseText(language, `urgency_${urgency.toLowerCase()}`) : '';
}

function visitWindow(draft: IntakeDraft, language: SupportedLanguage): string {
  if (draft.visitAsSoonAsPossible) return responseText(language, 'visit_asap_summary');
  if (!draft.preferredVisitStart || !draft.preferredVisitEnd) return '';
  const start = new Date(draft.preferredVisitStart);
  const end = new Date(draft.preferredVisitEnd);
  return `${formatTashkentDateTime(start)}–${formatTashkentDateTime(end).slice(-5)}`;
}

function responseText(language: SupportedLanguage, key: string): string {
  const values: Readonly<Record<SupportedLanguage, Readonly<Record<string, string>>>> = {
    'uz-Latn': {
      urgency_critical: 'Kritik — shoshilinch',
      urgency_important: 'Muhim — 1–3 kun ichida',
      urgency_planned: 'Rejali — qulay kunda',
      visit_asap_summary: 'Imkon qadar tez',
    },
    'uz-Cyrl': {
      urgency_critical: 'Критик — шошилинч',
      urgency_important: 'Муҳим — 1–3 кун ичида',
      urgency_planned: 'Режали — қулай кунда',
      visit_asap_summary: 'Имкон қадар тез',
    },
    ru: {
      urgency_critical: 'Критично — срочно',
      urgency_important: 'Важно — в течение 1–3 дней',
      urgency_planned: 'Планово — в удобный день',
      visit_asap_summary: 'Как можно скорее',
    },
  };
  return values[language][key] ?? key;
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
      fullName: session.draft.fullName ?? '',
      photoCount: String(session.draft.photos.length),
      urgency: urgencyLabel(session.draft.residentDeclaredUrgency, language),
      visitWindow: visitWindow(session.draft, language),
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
        actionColumns: 2,
        actions: [
          { data: 'lang:uz-Latn', labelKey: "🇺🇿 O'zbekcha" },
          { data: 'lang:ru', labelKey: '🇷🇺 Русский' },
        ],
      }),
      session,
    };
  }

  if (input.kind === 'status') {
    return {
      response: context.ticket
        ? response('status_result', language, {
            actions: [
              {
                data: `status:${context.ticket.ticketNumber}`,
                labelKey: 'button_check_status',
              },
            ],
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
          actionColumns: 2,
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
      const session = next(current, 'ENTER_FULL_NAME');
      return {
        acceptPrivacyVersion: currentPrivacyNoticeVersion,
        response: response('enter_full_name', language),
        session,
      };
    }
    if (input.data === 'consent:decline') {
      return { response: response('consent_required', language), session: current };
    }
  }

  if (current.step === 'ENTER_FULL_NAME' && input.kind === 'text') {
    const fullName = normalizeFullName(input.text);
    if (!fullName) {
      return { response: response('invalid_full_name', language), session: current };
    }
    const session = next(current, 'SHARE_CONTACT', { ...current.draft, fullName });
    return {
      response: response('share_contact', language, { requestContact: true }),
      session,
    };
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
        actionColumns: 2,
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
      const session = next(current, 'CHOOSE_URGENCY', {
        ...current.draft,
        categoryId: category.id,
        categoryLabel: category.label,
      });
      return {
        response: response('choose_urgency', language, {
          actionColumns: 1,
          actions: urgencyActions(),
        }),
        session,
      };
    }
    return {
      response: response('invalid_category', language, {
        actions: categoryActions(context.categories),
        categories: context.categories,
      }),
      session: current,
    };
  }

  if (current.step === 'CHOOSE_URGENCY' && input.kind === 'callback') {
    const residentDeclaredUrgency = urgencyFromCallback(input.data);
    if (!residentDeclaredUrgency) {
      return {
        response: response('invalid_urgency', language, { actions: urgencyActions() }),
        session: current,
      };
    }
    const session = next(current, 'ENTER_DESCRIPTION', {
      ...current.draft,
      residentDeclaredUrgency,
    });
    return { response: response('enter_description', language), session };
  }

  if (current.step === 'ENTER_DESCRIPTION' && input.kind === 'text') {
    const description = input.text.trim();
    if (description.length < 10 || description.length > 2_000) {
      return { response: response('invalid_description', language), session: current };
    }
    const session = next(current, 'ENTER_ADDRESS', { ...current.draft, description });
    return {
      response: response('enter_address', language, { requestLocation: true }),
      session,
    };
  }

  if (
    current.step === 'ENTER_ADDRESS' &&
    input.kind === 'callback' &&
    input.data === 'address:manual'
  ) {
    return { response: response('enter_address_manual', language), session: current };
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
    const session = next(current, 'CHOOSE_VISIT_DATE', {
      ...current.draft,
      addressLine,
      ...(input.kind === 'location'
        ? { latitude: input.latitude, longitude: input.longitude }
        : {}),
    });
    return {
      response: response('choose_visit_date', language, {
        actionColumns: 2,
        actions: dateActions(
          current.draft.residentDeclaredUrgency ?? 'PLANNED',
          context.now ?? new Date(),
        ),
      }),
      session,
    };
  }

  if (current.step === 'CHOOSE_VISIT_DATE' && input.kind === 'callback') {
    const now = context.now ?? new Date();
    if (input.data === 'visit:asap' && current.draft.residentDeclaredUrgency === 'CRITICAL') {
      const session = next(current, 'ADD_PHOTOS', {
        ...current.draft,
        visitAsSoonAsPossible: true,
      });
      return {
        response: response('add_photos', language, {
          actions: [{ data: 'photos:done', labelKey: 'button_done' }],
        }),
        session,
      };
    }
    const date = input.data.startsWith('visit:date:') ? input.data.slice(11) : '';
    const allowed = dateActions(current.draft.residentDeclaredUrgency ?? 'PLANNED', now).some(
      ({ data }) => data === input.data,
    );
    if (!allowed) {
      return {
        response: response('invalid_visit_date', language, {
          actionColumns: 2,
          actions: dateActions(current.draft.residentDeclaredUrgency ?? 'PLANNED', now),
        }),
        session: current,
      };
    }
    const actions = periodActions(date, now);
    const session = next(current, 'CHOOSE_VISIT_PERIOD', {
      ...current.draft,
      preferredVisitDate: date,
      visitAsSoonAsPossible: false,
    });
    return {
      response: response('choose_visit_period', language, { actionColumns: 2, actions }),
      session,
    };
  }

  if (current.step === 'CHOOSE_VISIT_PERIOD' && input.kind === 'callback') {
    const rawStart = input.data.startsWith('visit:period:') ? input.data.slice(13) : '';
    const periodStart = Number(rawStart);
    const date = current.draft.preferredVisitDate ?? '';
    const now = context.now ?? new Date();
    const allowed = periodActions(date, now).some(({ data }) => data === input.data);
    if (!allowed) {
      return {
        response: response('invalid_visit_slot', language, {
          actionColumns: 2,
          actions: periodActions(date, now),
        }),
        session: current,
      };
    }
    const session = next(current, 'CHOOSE_VISIT_SLOT', {
      ...current.draft,
      preferredVisitPeriodStartHour: periodStart,
    });
    return {
      response: response('choose_visit_slot', language, {
        actionColumns: 2,
        actions: slotActions(date, periodStart, now),
      }),
      session,
    };
  }

  if (current.step === 'CHOOSE_VISIT_SLOT' && input.kind === 'callback') {
    const hour = Number(input.data.startsWith('visit:slot:') ? input.data.slice(11) : '');
    const date = current.draft.preferredVisitDate ?? '';
    const periodStart = current.draft.preferredVisitPeriodStartHour ?? -1;
    const now = context.now ?? new Date();
    const allowed = slotActions(date, periodStart, now).some(({ data }) => data === input.data);
    if (!allowed || !Number.isInteger(hour)) {
      return {
        response: response('invalid_visit_slot', language, {
          actionColumns: 2,
          actions: slotActions(date, periodStart, now),
        }),
        session: current,
      };
    }
    const start = parseTashkentIsoDateHour(date, hour);
    const end = new Date(start.getTime() + 60 * 60 * 1_000);
    const session = next(current, 'ADD_PHOTOS', {
      ...current.draft,
      preferredVisitEnd: end.toISOString(),
      preferredVisitStart: start.toISOString(),
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
      current.draft.fullName,
      current.draft.categoryId,
      current.draft.residentDeclaredUrgency,
      current.draft.description,
      current.draft.addressLine,
      current.draft.visitAsSoonAsPossible || current.draft.preferredVisitStart,
    ];
    if (required.some((value) => !value)) {
      throw new DomainRuleError('INCOMPLETE_INTAKE', 'Intake draft is incomplete');
    }
    return {
      response: response('submitted', language, {
        actions: [
          {
            data: 'status:__GENERATED_TICKET__',
            labelKey: 'button_check_status',
          },
        ],
        parameters: { ticketNumber: '__GENERATED_TICKET__' },
        showMainMenu: true,
      }),
      session: next(current, 'SUBMITTED'),
      submit: true,
    };
  }

  return { response: response('start_required', language), session: current };
}
