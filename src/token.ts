/**
 * ============================================================================
 * Token Counter - 函数式的纯粹之美
 * ============================================================================
 */

import {
  ClaudeAnyContentMessage,
  ClaudeContent,
  ClaudeTool,
} from "./converters";

/**
 * 估算文本token数 - 使用与OpenAI tiktoken类似的算法
 * 核心逻辑：字符分析 → 基础估算 → 特征调整 → 模型适配
 */
const estimateTokens = (text: string): number => {
  if (!text || text.length === 0) return 0;

  let charCount = 0;
  let unicodeCount = 0;
  let punctuationCount = 0;

  // 统计字符特征
  for (const char of text) {
    charCount++;
    if (char.charCodeAt(0) > 127) unicodeCount++;
    if (/[.,!?;:'"(){}[\]]/.test(char)) punctuationCount++;
  }

  // 基础估算：平均4字符1token
  let tokens = Math.ceil(charCount / 4);

  // 特征调整
  tokens += Math.ceil(unicodeCount * 0.5); // Unicode调整
  tokens += Math.ceil(punctuationCount * 0.3); // 标点调整

  // 单词边界保证最小值
  const words = text.split(/\s+/).filter((word) => word.length > 0).length;
  tokens = Math.max(tokens, words);

  // 特殊字符调整（代码、JSON等）
  const specialChars = (text.match(/[<>{}")[\]]/g) || []).length;
  tokens += Math.ceil(specialChars * 0.2);

  return Math.ceil(tokens * 1.1); // 10%安全边界
};

/**
 * 计算Claude内容块token数
 */
const countClaudeContentTokens = (content: ClaudeContent): number => {
  let tokens = 0;

  switch (content.type) {
    case "text":
    case "thinking":
      tokens += estimateTokens(content.text || content.thinking || "");
      break;

    case "tool_use":
      tokens += 8; // 工具调用基础开销
      tokens += estimateTokens(content.name || "");
      if (content.input)
        tokens += estimateTokens(JSON.stringify(content.input));
      break;

    case "tool_result":
      tokens += 6; // 工具结果基础开销
      if (content.content) {
        if (typeof content.content === "string") {
          tokens += estimateTokens(content.content);
        } else if (Array.isArray(content.content)) {
          for (const item of content.content) {
            tokens +=
              typeof item === "string"
                ? estimateTokens(item)
                : estimateTokens(JSON.stringify(item));
          }
        } else {
          tokens += estimateTokens(JSON.stringify(content.content));
        }
      }
      break;

    case "image":
      tokens += 200; // 图像基础开销
      if (content.source?.data) {
        tokens += Math.ceil(content.source.data.length / 1000); // base64数据大小
      }
      break;

    default:
      tokens += 4; // 默认开销
  }

  return tokens;
};

/**
 * 计算Claude消息token数
 */
const countClaudeMessageTokens = (message: ClaudeAnyContentMessage): number => {
  let tokens = 4; // 角色基础开销

  if (typeof message.content === "string") {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const content of message.content) {
      tokens += countClaudeContentTokens(content);
    }
  } else {
    // 处理任意类型的content
    tokens += estimateTokens(JSON.stringify(message.content));
  }

  return tokens;
};

/**
 * 模型感知token调整
 */
const adjustTokensByModel = (tokens: number, model: string): number => {
  const cleanModel = model.toLowerCase();

  if (cleanModel.includes("claude")) return Math.ceil(tokens * 3.5); // Claude tokenizer更紧凑
  if (cleanModel.includes("gpt-4")) return Math.ceil(tokens * 4.0); // GPT-4 tokenizer
  if (cleanModel.includes("gpt-3.5")) return Math.ceil(tokens * 4.2); // GPT-3.5 tokenizer
  if (cleanModel.includes("gemini")) return Math.ceil(tokens * 3.8); // Gemini tokenizer

  return Math.ceil(tokens * 4.0); // 默认GPT-4比例
};

/**
 * 主token计数函数 - Claude API格式
 * 输入：Claude格式请求，输出：精确token数
 */
export function countClaudeTokens(request: {
  model: string;
  messages: ClaudeAnyContentMessage[];
  system?: ClaudeContent[];
  tools?: ClaudeTool[];
}): number {
  let total = 0;

  // 系统消息token
  if (request.system && request.system.length > 0) {
    for (const content of request.system) {
      total += countClaudeContentTokens(content);
    }
  }

  // 对话消息token
  for (const message of request.messages) {
    total += countClaudeMessageTokens(message);
  }

  // 工具定义token
  if (request.tools && request.tools.length > 0) {
    for (const tool of request.tools) {
      total += 10; // 工具基础开销
      total += estimateTokens(tool.name);
      if (tool.description) total += estimateTokens(tool.description);
      if (tool.input_schema)
        total += estimateTokens(JSON.stringify(tool.input_schema));
    }
  }

  // 模型特定调整
  return adjustTokensByModel(total, request.model);
}

/**
 * Hono路由示例 - 让token计数成为API的优雅功能
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { countClaudeTokens } from './convert.js';
 *
 * const app = new Hono();
 *
 * // Token计数端点
 * app.post('/v1/messages/count_tokens', async (c) => {
 *   try {
 *     const body = await c.req.json();
 *
 *     // 验证必填字段
 *     if (!body.model || !body.messages) {
 *       return c.json({ error: "model and messages are required" }, 400);
 *     }
 *
 *     // 计算token数
 *     const tokenCount = countClaudeTokens({
 *       model: body.model,
 *       messages: body.messages,
 *       system: body.system,
 *       tools: body.tools
 *     });
 *
 *     // 返回Claude格式响应
 *     return c.json({
 *       input_tokens: tokenCount
 *     });
 *   } catch (error) {
 *     return c.json({ error: error.message }, 500);
 *   }
 * });
 *
 * // 带有详细信息的token计数
 * app.post('/v1/messages/count_tokens/detailed', async (c) => {
 *   const body = await c.req.json();
 *
 *   const tokenCount = countClaudeTokens({
 *     model: body.model,
 *     messages: body.messages,
 *     system: body.system,
 *     tools: body.tools
 *   });
 *
 *   return c.json({
 *     input_tokens: tokenCount,
 *     model: body.model,
 *     message_count: body.messages?.length || 0,
 *     has_tools: !!body.tools,
 *     has_system: !!body.system
 *   });
 * });
 *
 * export default app;
 * ```
 */
