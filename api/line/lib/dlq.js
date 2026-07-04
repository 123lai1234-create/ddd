// Dead-letter logger for failed event processing.
// Writes a structured JSON line to console.error; Vercel captures these in
// the function log, queryable from dashboard or via `vercel logs`.
//
// To upgrade to persistent DLQ (Vercel Blob, KV, external queue), implement
// the same `record(event, err, ctx)` interface and reassign `dlq`.

const dlq = {
  record(event, err, ctx = {}) {
    const safeEvent = {
      type: event?.type,
      userId: event?.source?.userId,
      replyToken: event?.replyToken ? `${String(event.replyToken).slice(0, 8)}...` : null,
      messageId: event?.message?.id,
      text: event?.message?.text,
    };
    console.error(
      JSON.stringify({
        tag: "line-dlq",
        ts: new Date().toISOString(),
        reqId: ctx.reqId,
        err: String(err?.message ?? err),
        errStack: err?.stack?.split("\n").slice(0, 3).join(" | "),
        event: safeEvent,
      }),
    );
  },
};

export default dlq;