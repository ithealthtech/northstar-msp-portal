# Public repository readiness audit

Audit date: 2026-07-22
Version: 1.0.0

## Recommendation

**Go for publishing the sanitized source as a new repository. No-go for production deployment until the owner-review items below are completed.**

## Confirmed findings resolved

### Critical

- Removed the hardcoded signature administrator and known weak password.
- Excluded the live SQLite database, generated release ZIPs, dependency tree, build output, PID files, environment overrides, logs, uploads, and crash artifacts.

### High

- Changed demo authentication and demo data from implicit development defaults to explicit opt-in settings.
- Added same-origin enforcement and per-account/network login throttling to cookie-authenticated signature routes.
- Raised locally managed password minimums to 12 characters and retained constant-time password verification.
- Removed misleading SQL Server and PostgreSQL selectors; version 0.2.0 implements SQLite only.
- Sanitized real personal and company defaults with reserved `.example` domains and 555 numbers.

### Medium

- Corrected package identity from `email-signature-designer` to `northstar-msp-portal`.
- Added public-safe security, contribution, CI, dependency-update, and architecture documentation.
- Expanded ignore rules for secrets, runtime state, generated releases, local tools, and operating-system files.
- Replaced user-facing build warnings by bundling portal scripts as modules.

### Low

- Unified product naming and version metadata.
- Reworked all four UI surfaces around a shared accessible enterprise design system.

## Owner review required before production

- Obtain owner approval for the proprietary license and public repository visibility.
- Configure the production Entra application, redirect URI, API audience, delegated scope, app roles, and provisioned identities.
- Select a supported production topology, TLS termination, secret store, database backup process, monitoring destination, and retention policy.
- Complete privacy, regulatory, vendor, and contractual review for customer data and integrations.
- Replace remaining prototype/local-storage workflows with server APIs before representing those workflows as production integrations.

## Evidence

- Automated tenant-isolation, permission, API-key, signature-session, cross-site, rate-limit, and regression tests.
- Production build and live-process smoke test.
- Dependency audit at high severity.
- Repository-wide secret, private-key, internal URL, runtime artifact, and identifying-data scans.
