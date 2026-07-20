# Security architecture

## Trust boundaries

The browser, Northstar server, Microsoft Entra, each client tenant, the MSP portfolio, the SQLite database, and every future vendor integration are separate trust boundaries. A token establishes identity; database memberships and permissions establish authorization.

## Authentication and authorization

Production portal requests require a Microsoft Entra access token with the configured tenant, audience, authorized client application, delegated scope, and recognized application role. Every request resolves the provisioned user and intersects the Entra role with the database role. Company identifiers supplied by the browser never grant access.

The optional signature studio uses an opaque, hashed server-side session token in an `HttpOnly`, `SameSite=Lax`, production-`Secure` cookie. State-changing signature requests reject cross-site origins. Login attempts are bounded per network address and account identifier.

## Data handling

Client records, contact data, audit activity, support notes, integration metadata, and identifiers are sensitive. Runtime databases, logs, uploads, exports, and environment files are excluded from source control. Application errors return a request identifier and generic server message; stack traces are not sent to users.

## Safe defaults

Demo identities, demo seed data, signature-only mode, and default-administrator behavior are disabled unless explicitly enabled. No default administrator password exists. Production startup rejects demo mode and requires Entra configuration for the MSP portal.

ConnectWise credentials are server-only environment secrets. OAuth access tokens are cached in process memory until expiry and are never persisted or returned through portal APIs. Synchronization requires the MSP integration-management permission, creates durable provider mappings, imports companies as unpublished onboarding records, copies only an allowlisted subset of company and ticket fields, and records every run without credential material. Vendor pagination cannot leave the configured ConnectWise origin, and quota exhaustion produces a durable rate-limited state with a retry timestamp.

Database backups use SQLite's online backup mechanism and AES-256-GCM authenticated encryption with a separately managed 32-byte key. Restore validates the authentication tag, SHA-256 checksum, SQLite integrity, and migration ledger before replacement, refuses to run while the server holds the database lease, and preserves the displaced database for controlled rollback. Operational records contain filenames, checksums, counts, and timestamps—not encryption keys, credentials, absolute paths, or record payloads.

Retention is an explicit server-side transaction. It covers expired sessions and API credentials, integration execution history, and audit records beyond the configured policy boundary. Business records are not silently purged. Production enforces at least one year of audit retention; the default is seven years. Policy execution and deletion counts are themselves auditable.

## Production gates

- Terminate TLS at a maintained reverse proxy and set the canonical public URL.
- Store secrets in a managed secret store, not `.env.local`, where the hosting environment supports it.
- Replicate encrypted backups to immutable off-site storage and complete monthly restore tests.
- Forward structured operational output to centralized security monitoring and assign incident-response ownership.
- Complete privacy, contractual, and data-residency review for every connected vendor.
- Sign and provenance-stamp release artifacts where packaged distribution is used.
