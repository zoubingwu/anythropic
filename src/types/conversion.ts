export interface StreamConversionState {
  messageId: string;
  sentMessageStart: boolean;
  currentContentIndex: number;
  currentContentType: string | null;
  contentTexts: string[];
  thinkingTexts: string[];
  toolCalls: Array<{
    index: number;
    id: string;
    name: string;
    input: string;
  }>;
  sentThinkingSignature: boolean;
  thinkingSignature?: string;
}
