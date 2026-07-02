// logger.ts — serverless-friendly replacement for the original pino logger.
// The real pino logger pulls in `pino-pretty` (a worker-thread transport) and
// esbuild can't bundle that into a single-file Vercel function. This shim
// exposes the same surface (`logger.info({obj}, msg)`, `.warn`, `.error`,
// `.debug`) so route files don't need to change.

type LogFields = Record<string, unknown> | undefined;

function emit(level: string, fields: LogFields, msg: string): void {
  const ts = new Date().toISOString();
  const fieldsStr = fields ? ` ${JSON.stringify(fields)}` : "";
  // Use process.stdout.write for the structured prefix; the `console` family
  // is monkey-patched by admin.ts to capture warnings/errors, so emitting via
  // console.* keeps the existing log buffer working.
  const line = `${ts} ${level.padEnd(5)} ${msg}${fieldsStr}`;
  if (level === "ERROR" || level === "CRITICAL") {
    console.error(line);
  } else if (level === "WARNING") {
    console.warn(line);
  } else {
    // info / debug / trace
    console.log(line);
  }
}

export const logger = {
  info: (fields: LogFields, msg?: string): void => emit("INFO", fields, msg ?? ""),
  warn: (fields: LogFields, msg?: string): void => emit("WARNING", fields, msg ?? ""),
  error: (fields: LogFields, msg?: string): void => emit("ERROR", fields, msg ?? ""),
  debug: (fields: LogFields, msg?: string): void => emit("DEBUG", fields, msg ?? ""),
  trace: (fields: LogFields, msg?: string): void => emit("TRACE", fields, msg ?? ""),
  fatal: (fields: LogFields, msg?: string): void => emit("FATAL", fields, msg ?? ""),
  child: (_bindings: LogFields) => logger,
  level: "info" as string,
};
