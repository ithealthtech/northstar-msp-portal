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

## Production gates

- Terminate TLS at a maintained reverse proxy and set the canonical public URL.
- Store secrets in a managed secret store, not `.env.local`, where the hosting environment supports it.
- Back up and restore-test the production database.
- Add centralized security monitoring, retention policies, and incident response ownership.
- Complete privacy, contractual, and data-residency review for every connected vendor.
- Sign and provenance-stamp release artifacts where packaged distribution is used.
