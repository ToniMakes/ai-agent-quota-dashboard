# Security Policy

AI Agent Quota Dashboard is local-first and privacy-first. Please do not disclose sensitive data in public issues, pull requests, fixtures, screenshots, or logs.

## Sensitive Data

Do not share:

- Prompts
- Responses
- Source code
- Credentials
- Browser cookies
- Session IDs
- Transcript paths
- Workspace paths
- Account identifiers
- Full raw agent logs

## Reporting

Please report vulnerabilities or accidental sensitive-data exposure through [GitHub private security reporting](https://github.com/ToniMakes/ai-agent-quota-dashboard/security/advisories/new) rather than a public issue. Public issues should contain only sanitized, minimal reproduction details.

For ordinary bugs, prefer the reviewed output from:

```bash
node dist/index.js doctor --json
```

Do not paste the plain text Doctor report into public issues unless you have removed local paths and other sensitive fields.

## Scope

Security-sensitive areas include:

- Local file discovery
- Parser fixtures
- Statusline setup helpers
- Any future network connector
- Export features

The project should never add browser cookie import, simulated login, hidden/private API calls, rate-limit bypassing, or automatic account switching.
