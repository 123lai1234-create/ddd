import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

// Trust the infrastructure-level reverse proxy (Replit / Fly.io) so that
// req.ip reflects the real client address from X-Forwarded-For rather than
// the proxy's address. This makes IP-based rate limiting reliable and prevents
// spoofing via attacker-supplied header values.
const app: Express = express();
app.set("trust proxy", 1);

// Original backend mounted `pino-http` for request logging. That package pulls
// in `thread-stream` workers which Vercel Functions can't run. We drop the
// middleware here; the admin log buffer still captures console.warn/error
// output from route handlers.
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
