// api/ping.mjs — env key dump (no values)
export default function (req, res) {
  const keys = Object.keys(process.env).sort();
  const summary = {};
  for (const k of keys) {
    summary[k] = (process.env[k] ?? "").length;
  }
  res.status(200).json({
    ok: true, node: process.version,
    env_count: keys.length,
    env_keys: keys,
    env_value_lengths: summary,
  });
}
export const config = { maxDuration: 10 };
