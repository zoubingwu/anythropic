import { Hono } from "hono";
import { cors } from "hono/cors";
import { handleClaudeToOpenAI } from "./handlers/proxy";
import { handleCountTokens, handleCountTokensDetailed } from "./handlers/token";

const app = new Hono();

app.use("*", cors());

app.post("*", async (c) => {
  const path = c.req.path;

  if (path.endsWith("/v1/messages")) {
    return handleClaudeToOpenAI(c);
  } else if (path.endsWith("/v1/messages/count_tokens")) {
    return handleCountTokens(c);
  } else if (path.endsWith("/v1/messages/count_tokens/detailed")) {
    return handleCountTokensDetailed(c);
  } else {
    return c.json(
      { error: "Endpoint not supported. Use /v1/messages for Claude format" },
      404,
    );
  }
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/", (c) => {
  return c.html(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Redirecting to GitHub</title>
        <meta http-equiv="refresh" content="0; url='https://github.com/zoubingwu/anythropic#readme'" />
      </head>
      <body>
        <p>Redirecting to GitHub repository README...</p>
        <p>If you are not redirected automatically, <a href="https://github.com/zoubingwu/anythropic#readme">click here</a>.</p>
      </body>
    </html>`,
  );
});

export default app;
