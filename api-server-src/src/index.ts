// index.ts — original entry called `app.listen(PORT)` for the long-running
// Replit VM. For the Vercel Serverless Function we export the express app
// instead and let `api/[...path].mjs` invoke it per request.
//
// (We intentionally leave the old file as a TS source for documentation; only
// this rewrite is referenced by build.mjs.)
import app from "./app";

export default app;
export { app };
