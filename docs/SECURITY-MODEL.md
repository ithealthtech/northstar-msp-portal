# Security model

This document explains _why_ the authorization chain is shaped the way it is. For trust
boundaries and deployment requirements, see
[SECURITY-ARCHITECTURE.md](SECURITY-ARCHITECTURE.md). To report a vulnerability, see
[SECURITY.md](../SECURITY.md).

## The premise

A multi-tenant MSP portal has an unusual property: the operator (the MSP) legitimately
needs cross-tenant reach, while every client must be sealed off from every other client.
Getting that wrong is not a bug, it is a breach.

Northstar's answer is that **authentication and authorization are separate systems**.
Microsoft Entra is the first, and only the first. It establishes identity and supplies a
coarse application-role ceiling. It never grants company access on its own.

## The authorization chain

Every authenticated request performs all seven steps in order. Failing any step denies the
request, and the denial is durably audited.

1. **Validate the access token** — signature, issuer, audience, expiry, tenant, client
   application, delegated API scope, and a recognized app role.
2. **Resolve the user** by the provisioned Entra tenant ID and object ID.
3. **Require an active database identity.**
4. **Resolve scope** — an active client membership or an MSP platform assignment.
5. **Intersect the Entra app role with the database role** — the narrower wins.
6. **Resolve the allowed company** or the assigned MSP portfolio.
7. **Enforce the named permission** required by that specific API route.

Step 5 is the load-bearing one. An Entra role can only ever _cap_ what the database grants;
it can never expand it. Granting someone `MSPPortal.Owner` in Entra does nothing until a
matching database role exists.

## The company claim is a hint

The `company_id` token claim is a selection hint. It cannot create a membership or expand
tenant access.

When a client user requests a resource belonging to another company, the portal returns
**not-found**, not forbidden. A forbidden response would confirm the resource exists, which
is itself a cross-tenant information leak.

## Provisioned, not just-in-time

Portal users are deliberately not created from an email address or a company claim on first
sign-in. The Entra tenant/object pair must already exist in the database.

This is the single most important operational consequence of the model, and the source of
most first-deployment confusion: **a valid Entra user in your tenant who has never been
provisioned can authenticate successfully and still reach nothing.** That is correct
behavior.

No default administrator or password is ever created. Complete first-run setup or provision
an identity explicitly with `npm run user:provision`.

## Roles

Entra application roles supply the ceiling:

| Entra app role       | Ceiling                     |
| -------------------- | --------------------------- |
| `ClientPortal.User`  | End-user self-service       |
| `ClientPortal.Admin` | Client administration       |
| `ClientPortal.Owner` | Client ownership            |
| `MSPPortal.Admin`    | Internal MSP administration |
| `MSPPortal.Owner`    | Internal MSP ownership      |

The token must carry the `Portal.Access` delegated scope and one recognized application
role.

Database roles are `client_user`, `client_admin`, `client_owner`, `msp_operator`,
`msp_admin`, and `msp_owner`.

MSP identities may use `PORTAL_PLATFORM_SCOPE=all`; otherwise their clients must be
explicitly assigned in `msp_company_scopes`. **An MSP administrator does not implicitly see
every client.**

## Demo and preview modes

Production startup rejects `DEMO_MODE=true`. This is enforced at boot rather than by
convention or documentation.

Preview roles are available only under `file://` or an explicitly enabled, unconfigured
local demo. Once Entra is configured, preview buttons and saved preview roles are ignored
entirely.

When served from `127.0.0.1` with local demo mode enabled, the role buttons use local-only
demo identities that resolve through the same `/api/session`, repository, SQLite,
permission, and audit pipeline as Entra users. The demo exercises the real authorization
path rather than bypassing it. The demo authorization header is rejected for non-loopback
callers and is completely disabled when demo mode is off. A `file://` preview remains
offline-only.

Keep `DEMO_MODE`, `SEED_DEMO_DATA`, and `SIGNATURE_ALLOW_DEFAULT_ADMIN` disabled in
production.

## Response discipline

- Unknown API paths return JSON `404` responses.
- Unsupported methods return `405` with an `Allow` header.
- Responses carry a request ID, security headers, and no-store caching.
- Denials are durably audited and tenant-aware, and return generic errors.

## Requirements for new routes

Every new route must:

- default to denied access
- enforce the narrowest applicable permission
- validate bounded input
- return generic errors that do not leak existence or shape
- ship with tenant-isolation tests

See [CONTRIBUTING.md](../CONTRIBUTING.md).

## Known boundary

The included Node SQLite data store makes the foundation immediately runnable and provides
deterministic automated isolation tests. It is appropriate for local development and a
single-node pilot.

Before a multi-instance production rollout: migrate the same repository contracts to
PostgreSQL, add tenant-qualified foreign keys and forced row-level security, run the
application with a non-owner database role, and test RLS using the real deployment role.

Isolation today is enforced in the application layer and verified by tests. Row-level
security moves that guarantee into the database, where it survives an application bug.
