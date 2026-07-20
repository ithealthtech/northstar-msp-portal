# Northstar operations runbook

This runbook covers the supported single-node SQLite deployment. Multi-instance deployments must move the repository contract to a managed database before production use.

## Recovery objectives

- Target recovery point objective (RPO): 24 hours with the minimum nightly schedule. Use a more frequent scheduler when the business requires a lower RPO.
- Target recovery time objective (RTO): four hours, subject to infrastructure replacement and secret-store recovery.
- Backup retention: 35 days by default. The backup command removes only aged `northstar-*.nsbak` files with a valid Northstar backup header.
- Restore verification: monthly and before every major release.

The MSP must set client-specific contractual targets and confirm that the chosen schedule, storage tier, and off-site replication meet them.

## Key management

Generate a 32-byte key once:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Store the value as `NORTHSTAR_BACKUP_KEY` in the production secret manager. Do not store it in `.env.example`, GitHub, the application database, the backup directory, tickets, or logs. Back up the key in a separately controlled recovery vault. Losing it makes all encrypted backups unrecoverable.

Rotate keys by retaining the old key until every backup encrypted with it has expired and completed restore verification. The current format uses AES-256-GCM authenticated encryption and a SHA-256 plaintext checksum.

## Scheduled jobs

Run these commands from the installed application directory under a dedicated service identity:

```powershell
npm run backup:create
npm run db:retention
```

Schedule `backup:create` nightly and `db:retention` daily with Windows Task Scheduler or the platform scheduler. Capture stdout/stderr in the centralized log platform and alert on a non-zero exit code, `backup_failed`, `retention_failed`, or an absent successful backup within the required RPO.

Copy encrypted `.nsbak` artifacts to immutable or write-once off-site storage. Local retention is not a substitute for off-site copies or storage-side immutability.

The public `GET /api/health` response reports whether backup encryption is configured and the last successful backup, retention, and restore-verification timestamps. It never returns the key or backup path. Production health is `degraded` until at least one successful backup has been recorded.

## Verify a backup

Verification decrypts into a temporary file, validates the authentication tag and checksum, runs SQLite `PRAGMA integrity_check`, and confirms the Northstar migration ledger exists:

```powershell
npm run backup:verify -- "D:\Northstar Backups\northstar-2026-07-20.nsbak"
```

Use a non-production recovery host for the monthly drill. Verification alone does not prove application-level recovery; complete the restore drill below.

## Restore drill

1. Confirm the selected backup is from the expected environment and retention period.
2. Stop the Northstar service and verify its listening port is closed.
3. Preserve `.env.local` and obtain `NORTHSTAR_BACKUP_KEY` from the recovery vault.
4. Run verification.
5. Restore with explicit confirmation:

```powershell
npm run backup:restore -- "D:\Northstar Backups\northstar-2026-07-20.nsbak" --confirm
```

The restore refuses to run while an active Northstar database lease exists. It validates the database before replacement and preserves the displaced database with a `.pre-restore-<timestamp>` suffix. Do not remove that rollback copy until validation is complete.

6. Run `npm run db:init`, `npm run smoke`, and start the service.
7. Verify `/api/health`, Microsoft sign-in, an MSP portfolio query, a client-scoped query, audit history, and the most recent expected business record.
8. Record the achieved RPO/RTO, operator, backup checksum, and evidence in the change record.
9. After approval, securely dispose of the temporary recovery environment and rollback copy according to policy.

## Retention policy

Defaults are configured in `.env.local`:

- `RETENTION_AUDIT_DAYS=2555` (seven years; production minimum is 365 days)
- `RETENTION_SYNC_DAYS=365`
- `RETENTION_SECURITY_DAYS=90`
- `BACKUP_RETENTION_DAYS=35` (minimum seven days)

The retention job deletes expired signature sessions, aged revoked/expired API keys, completed integration-sync history, and audit events beyond the configured boundary. It does not purge companies, memberships, tickets, documents, invoices, approvals, or other business records. Changes to legal, contractual, or client-specific retention requirements require a reviewed migration and policy update.

Every successful retention execution writes an `operational_events` record with its policy and deletion counts. Backup, restore, and restore-verification commands also record successful outcomes without storing secrets or absolute backup paths.

## Incident response

- Suspected key disclosure: disable scheduled jobs, rotate the key, preserve affected backups under incident hold, and assess access logs before deletion.
- Backup failure: keep the production database online, alert operations, protect the last known-good off-site copy, remediate, and immediately run and verify a new backup.
- Database corruption: stop writes, preserve the database and sidecars as evidence, restore to an isolated host, validate, then follow the approved recovery change.
- Ransomware or destructive event: do not trust local backups; recover from the immutable off-site copy and rotate database, integration, session, and signing secrets.
