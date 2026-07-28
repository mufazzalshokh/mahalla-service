import { describe, expect, it } from 'vitest';

import { planResidentUpdate } from '../src/application/intake/resident-intake-planner.js';
import type {
  CategoryOption,
  IntakePlan,
  IntakePlanningContext,
  IntakeSession,
  ResidentUpdateCommand,
  ResidentUpdateInput,
} from '../src/application/intake/intake-types.js';

const categories: readonly CategoryOption[] = [{ id: 'category-1', label: 'Santexnika' }];
const now = new Date('2026-07-28T05:00:00.000Z');

function command(updateId: bigint, input: ResidentUpdateInput): ResidentUpdateCommand {
  return { input, telegramUserId: 1001n, updateId };
}

function plan(
  updateId: bigint,
  input: ResidentUpdateInput,
  session?: IntakeSession,
  extra: Partial<IntakePlanningContext> = {},
): IntakePlan {
  return planResidentUpdate(command(updateId, input), {
    categories,
    now,
    ...(session ? { session } : {}),
    ...extra,
  });
}

describe('resident intake planner', () => {
  it('plans the complete resident flow through exactly one submission intent', () => {
    let result = plan(1n, { kind: 'start' });
    expect(result.response.key).toBe('choose_language');
    expect(result.response.actions).toEqual([
      { data: 'lang:uz-Latn', labelKey: "🇺🇿 O'zbekcha" },
      { data: 'lang:ru', labelKey: '🇷🇺 Русский' },
    ]);

    result = plan(2n, { data: 'lang:uz-Cyrl', kind: 'callback' }, result.session);
    expect(result).toMatchObject({
      response: { key: 'privacy_notice', language: 'uz-Cyrl' },
      session: { step: 'ACCEPT_PRIVACY' },
    });

    result = plan(3n, { data: 'consent:accept', kind: 'callback' }, result.session);
    expect(result.acceptPrivacyVersion).toBeTruthy();
    expect(result.response.key).toBe('enter_full_name');

    result = plan(4n, { kind: 'text', text: 'Ali Valiyev' }, result.session);
    expect(result.response.requestContact).toBe(true);

    result = plan(
      5n,
      { contactTelegramUserId: 1001n, kind: 'contact', phone: '+998 90 123-45-67' },
      result.session,
    );
    expect(result.session.draft.phone).toBe('+998901234567');
    expect(result.response.categories).toEqual(categories);

    result = plan(6n, { data: 'category:category-1', kind: 'callback' }, result.session);
    expect(result.response.key).toBe('choose_urgency');
    result = plan(7n, { data: 'urgency:IMPORTANT', kind: 'callback' }, result.session);
    result = plan(8n, { kind: 'text', text: 'Quvurdan suv oqmoqda' }, result.session);
    expect(result.response).toMatchObject({ key: 'enter_address', requestLocation: true });
    const manual = plan(9n, { data: 'address:manual', kind: 'callback' }, result.session);
    expect(manual.response.key).toBe('enter_address_manual');
    expect(manual.session).toEqual(result.session);
    result = plan(
      10n,
      { kind: 'location', latitude: 41.311081, longitude: 69.240562 },
      result.session,
    );
    const visitDate = result.response.actions?.find(({ data }) => data.startsWith('visit:date:'));
    if (!visitDate) throw new Error('Expected a visit date action');
    result = plan(11n, { data: visitDate.data, kind: 'callback' }, result.session);
    const period = result.response.actions?.[0];
    if (!period) throw new Error('Expected a visit period action');
    result = plan(12n, { data: period.data, kind: 'callback' }, result.session);
    const slot = result.response.actions?.[0];
    if (!slot) throw new Error('Expected a visit slot action');
    result = plan(13n, { data: slot.data, kind: 'callback' }, result.session);
    result = plan(
      14n,
      {
        kind: 'photo',
        photo: { fileId: 'file-1', fileSize: 1_024, fileUniqueId: 'unique-1' },
      },
      result.session,
    );
    expect(result.response).toMatchObject({ key: 'photo_added', parameters: { count: '1' } });

    result = plan(15n, { data: 'photos:done', kind: 'callback' }, result.session);
    expect(result.response).toMatchObject({
      key: 'review_request',
      parameters: {
        category: 'Santexnika',
        fullName: 'Ali Valiyev',
        photoCount: '1',
        urgency: 'Муҳим — 1–3 кун ичида',
      },
    });

    result = plan(16n, { data: 'submit:confirm', kind: 'callback' }, result.session);
    expect(result.submit).toBe(true);
    expect(result.session.step).toBe('SUBMITTED');
    expect(result.response).toMatchObject({
      actions: [{ data: 'status:__GENERATED_TICKET__', labelKey: 'button_check_status' }],
      showMainMenu: true,
    });
  });

  it('supports Russian as a persisted intake language', () => {
    const start = plan(1n, { kind: 'start' });
    const selected = plan(2n, { data: 'lang:ru', kind: 'callback' }, start.session);
    expect(selected).toMatchObject({
      response: { key: 'privacy_notice', language: 'ru' },
      session: { language: 'ru', step: 'ACCEPT_PRIVACY' },
    });
  });

  it('enforces consent, contact ownership, category and text validation', () => {
    const language = plan(1n, { kind: 'start' }).session;
    const consent = plan(2n, { data: 'lang:uz-Latn', kind: 'callback' }, language).session;
    expect(plan(3n, { data: 'consent:decline', kind: 'callback' }, consent).response.key).toBe(
      'consent_required',
    );
    const fullName = plan(4n, { data: 'consent:accept', kind: 'callback' }, consent).session;
    expect(plan(5n, { kind: 'text', text: 'Ali' }, fullName).response.key).toBe(
      'invalid_full_name',
    );
    const contact = plan(6n, { kind: 'text', text: 'Ali Valiyev' }, fullName).session;
    expect(
      plan(7n, { contactTelegramUserId: 999n, kind: 'contact', phone: '+998901234567' }, contact)
        .response.key,
    ).toBe('contact_must_be_own');
    expect(
      plan(8n, { contactTelegramUserId: 1001n, kind: 'contact', phone: '12' }, contact).response
        .key,
    ).toBe('invalid_contact');

    const category = plan(
      9n,
      { contactTelegramUserId: 1001n, kind: 'contact', phone: '+998901234567' },
      contact,
    ).session;
    expect(plan(10n, { data: 'category:forged', kind: 'callback' }, category).response.key).toBe(
      'invalid_category',
    );
    const description = plan(
      11n,
      { data: 'category:category-1', kind: 'callback' },
      category,
    ).session;
    expect(plan(12n, { data: 'urgency:forged', kind: 'callback' }, description).response.key).toBe(
      'invalid_urgency',
    );
    const text = plan(13n, { data: 'urgency:PLANNED', kind: 'callback' }, description).session;
    expect(plan(14n, { kind: 'text', text: 'short' }, text).response.key).toBe(
      'invalid_description',
    );
  });

  it('validates addresses and photo limits', () => {
    const address: IntakeSession = {
      draft: {
        categoryId: 'category-1',
        description: 'Long enough description',
        phone: '+998901234567',
        photos: [],
      },
      language: 'uz-Latn',
      step: 'ENTER_ADDRESS',
      version: 5,
    };
    expect(plan(1n, { kind: 'text', text: 'x' }, address).response.key).toBe('invalid_address');
    expect(
      plan(2n, { kind: 'location', latitude: 100, longitude: 69.2 }, address).response.key,
    ).toBe('invalid_address');
    expect(plan(2n, { kind: 'text', text: '12 Main Street' }, address).response.key).toBe(
      'choose_visit_date',
    );
    const photoStep: IntakeSession = { ...address, step: 'ADD_PHOTOS' };
    expect(
      plan(3n, { kind: 'photo', photo: { fileId: 'x', fileSize: 0, fileUniqueId: 'x' } }, photoStep)
        .response.key,
    ).toBe('photo_invalid');
    expect(
      plan(
        3n,
        { kind: 'photo', photo: { fileId: ' unsafe ', fileSize: 1, fileUniqueId: 'x' } },
        photoStep,
      ).response.key,
    ).toBe('photo_invalid');
    const full: IntakeSession = {
      ...photoStep,
      draft: {
        ...photoStep.draft,
        photos: [1, 2, 3].map((number) => ({
          fileId: `f${number}`,
          fileSize: 1,
          fileUniqueId: `u${number}`,
        })),
      },
    };
    expect(
      plan(4n, { kind: 'photo', photo: { fileId: 'f4', fileSize: 1, fileUniqueId: 'u4' } }, full)
        .response.key,
    ).toBe('photo_limit');
  });

  it('returns only an owner-provided ticket view and requires start otherwise', () => {
    expect(plan(1n, { kind: 'text', text: 'hello' }).response.key).toBe('start_required');
    expect(plan(2n, { kind: 'status', ticketNumber: 'MCK-1' }).response.key).toBe(
      'ticket_not_found',
    );
    expect(
      plan(3n, { kind: 'status', ticketNumber: 'MCK-1' }, undefined, {
        ticket: { status: 'RECEIVED', ticketNumber: 'MCK-1' },
      }).response,
    ).toMatchObject({ key: 'status_result', parameters: { status: 'RECEIVED' } });
  });

  it('supports restart from any existing step', () => {
    const session: IntakeSession = {
      draft: { photos: [] },
      language: 'uz-Cyrl',
      step: 'REVIEW',
      version: 7,
    };
    expect(plan(1n, { data: 'intake:restart', kind: 'callback' }, session)).toMatchObject({
      response: { key: 'choose_language' },
      session: { step: 'CHOOSE_LANGUAGE' },
    });
  });
});
