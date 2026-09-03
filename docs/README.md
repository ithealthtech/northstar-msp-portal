# Northstar documentation

Developer and operator documentation. The product site is published at
<https://ithealthtech.github.io/northstar-msp-portal/>.

## Start here

| Document                                          | What it covers                                       |
| ------------------------------------------------- | ---------------------------------------------------- |
| [Architecture](ARCHITECTURE.md)                   | Request path, layer responsibilities, data model     |
| [Security model](SECURITY-MODEL.md)               | The seven-step authorization chain and why it exists |
| [API reference](API-REFERENCE.md)                 | Every route, its permission, and response discipline |
| [Security architecture](SECURITY-ARCHITECTURE.md) | Trust boundaries and deployment requirements         |
| [Operations runbook](OPERATIONS-RUNBOOK.md)       | Backups, restore, retention, leases, health          |
| [Accessibility](ACCESSIBILITY.md)                 | Supported baseline and manual release checklist      |
| [Publication readiness](PUBLICATION-READINESS.md) | Pre-release gate                                     |

Root-level documents: [DEPLOYMENT.md](../DEPLOYMENT.md),
[RELEASE.md](../RELEASE.md), [SECURITY.md](../SECURITY.md),
[CONTRIBUTING.md](../CONTRIBUTING.md), [CHANGELOG.md](../CHANGELOG.md).

## The one thing to understand first

Microsoft Entra proves identity and supplies a coarse application-role ceiling. **It does
not grant company access by itself.** Every request resolves a database identity,
membership or portfolio scope, an intersected role, and a named route permission before
anything is returned.

Users are **provisioned, not created just-in-time**. A valid Entra user in your tenant who
has never been provisioned can authenticate and still reach nothing. That is the intended
behavior, and it is the source of most first-deployment confusion.

## Conventions

- **Default-deny** means a route returns nothing unless a named permission explicitly
  allows it.
- **Ceiling** means an upper bound that can only narrow, never widen, the effective role.
- **Hint** describes a token claim that may influence selection but can never grant
  access — `company_id` is the canonical example.
