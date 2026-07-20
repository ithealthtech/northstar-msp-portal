# Northstar MSP Portal deployment

This package is designed to run as a web-based MSP portal with a Node.js server, SQLite by default, and a migration path for PostgreSQL or SQL Server.

Node.js 24 or later is required. Deployment hosts and build agents must use the same major runtime because the supported encrypted backup path depends on the Node 24 `node:sqlite` backup API.

## Deployment profiles

- Local evaluation: Node.js + SQLite database in `data/northstar.db`.
- Windows service: copy the release package to `C:\Program Files\Northstar MSP Portal`, configure `.env.local`, then run through a managed Windows service wrapper.
- IIS reverse proxy: run the Node server on `127.0.0.1`, terminate TLS in IIS, and proxy to the configured port.
- Docker or hosted Linux VM: use the same server entrypoint and mount `data/` as persistent storage.

## Database options

Current implementation:

- SQLite using Node's built-in `node:sqlite`.
- Automatic migrations from `server/migrations`.
- WAL mode enabled for file-backed databases.

Designed migration targets:

- PostgreSQL for multi-tenant SaaS hosting.
- SQL Server for MSPs standardized on Microsoft infrastructure.

The application data model now includes:

- Companies
- Users and memberships
- MSP scopes
- Feature entitlements
- Company snapshots
- Integration connections
- Audit events
- Portal settings
- Generic portal records
- Approval requests
- Install profiles

## Basic install

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Configure Microsoft Entra app registration values.
4. Run `npm run db:init`.
5. Run `npm run build`.
6. Run `npm run smoke`.
7. Run `npm run package:install`.
8. Copy the generated Northstar release package to the server.
9. On the server, run `npm install --omit=dev`.
10. Run `npm run db:init`.
11. Start with `npm start` or configure a service wrapper.

## Environment configuration

### ConnectWise Platform

Set both `CONNECTWISE_CLIENT_ID` and `CONNECTWISE_CLIENT_SECRET` in the production secret store. Do not place either value in portal settings, source control, installer arguments, browser configuration, or logs. Grant only `platform.companies.read` and `platform.tickets.read` unless a separately reviewed workflow requires additional access.

Choose the documented regional API origin with `CONNECTWISE_BASE_URL`. North American production defaults to `https://openapi.service.itsupport247.net`; EU and AU origins are listed in `.env.example`. Production startup rejects custom origins. Schedule synchronization below the documented 500-request, five-minute quota and alert on `rate_limited` or `failed` run states.

After configuration, call `GET /api/internal/integrations/connectwise/sync` as an MSP administrator to confirm `configured: true`, then run a controlled first `POST` and review imported onboarding companies, ticket mappings, audit events, skipped-ticket counts, and the integration sync history before enabling a schedule.

Create `.env.local` beside `server.cjs` in the installed package.

## Signature portal production mode

For a standalone email signature deployment, set `SIGNATURE_ONLY=true`. This serves only:

- `signature.html`
- `admin.html`
- `setup.html`
- signature assets and event banners
- `/api/signature/*`
- `/api/health`

Recommended standalone signature `.env.local`:

```powershell
NODE_ENV=production
HOST=127.0.0.1
PORT=4173
DATABASE_PATH=./data/signature-portal.db
SEED_DEMO_DATA=false
DEMO_MODE=false
TRUST_PROXY=true
SIGNATURE_ONLY=true
SIGNATURE_SESSION_HOURS=12
SIGNATURE_ALLOW_DEFAULT_ADMIN=false
```

First run:

1. Start the app with the production `.env.local`.
2. Open `https://your-domain/setup.html`.
3. Create the first administrator and save the public URL.
4. Open `https://your-domain/admin.html#overview`.
5. Resolve every item in the Production readiness checklist.

`SIGNATURE_ALLOW_DEFAULT_ADMIN=false` is retained as a defense-in-depth setting. The application never creates a default administrator; an owner must complete setup or explicitly run the credential-reset command with an email supplied through the environment.

