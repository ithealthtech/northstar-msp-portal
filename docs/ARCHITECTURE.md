# Architecture

## Request path

```text
Browser / Microsoft Entra
        |
        v
server/auth.cjs              Token signature, issuer, audience, scope, and app-role validation
        |
        v
server/repository.cjs        Provisioned identity, membership, portfolio scope, and permission resolution
        |
        v
server/database.cjs          Versioned migrations and persistent development database
        |
        v
server/app.cjs               Default-deny, tenant-scoped HTTP API and static portal delivery
```

Each layer has one job and does not reach past the next one.

| Layer                   | Responsibility                                                               | Explicitly not responsible for   |
| ----------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| `server/auth.cjs`       | Proving the token is genuine and carries a recognized role and scope         | Deciding what the caller may see |
| `server/repository.cjs` | Resolving identity, membership, portfolio, and effective permissions         | Transport, HTTP status codes     |
| `server/database.cjs`   | Versioned migrations, persistence, process leases                            | Authorization decisions          |
| `server/app.cjs`        | Route dispatch, permission enforcement, response discipline, static delivery | Token cryptography               |

The separation matters because it is what makes the authorization chain testable. Isolation
is verified by automated tests against the repository and API layers rather than asserted in
review.

## Three experiences, one application

Northstar serves three audiences from a single deployment:

- **End-user self-service** — the individual's own requests, profile, and documents.
- **Client administration** — a company-scoped workspace for service activity, health,
  billing, approvals, documents, and support actions.
- **Internal MSP operations** — portfolio, recurring revenue, managed users, SLA
  attainment, client health, operational priorities, and integration control.

These are not separate front ends with a shared login. They are one application where the
server resolves scope per request, so a UI mistake cannot widen access.

## Core records

Companies, users, client memberships, MSP client assignments, feature entitlements,
operational snapshots, integration metadata, and append-only application audit events.

Migrations live in `server/migrations` and run automatically at startup. The local database
defaults to `data/northstar.db`.

## Front end

The browser layer is vanilla JavaScript with no framework runtime. `portal-api.js` is the
single API client; `portal-store.js` holds view state. Assets are built with Vite and
delivered by the same server that hosts the API, so there is no separate origin to
configure or protect.

## MSP system setup

The MSP Admin portal includes a System setup page for install and platform configuration.
It is MSP-only and sits above client admin and end-user access in the portal data chain. It
captures the deployment profile, database options, Entra OAuth2/OIDC configuration,
first-run tenant setup, and a production readiness checklist.

When connected to the backend it saves the install profile through
`PUT /api/internal/install-profile` and individual settings through
`PUT /api/internal/settings`.

## Production operations

Authenticated encrypted SQLite backups, integrity verification, offline-safe restore
controls, configurable retention enforcement, database process leases, and health
timestamps. Readiness deliberately stays blocked until backup evidence exists.

See the [operations runbook](OPERATIONS-RUNBOOK.md).

## ConnectWise integration

ConnectWise Platform OAuth 2.0 client credentials with least-privilege
`platform.companies.read` and `platform.tickets.read` scopes. The server sends the
documented JSON token request, caches the access token until expiry, honors vendor quota
headers, records rate-limited and failed runs, blocks cross-origin pagination, and never
returns the client secret or bearer token to the browser.

Imported companies begin in onboarding state and are not automatically published to
clients. Tickets are mapped through durable provider identifiers and idempotently upserted
into company-scoped portal records.

## Current boundary

The shell, authentication bootstrap, tenant context, entitlements, company APIs, summaries,
durable people invitations and membership updates, personal profiles, integrations
metadata, portal records, document-update approvals, install profile, tenant-isolated
settings, audit storage, and ConnectWise company/ticket synchronization have a real backend
foundation.

Production navigation release-gates unfinished modules. Explicit demo mode retains design
prototypes without representing them as operational integrations — which is why a module
can be visible in demo and absent in production.

## Production database path

The embedded SQLite store is appropriate for local development and a single-node pilot.
Before multi-instance rollout, migrate the same repository contracts to PostgreSQL, add
tenant-qualified foreign keys and forced row-level security, run under a non-owner database
role, and test RLS with the real deployment role.

See [SECURITY-MODEL.md](SECURITY-MODEL.md) for why that migration matters.
