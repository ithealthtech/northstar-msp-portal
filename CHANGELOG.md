# Changelog

All notable changes to Northstar MSP Portal are documented here. The project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-22

### Added

- Multi-tenant server foundation with database-resolved roles, client scopes, entitlements, protected APIs, and durable audit events.
- Microsoft Entra authentication validation and first-run identity provisioning.
- ConnectWise Platform company and ticket synchronization with least-privilege scopes, quota handling, and idempotent imports.
- Encrypted SQLite backups, verification, offline-safe restore controls, retention jobs, and operational health evidence.
- Structured JSON logging, fatal-process handling, idempotent graceful shutdown, and separate liveness/readiness probes.
- Automated tenant-isolation, security, operational, browser, and WCAG regression suites.
- Deterministic lint, formatting, JavaScript type-check, build, smoke, production-startup, packaging, and CI gates.

### Security

- Production rejects demo/seed modes, default signature administration, missing backup encryption, unsafe retention, invalid proxy flags, relative data paths, and missing built assets.
- Secrets, databases, backups, logs, generated output, and local environment files are excluded from Git.

### Known boundaries

- SQLite supports a single application instance. Multi-instance deployment requires a reviewed PostgreSQL or SQL Server repository implementation.
- Modules not backed by released server APIs remain hidden in production and are available only in explicit local demo mode.
- Production Entra, TLS, monitoring, backup scheduling, restore evidence, privacy/compliance, and vendor configuration require owner-controlled infrastructure.
