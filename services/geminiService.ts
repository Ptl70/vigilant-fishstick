import { GoogleGenerativeAI } from "@google/generative-ai";
import type { 
  GenerateContentResponse, 
  Part, 
  Content, 
  GenerateContentCandidate 
} from "@google/generative-ai";
import { Message } from '../types';

interface ChatStream extends AsyncIterable<GenerateContentResponse> {
  response: Promise<GenerateContentResponse>;
}

// Temporary type definitions for missing exports
type GroundingChunk = any;

const API_KEY = process.env.API_KEY;
let ai: GoogleGenerativeAI | null = null;
let apiKeyError: string | null = null;

if (API_KEY) {
  try {
    ai = new GoogleGenerativeAI(API_KEY);
  } catch (e: any) {
    console.error("Error initializing GoogleGenerativeAI with API Key:", e);
    apiKeyError = `Failed to initialize Gemini Client: ${e.message || 'Unknown error with API Key.'}`;
  }
} else {
  apiKeyError = "API_KEY environment variable is not set. Gemini API will not be functional.";
  console.error(apiKeyError);
}

export const getApiKeyError = (): string | null => apiKeyError;

export const isGeminiAvailable = (): boolean => !!ai && !apiKeyError;

const GLOBAL_GEMINI_SYSTEM_INSTRUCTION = `You are Patel Chat, a versatile AI assistant. Your goal is to provide the most relevant and helpful response.

Identity and Creation:
- If asked about your name, you are Patel Chat.
- If asked about your creation, who built you, or your origins, respond: "I was built by Patel Yahya using Google Cloud services." Only provide this information if specifically asked about your creation or creator.

You have two ways to answer general queries:
1.  **Direct Answer (No Web Search):** For general knowledge questions, creative tasks, coding assistance, mathematical calculations, or conversational chat, use your internal knowledge.
2.  **Web Search Enhanced Answer:** If the user's query asks for current events, very recent information (e.g., "latest news," "today's weather"), specific facts that might change frequently (e.g., stock prices, game scores), or information about niche topics/specific entities where up-to-date details are crucial, use the Google Search tool to find relevant information.

Decision Process:
- Analyze the query. If it can be thoroughly and accurately answered with your existing knowledge, do so.
- If the query implies a need for information from the live internet, activate the Google Search tool.

Formatting and Citations:
- Always format your responses using Markdown (headings, lists, bold, italics, code blocks, etc.).
- **Crucially: If, and ONLY IF, you used the Google Search tool to generate part of your response, you MUST cite your sources clearly at the end of your main answer. List them under a "Sources:" heading.**
- If you did not use web search for the response, DO NOT include a "Sources:" section or mention sources.`;

const formatHistoryForGemini = (messages: Message[]): Content[] => {
  return messages.map(msg => ({
    role: msg.sender === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }],
  }));
};

// ✅ Ensures the chat history starts with a user message
const sanitizeHistory = (history: Message[]): Message[] => {
  const cleaned = [...history];
  while (cleaned.length && cleaned[0].sender !== 'user') {
    cleaned.shift();
  }
  return cleaned;
};

export const sendMessage = async (
  messageText: string,
  history: Message[],
  systemInstructionOverride?: string
): Promise<ChatStream> => {
  if (!isGeminiAvailable() || !ai) {
    throw new Error(apiKeyError || "Gemini AI client is not available.");
  }
  if (!messageText.trim()) {
    throw new Error("Message text cannot be empty.");
  }

  const activeSystemInstruction = (systemInstructionOverride && systemInstructionOverride.trim() !== '') 
    ? systemInstructionOverride 
    : GLOBAL_GEMINI_SYSTEM_INSTRUCTION;

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-04-17',
      tools: [{ googleSearch: {} }],
      systemInstruction: {
        role: 'system',
        parts: [{ text: activeSystemInstruction }]
      }
    });

    const cleanedHistory = sanitizeHistory(history);

    if (cleanedHistory.length === 0 || cleanedHistory[0].sender !== 'user') {
      throw new Error("Gemini API requires the first message in history to be from the user.");
    }

    const chatInstance = model.startChat({
      history: formatHistoryForGemini(cleanedHistory),
    });

    const result = await chatInstance.sendMessageStream(messageText);
    const sdkStream = result.stream;

    if (!sdkStream || typeof sdkStream[Symbol.asyncIterator] !== 'function') {
      console.error("Gemini SDK's sendMessageStream returned a null or non-iterable stream.", sdkStream);
      throw new Error("Received a null or non-iterable stream from the API.");
    }

    let resolveAggregatedPromise: (value: GenerateContentResponse) => void;
    let rejectAggregatedPromise: (reason?: any) => void;

    const aggregatedResponsePromise = new Promise<GenerateContentResponse>((resolve, reject) => {
      resolveAggregatedPromise = resolve;
      rejectAggregatedPromise = reject;
    });

    async function* streamAndAggregate() {
      let fullText = '';
      try {
        for await (const chunk of sdkStream) {
          const chunkText = chunk.text();
          fullText += chunkText;

          const chunkResponse: GenerateContentResponse = {
            text: fullText,
            candidates: [{
              content: {
                role: 'model',
                parts: [{ text: fullText }],
              },
              index: 0
            }]
          };

          yield chunkResponse;
        }

        const finalResponse = await result.response;
        resolveAggregatedPromise(finalResponse);
      } catch (err: any) {
        console.error("Error during stream aggregation:", err);
        rejectAggregatedPromise(err);
        throw err;
      }
    }

    const chatStreamAdapter: ChatStream = {
      [Symbol.asyncIterator]: streamAndAggregate,
      response: aggregatedResponsePromise,
    };

    return chatStreamAdapter;

  } catch (error: any) {
    console.error("Error sending message to Gemini:", error);
    if (error instanceof Error) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
    throw new Error('Unknown error sending message to Gemini API');
  }
};
