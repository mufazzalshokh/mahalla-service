# Backup and restore rehearsal

The pilot must not call a backup “working” until it has been restored into an isolated database and
checked. The rehearsal script creates a database whose name starts with
`mck_restore_rehearsal_`, restores a custom-format dump, compares schema and core record counts,
then removes the temporary database and backup artifact.

Run from PowerShell while PostgreSQL is reachable:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/backup-restore-rehearsal.ps1 `
  -SourceDatabaseUrl 'postgresql://USER@127.0.0.1:PORT/DATABASE'
```

Pass `-PostgresBin 'C:\Program Files\PostgreSQL\18\bin'` if the PostgreSQL tools are not on
`PATH`. Use `-KeepBackup` only when the artifact will immediately be moved to an approved encrypted,
off-host location. Never paste a production password into chat, logs, screenshots, shell history, or
the repository; use the operator's approved secret channel.

## Production schedule and ownership

- Run an encrypted off-host backup daily and before every risky migration.
- Run this isolated restore rehearsal at least monthly and before go-live.
- Record artifact timestamp, SHA-256, database version, operator, verification result, and deletion or
  off-host destination—never credentials or resident content.
- A failed dump, restore, invariant comparison, or cleanup is a critical operational alert. Stop risky
  changes until a new verified backup exists.
- The production host, encryption key custody, retention period, backup destination, and incident owner
  remain CP-11 deployment decisions; a developer laptop is not a backup destination.
