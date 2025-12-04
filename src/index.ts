import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  handleClaudeToOpenAI,
  handleCountTokens,
  handleCountTokensDetailed,
} from "./handlers";

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

export default app;
