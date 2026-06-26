# Security Policy

## Supported Versions

This project is under active development. Security fixes are applied to the latest `master`.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions,
or pull requests.**

Instead, report them privately through **GitHub Security Advisories** — use the
[**Report a vulnerability**](https://github.com/sanmaxdev/twingrid-binance/security/advisories/new)
button under the repository's **Security** tab.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept if possible)
- Affected component(s) and version/commit
- Any suggested remediation

We will acknowledge your report as soon as possible and keep you informed of the progress
toward a fix. We ask that you give us a reasonable amount of time to address the issue before
any public disclosure.

## Scope & Hardening Notes

This is **self-hosted trading software** that handles exchange API credentials. Operators are
responsible for securing their own deployments. When running TWIN GRID:

- Generate strong, unique values for `JWT_SECRET`, `MASTER_ENCRYPTION_KEY`, and
  `POSTGRES_PASSWORD`. **Never commit your `.env` file.**
- Use Binance API keys **without withdrawal permissions**.
- Restrict API keys to trusted IP addresses where possible.
- Keep dependencies and the host OS patched.

See [docs/SECURITY.md](../docs/SECURITY.md) for the application's security model.
