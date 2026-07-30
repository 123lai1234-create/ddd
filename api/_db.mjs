// api/_db.mjs — Neon HTTP SQL API helper.
// Active only when the neon-serverless driver is available and DATABASE_URL is
// present. Right now we ship without the driver (zero-deps), so the functions
// just gracefully fall back to a hard-coded seed.
//
// To enable real DB writes/reads, install @neondatabase/serverless in
// package.json and replace the `q` stub below with `neon(DATABASE_URL)`.

function dbUrl() {
  return process.env.DATABASE_URL || process.env.DATABASE_URL_NEON || "";
}

export async function q(_sql, _params = []) {
  // Driver not loaded. Caller should catch and fall back to seed.
  throw new Error("Neon driver not installed — using seed fallback");
}

export function operatorOk(provided) {
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (!expected) return true;
  return typeof provided === "string" && provided === expected;
}

export { dbUrl };
