/**
 * Central site configuration.
 *
 * Values are read from public env vars at build time so the project isn't tied
 * to any single deployment. Override them in `.env` (see `.env.example`).
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const SITE_NAME =
  process.env.NEXT_PUBLIC_APP_NAME ?? "Twin Grid";

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com";
