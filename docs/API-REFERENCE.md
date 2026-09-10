# API reference

All routes are default-deny. Reaching a route is not the same as being allowed to use it —
every request runs the full [authorization chain](SECURITY-MODEL.md#the-authorization-chain)
first.

## Response discipline

| Situation                                         | Response                       |
| ------------------------------------------------- | ------------------------------ |
| Unknown API path                                  | JSON `404`                     |
| Known path, unsupported method                    | `405` with an `Allow` header   |
| Client user requesting another company's resource | `404` — never `403`            |
| Denied by permission                              | Generic error, durably audited |

Every response carries a request ID, security headers, and no-store caching.

## Health

| Route                   | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `GET /api/health`       | Overall health                                         |
| `GET /api/health/live`  | Liveness — is the process up                           |
| `GET /api/health/ready` | Readiness — stays blocked until backup evidence exists |

Readiness remaining blocked before a backup exists is intended behavior, not a failure.

## Session and profile

| Route                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `GET /api/session`   | Resolved identity, role, scope, and entitlements |
| `GET /api/profile`   | The caller's own profile                         |
| `PATCH /api/profile` | Update the caller's own profile                  |

`/api/session` is the single resolution point for who the caller is and what they may see.
Demo identities resolve through this same path.

## Companies

| Route                                   | Purpose                           |
| --------------------------------------- | --------------------------------- |
| `GET /api/companies`                    | Companies in scope for the caller |
| `GET /api/companies/:companyId`         | One company                       |
| `PATCH /api/companies/:companyId`       | Update company                    |
| `GET /api/companies/:companyId/summary` | Dashboard summary                 |

Scope comes from the caller's membership or MSP portfolio assignment — never from the
`company_id` token claim.

### People

| Route                                            | Purpose             |
| ------------------------------------------------ | ------------------- |
| `GET /api/companies/:companyId/people`           | Membership list     |
| `POST /api/companies/:companyId/people`          | Invite a member     |
| `PATCH /api/companies/:companyId/people/:userId` | Update a membership |

Last-administrator protection applies: the final administrator of a company cannot be
demoted or removed.

### Records

| Route                                               | Purpose                                   |
| --------------------------------------------------- | ----------------------------------------- |
| `GET /api/companies/:companyId/records`             | List records, optionally filtered by type |
| `POST /api/companies/:companyId/records`            | Create a record                           |
| `PATCH /api/companies/:companyId/records/:recordId` | Update a record                           |

Synchronized ConnectWise tickets are upserted here as company-scoped records.

### Approvals

| Route                                                   | Purpose            |
| ------------------------------------------------------- | ------------------ |
| `GET /api/companies/:companyId/approvals`               | List approvals     |
| `POST /api/companies/:companyId/approvals`              | Raise an approval  |
| `PATCH /api/companies/:companyId/approvals/:approvalId` | Decide an approval |

Approval decisions are terminal and ownership-checked.

## Internal (MSP only)

| Route                                              | Purpose                           |
| -------------------------------------------------- | --------------------------------- |
| `GET /api/internal/integrations`                   | Vendor connections and sync state |
| `GET /api/internal/integrations/connectwise/sync`  | Inspect sync status               |
| `POST /api/internal/integrations/connectwise/sync` | Start a sync run                  |
| `GET /api/internal/audit`                          | Application audit events          |
| `GET /api/internal/settings`                       | Platform settings                 |
| `PUT /api/internal/settings`                       | Update platform settings          |
| `GET /api/internal/install-profile`                | Install profile                   |
| `PUT /api/internal/install-profile`                | Update install profile            |
| `GET /api/internal/api-keys`                       | API key administration            |

These sit above client admin and end-user access in the portal data chain. Vendor
credentials and bearer tokens are never returned to the browser.

## Signature subsystem

The server also exposes a signature-management subsystem:

```text
/api/signature/session          /api/signature/login
/api/signature/logout           /api/signature/profile
/api/signature/users            /api/signature/templates
/api/signature/setup            /api/signature/setup-status
/api/signature/admin-config     /api/signature/runtime-config
```

> **Note**
> This group has its own session and login handling separate from the Entra-gated portal
> routes above. `SIGNATURE_ALLOW_DEFAULT_ADMIN` must stay disabled in production. Treat this
> section as an index rather than a contract — verify against `server/` before integrating.

## Verifying behavior

`npm test` covers client isolation, company-claim rejection, unknown-user denial, scoped
MSP portfolios, MSP owner access, role permissions, API method handling, JSON API
fallthrough, durable denial auditing, tenant-isolated settings, invitation and membership
lifecycle, last-administrator protection, document workflows, profile persistence, approval
ownership and terminal decisions, and install-profile persistence.

`npm run smoke` exercises the real HTTP API on a random port against a temporary database.
