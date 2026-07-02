// operator.ts — single source of truth for the operator password check
// used by all privileged routes (recipients, scan_and_email, stocks/add,
// admin/*, etf_holdings/*, filters/*, line/*).
//
// The password is read from the STOCK_OPERATOR_PASSWORD env var. If unset,
// we fall back to a stable default that matches what the iframe UI prompts
// for, so the deployment is usable out of the box. Operators can rotate
// the password by setting STOCK_OPERATOR_PASSWORD in the Vercel project
// settings.

const DEFAULT_OPERATOR_PASSWORD = "stock-admin-2026";

export function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"] || DEFAULT_OPERATOR_PASSWORD;
  return typeof password === "string" && password === expected;
}

// What the iframe UI should display as the placeholder. Matches the
// default above so first-time users can paste it directly.
export const OPERATOR_PASSWORD_HINT =
  process.env["STOCK_OPERATOR_PASSWORD"] ? "" : DEFAULT_OPERATOR_PASSWORD;
