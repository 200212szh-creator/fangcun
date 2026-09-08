# Database migrations

`0001_archive_fields` is additive and safe to repeat. The application runs the migration through Drizzle's SQLite connection after creating the legacy tables, so old rows remain valid and new columns are nullable or defaulted.

Before applying or rolling back a migration:

```text
npm run db:backup
npm run db:migrate
npm run db:migrate:rollback
```

Rollback is intended for a rehearsal or an immediate recovery window. It removes only the phase-1 columns; restore the backup if any new-field data was entered after migration.
