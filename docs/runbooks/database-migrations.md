# Database migration runbook

## Local commands

Set `DATABASE_URL` to the target PostgreSQL database, then run:

```powershell
pnpm db:check
pnpm db:migrate
pnpm db:seed
```

Generate a migration only after changing `src/infrastructure/database/schema.ts`:

```powershell
pnpm db:generate
```

Review generated SQL before applying it. Commit the SQL, Drizzle journal, and snapshot together. Seed execution is safe to repeat and does not create demo users or operational records.

## Release procedure

1. Back up the production database and verify the backup artifact before a risky migration.
2. Run the same migration against an isolated database and execute database integration tests.
3. Put incompatible application changes behind an expand/migrate/contract sequence.
4. Apply migrations once from a controlled release job, not from every application replica.
5. Verify migration journal state, readiness, representative reads, and audit writes.
6. Start the compatible application release and monitor errors/latency.

## Rollback

CP-02 migrations are forward-only. For an application defect, roll back the application to a version compatible with the expanded schema. For a migration defect, stop writes and restore the verified pre-migration backup into a separate database, validate it, then switch through an approved operational procedure. Do not manually delete migration journal rows or run ad-hoc destructive SQL.

The append-only audit trigger blocks row updates/deletes but does not prevent a controlled schema migration from replacing the trigger. Any such migration requires explicit security review.
