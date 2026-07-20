# Security policy

## Supported versions

Only the latest stable Northstar MSP Portal release receives security fixes. Prototype and demo configurations are not supported for production use.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Use GitHub's private vulnerability reporting feature for this repository and include the affected version, impact, and reproducible steps.

## Security expectations

- Never commit `.env` files, credentials, access tokens, client records, databases, logs, exports, or production screenshots.
- Keep `DEMO_MODE`, `SEED_DEMO_DATA`, and `SIGNATURE_ALLOW_DEFAULT_ADMIN` disabled in production.
- Use synthetic `.example` domains and reserved 555 telephone numbers in tests and documentation.
- Rotate any credential immediately if it may have been exposed.
- Review dependency advisories and the release-readiness checklist before every public release.

See [docs/SECURITY-ARCHITECTURE.md](docs/SECURITY-ARCHITECTURE.md) for trust boundaries and deployment requirements.
