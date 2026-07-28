# Customer demonstration guide

This guide is the repeatable sales demonstration for the Mahalla Service Telegram pilot. It shows a
complete request-to-quality loop without promising features or service levels the pilot does not have.

## Demonstration objective

In 15–20 minutes, show that the MCK can replace scattered calls and chats with:

- one resident request number;
- a visible responsible executor and deadline;
- photo-backed execution and a quality checklist;
- resident acceptance, rating and complaint handling;
- a live management portfolio and audit trail.

Use synthetic data only. Do not demonstrate with a real resident’s phone, home address, photographs or
financial records.

## Roles and devices

The clearest demonstration uses three Telegram accounts:

| Role           | Bot          | Required access                                   |
| -------------- | ------------ | ------------------------------------------------- |
| Resident       | Resident bot | No staff role                                     |
| Operator/owner | Staff bot    | `administrator` or area-scoped `operator_manager` |
| Executor       | Staff bot    | Area-scoped `executor`                            |

Two accounts can be used only if the prepared staff account legitimately has the required operator and
executor permissions. Never weaken authorization merely to simplify a demonstration.

Current demonstration bots:

```text
Resident bot: https://t.me/msk_resident_bot
Staff bot:    https://t.me/msk_staff_bot
Demo operator account: <name>
Demo executor account: <name>
```

The staff-bot link may be shared safely: an unknown Telegram account can obtain only its own ID with
`/myid`; it cannot see requests or perform staff operations.

## Pre-demo checklist — five minutes before

1. Open Docker Desktop and wait for the engine.
2. From Git Bash in the repository, run:

```bash
docker compose up -d postgres
docker compose ps
pnpm db:migrate
pnpm db:seed
pnpm dev
```

3. In another terminal, verify:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
```

4. Confirm both Telegram bots answer `/start`.
5. Confirm the operator and executor can open the staff menu.
6. Close or stop every older `pnpm dev` process. Two pollers using the same token cause Telegram
   conflicts.
7. Silence unrelated notifications and enlarge Telegram so customers can read the buttons.

Do not wipe the database before a meeting. Create a new synthetic request; the accumulated portfolio
helps demonstrate history and reporting.

## Suggested synthetic scenario

Use one consistent story:

```text
Resident: Ali Valiyev
Service: Santexnika / Сантехника
Urgency: Muhim — 1–3 kun / Важно — 1–3 дня
Problem: Oshxonadagi suv quvuridan suv oqmoqda. Pol namlanib bormoqda.
Address: Namoyish mahallasi, Amir Temur ko‘chasi, 10-uy
Preferred time: tomorrow, 10:00–11:00
Executor note: Quvur birikmasi almashtirildi va suv bosimi tekshirildi.
```

Use neutral sample photos that reveal no person, real address, document or identifying detail.

## Part 1 — resident creates the request

Open the resident bot and use buttons:

1. Send `/start`.
2. Select `🇺🇿 O'zbekcha` or `🇷🇺 Русский`.
3. Press `🛠 Yangi so‘rov / Новая заявка`.
4. Accept the demonstration privacy notice.
5. Enter the full synthetic name.
6. Share the same Telegram account’s contact using Telegram’s contact button.
7. Choose one of the four seeded services: plumbing, electrical, repair or landscaping.
8. Choose declared urgency:
   - `🔴 Kritik — shoshilinch / Критично — срочно`;
   - `🟠 Muhim — 1–3 kun / Важно — 1–3 дня`;
   - `🟢 Rejali — keyinroq / Планово — позже`.
9. Enter the issue description.
10. Send Telegram location or choose `⌨️ Manzilni yozish / Ввести адрес`.
11. Choose a day, part of day and one-hour window. Critical issues may request “as soon as possible.”
12. Send zero to three photos, then press `✅ Tayyor / Готово`.
13. Review the summary and press `✅ So‘rovni yuborish / Отправить заявку`.
14. Show the returned `MCK-YYYY-NNNNNNNN` number and press `🔎 Holatni tekshirish`.

Explain to the customer: urgency and preferred time are resident input. Staff confirms operational
priority and scheduling; the bot does not make an unsafe automatic promise.

## Part 2 — operator turns the request into controlled work

Open the staff bot as the authorized operator:

1. Send `/menu` and select the presentation language with `🌐 Til / Язык` if needed.
2. Press `📥 So‘rovlar / Заявки`.
3. Select the new `MCK-...` button.
4. Press `👁 Tafsilotlar / Подробности` to show name, contact, issue, address, declared urgency and
   preferred window.
5. Press `Tekshiruvni boshlash / Начать проверку`.
6. Press `O‘xshash so‘rovlar / Похожие заявки`; explain that the system suggests but a human decides.
7. Press `Ustuvorlikni baholash / Оценить приоритет` and enter the prompted safety, urgency,
   affected-resident and social-impact scores.
8. Press `Ro‘yxatga olish / Зарегистрировать` and show the returned `ORD-...` number.
9. Open the order, press `Ijrochilar / Исполнители`, and choose the prepared executor.
10. Enter the requested deadline in Tashkent format `DD.MM.YYYY HH:mm`.

Key message: the request records what the resident needs; the order records who will deliver it, by
when, and with what evidence.

## Part 3 — executor performs the work

Open the staff bot as the assigned executor:

