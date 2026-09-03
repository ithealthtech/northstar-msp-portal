# Contributing

Northstar holds multiple clients' data in one deployment. A mistake here is a cross-tenant
data leak, not a cosmetic bug. The bar for changes reflects that.

## Before you start

- Security defects go through [SECURITY.md](SECURITY.md) — a private advisory, never a
  public issue.
- Read [docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md) before touching anything on the
  request path. The seven-step authorization chain is the product.
- Open an issue first for anything beyond a doc fix or a contained bug fix.

## Setup

Node.js 24 or later is required — the encrypted online backup uses the `node:sqlite` backup
API from that runtime baseline.

```powershell
npm install
Copy-Item .env.example .env.local
npm run build
npm run db:init
npm run start:development
```

Open `http://127.0.0.1:4173`. To exercise the UI without Entra, set `DEMO_MODE=true` and
`SEED_DEMO_DATA=true` in `.env.local`. Demo identities resolve through the same session,
repository, permission, and audit pipeline as real users, so the demo tests the real
authorization path.

## Before opening a pull request

```powershell
npm ci
npm audit --omit=dev --audit-level=high
npm run verify
npm run test:e2e
```

`npm run verify` runs formatting, linting, type checking, and the test suite.
`format:check` covers the root Markdown files and `docs/*.md`, so documentation changes
must be prettier-clean too — run `npm run format` if it complains.

## Rules for code on the request path

These are not style preferences. Each one closes a specific cross-tenant failure.

1. **Default to denied.** A new route returns nothing until a named permission explicitly
   allows it.
2. **Enforce the narrowest permission** that satisfies the use case, not the most
   convenient one.
3. **Never trust a token claim as authority.** `company_id` is a selection hint. Access
   comes from the resolved database membership or MSP portfolio assignment.
4. **Return not-found, not forbidden,** when a caller asks for another tenant's resource. A
   forbidden response confirms the resource exists.
5. **Validate bounded input** and return generic errors that do not leak existence or
   shape.
6. **Ship tenant-isolation tests** with every new route. A route without an isolation test
   is not finished.
7. **Never widen access in the UI layer.** The server resolves scope per request; the front
   end must not be the thing keeping tenants apart.

## Never commit

`.env` files, credentials, access tokens, client records, databases, logs, exports, or
production screenshots.

Use synthetic `.example` domains and reserved 555 telephone numbers in tests and
documentation. Rotate any credential immediately if it may have been exposed.

Keep `DEMO_MODE`, `SEED_DEMO_DATA`, and `SIGNATURE_ALLOW_DEFAULT_ADMIN` disabled in
production configuration.

## Accessibility

The Playwright gate enforces automated WCAG 2 A/AA rules on the sign-in screen and all
three role dashboards, plus keyboard skip navigation, page-heading focus, modal focus
trapping and restoration, mobile navigation state, and horizontal overflow.

UI changes must keep that gate green and follow the manual checklist in
[docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

## Commits and pull requests

- Use a short-lived branch and keep changes focused.
- Imperative subject line, under ~72 characters.
- Explain _why_ in the body; the diff already shows what.
- Note which of the seven rules above your change touches, if any.
- Update [CHANGELOG.md](CHANGELOG.md) for user-visible changes.

## Documentation

`docs/` is for developers and operators. `pages/` is the published product site at
<https://ithealthtech.github.io/northstar-msp-portal/>. Behavior changes on the request
path should update [docs/SECURITY-MODEL.md](docs/SECURITY-MODEL.md) and
[docs/API-REFERENCE.md](docs/API-REFERENCE.md) where relevant.

Before handling customer data, read [DEPLOYMENT.md](DEPLOYMENT.md), the
[release checklist](RELEASE.md), and the
[operations runbook](docs/OPERATIONS-RUNBOOK.md).