Required production values:

```powershell
NODE_ENV=production
HOST=127.0.0.1
PORT=4173
DATABASE_PATH=./data/northstar.db
SEED_DEMO_DATA=false
DEMO_MODE=false
TRUST_PROXY=true

ENTRA_CLIENT_ID=00000000-0000-0000-0000-000000000000
ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000
ENTRA_API_AUDIENCE=api://00000000-0000-0000-0000-000000000000
ENTRA_API_SCOPE=api://00000000-0000-0000-0000-000000000000/Portal.Access
ENTRA_ALLOWED_CLIENT_ID=00000000-0000-0000-0000-000000000000
ENTRA_REDIRECT_URI=https://portal.example.com/
```

Production startup intentionally fails if Microsoft Entra values are missing or demo mode is enabled.

## Microsoft Entra app registration

The portal expects Microsoft login to issue an access token for the portal API. Configure:

- Single-page/client redirect URI matching `ENTRA_REDIRECT_URI`.
- API audience matching `ENTRA_API_AUDIENCE`.
- Delegated scope matching `ENTRA_API_SCOPE`.
- Application roles:
  - `ClientPortal.User`
  - `ClientPortal.Admin`
  - `ClientPortal.Owner`
  - `MSPPortal.Admin`
  - `MSPPortal.Owner`

The database role still controls actual access. Entra roles are a ceiling; they do not create memberships or authorize company access by themselves.

## Database operations

SQLite is the included operational database for local evaluation and single-node pilots. It creates the parent `data/` directory automatically and uses WAL mode for file-backed databases.

Required production practices:

- Put `DATABASE_PATH` on persistent storage.
- Configure a separately vaulted 32-byte `NORTHSTAR_BACKUP_KEY`.
- Schedule `npm run backup:create` and replicate the encrypted result to immutable off-site storage.
- Run `npm run db:retention` daily.
- Run `npm run backup:verify -- <backup-file>` after transfer and a full isolated restore test monthly.
- Keep audit data according to the MSP retention policy; production rejects audit retention shorter than one year.
- Do not put database files under the web root.

See [docs/OPERATIONS-RUNBOOK.md](docs/OPERATIONS-RUNBOOK.md) for key custody, RPO/RTO targets, exact restore steps, alerts, evidence, and incident procedures.

For multi-instance hosting, migrate the repository contracts to PostgreSQL or SQL Server before scaling horizontally.

## Runtime smoke test

Before handing the package to users, run:

```powershell
npm run smoke
```

The smoke test builds browser assets, boots the server on a random local port, verifies `/api/health`, verifies static portal delivery, verifies `portal-api.js`, and saves an MSP install profile through the real HTTP API.

After deployment, also verify:

```powershell
Invoke-RestMethod https://portal.example.com/api/health
```

Expected database result: `ready`.

## First-run MSP setup

After the app is reachable:

1. Provision the first MSP owner with `npm run user:provision`.
2. Sign in with Microsoft as that owner.
3. Open MSP Admin -> System setup.
4. Save the public URL, deployment target, database provider, backup schedule, OAuth2 settings, and production readiness checklist.
5. Provision at least one client admin.
6. Validate client admin and end-user portals cannot access MSP integration, database, OAuth, or install settings.

## Production checklist

- Configure Entra OAuth2/OIDC.
- Set a real public URL and redirect URI.
- Restrict admin app roles.
- Store secrets outside the repo.
- Put the app behind HTTPS.
- Back up the database.
- Replicate encrypted backups off-site and complete a restore drill.
- Schedule and review retention execution.
- Enable log forwarding.
- Test `/api/health`.
- Provision MSP owner and at least one client admin.
- Validate client data boundaries before onboarding live clients.
- Run `npm run smoke` before packaging and again after copying the package if Node and dependencies are present.
