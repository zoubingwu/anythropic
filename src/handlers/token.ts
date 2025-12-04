import { countClaudeTokens } from "../token";

export const handleCountTokens = async (c: any) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.model || !body.messages) {
      return c.json({ error: "model and messages are required" }, 400);
    }

    // Calculate token count
    const tokenCount = countClaudeTokens({
      model: body.model,
      messages: body.messages,
      system: body.system,
      tools: body.tools,
    });

    // Return Claude format response
    return c.json({
      input_tokens: tokenCount,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

export const handleCountTokensDetailed = async (c: any) => {
  const body = await c.req.json();

  const tokenCount = countClaudeTokens({
    model: body.model,
    messages: body.messages,
    system: body.system,
    tools: body.tools,
  });

  return c.json({
    input_tokens: tokenCount,
    model: body.model,
    message_count: body.messages?.length || 0,
    has_tools: !!body.tools,
    has_system: !!body.system,
  });
};