1. Press `🧰 Mening ishlarim / Мои работы` and select the `ORD-...` order.
2. Press `Qabul qilish / Принять`.
3. Press `📷 BEFORE`, then upload one neutral before photo.
4. Press `Ish jarayoni / Ход работы` and enter a short factual update.
5. Optionally demonstrate `To‘xtatish / Приостановить` and `Davom ettirish / Продолжить` with a
   factual reason, but skip this in a short sales meeting.
6. Press `📷 AFTER`, then upload one neutral after photo.
7. Press `Ishni yakunlash / Завершить работу` and enter the completion summary.

If an action is rejected, do not improvise with commands. Reopen `Mening ishlarim`, select the order
and follow the buttons allowed for its current state.

## Part 4 — quality, resident acceptance and feedback

As the operator:

1. Open the order and press `Tekshiruv ro‘yxati / Чек-лист`.
2. Mark every item PASS or FAIL. Electrical work requires a passing inspection before approval.
3. Press `Ishni qabul qilish / Принять работу` when the evidence and checklist are satisfactory.

As the resident:

1. Use the received order code: `/accept ORD-...`.
2. Check warranty information with `/warranty ORD-...`.
3. Submit a rating with `/rate ORD-... 5 optional comment`.
4. If demonstrating service recovery, use `/complaint ORD-... synthetic reason`. It receives a
   `CMP-...` number; staff must review it, and it does not silently reopen work.

As the operator, open `📝 Shikoyatlar / Жалобы` to resolve, reject or open controlled rework with a
recorded reason.

## Part 5 — management view

Finish on the staff bot:

1. Press `📊 Hisobotlar / Отчёты`.
2. Open the weekly report and point out live backlog, open/overdue work, completion and quality.
3. Show that CSV export exists, but do not distribute it during a public demonstration.
4. Optionally open `🔄 PDCA` to show that repeated problems can become owned improvement actions.
5. Mention `💰 Moliya / Финансы` only as an optional operational ledger. It is not a fiscal receipt,
   signed contract or accounting system.

## Sixty-second customer introduction

### Uzbek

> Mahalla Service aholining murojaatini oddiy Telegram so‘rovidan nazorat qilinadigan buyurtmaga
> aylantiradi. Aholi muammo, manzil, qulay vaqt va rasmlarni yuboradi. MCK esa kim mas’ul ekanini,
> muddatni, bajarilish dalillarini, sifatni va shikoyatlarni bitta portfelda ko‘radi. Alohida mobil ilova
> o‘rnatish shart emas; pilotni mavjud Telegram jarayoni bilan tez boshlash mumkin.

### Russian

> Mahalla Service превращает обращение жителя в контролируемый заказ прямо в Telegram. Житель
> отправляет проблему, адрес, удобное время и фотографии. МСК видит ответственного исполнителя,
> срок, доказательства выполнения, качество и жалобы в едином портфеле. Отдельное мобильное
> приложение не требуется, поэтому пилот можно запустить быстро и с минимальными затратами.

## Questions customers usually ask

**Can every resident see all requests?** No. A resident sees only records owned by the same Telegram
account.

**Can anyone with the staff-bot link access operations?** No. The account must be active and have a
persisted role for the service area.

**Does “critical” automatically promise immediate service?** No. It flags resident-declared urgency;
staff validates priority and confirms the visit.

**Does it support Uzbek and Russian?** Yes. Resident intake, persistent menus and core operational
responses support both languages.

**Are photos legally archived?** No. The pilot stores controlled Telegram file references and
metadata. A reviewed durable evidence archive is a later production decision.

**Is the finance module official accounting?** No. It is an auditable operational ledger using
synthetic values until finance/legal approval and integration with an approved fiscal system.

**What is required for a real pilot?** A customer-funded dedicated host, rotated production bot
tokens, approved privacy/retention rules, named primary and backup responders, encrypted off-host
backup and completion of the production-readiness checklist.

## Troubleshooting during a demonstration

| Symptom                                  | Likely reason                                                  | Safe response                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Staff bot says the action is unavailable | Wrong role, area or order state                                | Use `/myid`, confirm onboarding, reopen the entity and use its current buttons                  |
| Telegram reports a polling conflict      | Another app process uses the same token                        | Stop the older `pnpm dev`; keep only one process                                                |
| `/ready` is unavailable                  | PostgreSQL is not healthy or ports do not match                | Check Docker Desktop, `docker compose ps`, `POSTGRES_PORT` and `DATABASE_URL`                   |
| Request is missing from staff queue      | Different database, incomplete submission or unauthorized area | Confirm the resident received an `MCK-...` code and both bots use the same running app/database |
| Executor cannot see an order             | Not assigned, unavailable or missing executor role/capability  | Let the operator choose an eligible executor from the order buttons                             |
| A button rejects an action               | The lifecycle has advanced or prerequisites are missing        | Reload the menu/entity; complete the displayed prerequisite instead of forcing a command        |
| Photos are rejected                      | Wrong media type, more than three, or over 10 MB               | Send Telegram-compressed JPEG photos within the limit                                           |

Keep the conversation moving: explain that rejecting an invalid action is a control feature, then
return to `/menu` and continue from the entity’s current buttons.

## After the meeting

1. Press `Ctrl+C` in the application terminal to stop both pollers gracefully.
2. Leave PostgreSQL running for the next demo or run `docker compose stop postgres`.
3. Do not send CSV, photos or logs to the customer unless they are synthetic and intentionally shared.
4. Record customer feedback separately; do not alter production scope during the meeting.
5. If the customer agrees to a paid pilot, complete the
   [production-readiness checklist](production-readiness-checklist.md) before accepting real data.
