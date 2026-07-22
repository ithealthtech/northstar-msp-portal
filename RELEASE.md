# Version 1.0.0 release checklist

## Automated evidence

- [ ] `npm ci`
- [ ] `npm run audit:all`
- [ ] `npm run verify`
- [ ] `npm run test:e2e`
- [ ] `npm run package:install`
- [ ] Git working tree contains only reviewed release changes.
- [ ] GitHub Actions passes on the release commit.

## Owner-controlled production evidence

- [ ] Proprietary license and public repository visibility are approved by the owner.
- [ ] Microsoft Entra application, roles, delegated scope, redirect URI, and initial identities are configured and tested.
- [ ] TLS termination, trusted proxy behavior, firewall rules, service identity, and persistent absolute data paths are approved.
- [ ] `NORTHSTAR_BACKUP_KEY` and external-service credentials are stored in the production secret manager and have named rotation owners.
- [ ] Automated encrypted backups, immutable off-site replication, daily retention, monitoring alerts, and an isolated restore drill are evidenced.
- [ ] Privacy, regulatory, data-processing, ConnectWise, and customer-contract reviews are complete.
- [ ] A client-boundary test is completed with synthetic accounts in the production topology.
- [ ] Liveness returns `200`; readiness returns `200` only after the first successful backup event.

## Tag and GitHub release

Run these commands only after the checklist and release PR are approved and merged:

```powershell
git switch main
git pull --ff-only origin main
git status --short
git tag -a v1.0.0 -m "Northstar MSP Portal v1.0.0"
git push origin v1.0.0
gh release create v1.0.0 --title "Northstar MSP Portal v1.0.0" --notes-file CHANGELOG.md
```

Do not publish this private application to npm. Distribute the reviewed artifact produced by `npm run package:install` through the approved private release channel.
