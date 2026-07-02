import { logger } from "./logger";

export interface ScanResult {
  code: string;
  name: string;
  signals_today: string[];
}

/**
 * Send the daily scan report. Uses SMTP credentials when configured
 * (SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM); otherwise logs and skips.
 */
export async function sendScanEmail(recipients: string[], results: ScanResult[]): Promise<boolean> {
  if (recipients.length === 0) return false;
  const lines = results.flatMap((r) => r.signals_today);
  const body =
    lines.length > 0
      ? `今日台股均線買賣訊號：\n\n${lines.join("\n")}`
      : "今日台股無新的均線買賣訊號。";

  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  const from = process.env["MAIL_FROM"] ?? user;

  if (!host || !user || !pass) {
    logger.warn(
      { recipients: recipients.length, signals: lines.length },
      "SMTP not configured — scan email skipped (set SMTP_HOST/SMTP_USER/SMTP_PASS to enable)",
    );
    return false;
  }

  try {
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env["SMTP_PORT"] ?? 587),
      secure: Number(process.env["SMTP_PORT"] ?? 587) === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from,
      to: recipients.join(","),
      subject: `台股均線訊號報告 ${new Date().toISOString().slice(0, 10)}`,
      text: body,
    });
    logger.info({ recipients: recipients.length }, "Scan email sent");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send scan email");
    return false;
  }
}
