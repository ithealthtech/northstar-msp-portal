# Contributing

Use a short-lived branch and keep changes focused. Before opening a pull request, run:

```powershell
npm ci
npm audit --omit=dev --audit-level=high
npm run verify
npm run test:e2e
```

Do not include customer data, credentials, local databases, generated releases, or environment-specific configuration. New routes must default to denied access, enforce the narrowest permission, validate bounded input, return generic errors, and include tenant-isolation tests.
