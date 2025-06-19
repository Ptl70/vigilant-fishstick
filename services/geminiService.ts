
import { GoogleGenAI, Chat, GenerateContentResponse, Part, GroundingChunk, Candidate, Content } from "@google/genai";
import { Message } from '../types'; // Assuming Message type is relevant for history formatting

// Define ChatStream locally within this service as it's an implementation detail
interface ChatStream extends AsyncIterable<GenerateContentResponse> {
  response: Promise<GenerateContentResponse>;
}


const API_KEY = process.env.API_KEY;
let ai: GoogleGenAI | null = null;
let apiKeyError: string | null = null;

if (API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (e: any) {
    console.error("Error initializing GoogleGenAI with API Key:", e);
    apiKeyError = `Failed to initialize Gemini Client: ${e.message || 'Unknown error with API Key.'}`;
  }
} else {
  apiKeyError = "API_KEY environment variable is not set. Gemini API will not be functional.";
  console.error(apiKeyError);
}

export const getApiKeyError = (): string | null => {
  return apiKeyError;
};

export const isGeminiAvailable = (): boolean => {
  return !!ai && !apiKeyError;
};

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

export const sendMessage = async (
  messageText: string,
  history: Message[],
  systemInstructionOverride?: string // Optional override for per-chat instructions
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
    // Create a new chat instance for each message, providing history
    const chatInstance = ai.chats.create({
      model: 'gemini-2.5-flash-preview-04-17',
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: activeSystemInstruction,
      },
      history: formatHistoryForGemini(history),
    });

    const sdkStream: AsyncIterable<GenerateContentResponse> = await chatInstance.sendMessageStream({
      message: messageText,
    });

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
        const allReceivedChunks: GenerateContentResponse[] = [];
        try {
            for await (const chunk of sdkStream) {
                allReceivedChunks.push(chunk);
                yield chunk; 
            }

            if (allReceivedChunks.length === 0) {
                 const emptyResponse: GenerateContentResponse = {
                    text: "",
                    candidates: [] as Candidate[], 
                    data: undefined,
                    functionCalls: undefined,
                    executableCode: undefined,
                    codeExecutionResult: undefined,
                    promptFeedback: undefined, 
                    usageMetadata: undefined,
                };
                resolveAggregatedPromise(emptyResponse);
                return;
            }
            
            const lastChunk = allReceivedChunks[allReceivedChunks.length - 1];
            const fullText = allReceivedChunks.map(c => c.text || "").join("");

            const candidates: Candidate[] = (lastChunk.candidates && lastChunk.candidates.length > 0)
                ? lastChunk.candidates.map((candidate: Candidate) => ({
                    ...candidate,
                    content: candidate.content
                        ? { ...candidate.content, parts: [{ text: fullText }] as Part[] }
                        : { parts: [{ text: fullText }] as Part[], role: 'model' as const },
                  }))
                : [{
                    content: { parts: [{ text: fullText }] as Part[], role: 'model' as const },
                    finishReason: undefined,
                    index: 0,
                    safetyRatings: undefined,
                    citationMetadata: undefined,
                    tokenCount: undefined,
                    finishMessage: undefined,
                    groundingMetadata: lastChunk.candidates?.[0]?.groundingMetadata 
                  }];


            const finalAggregatedResponse: GenerateContentResponse = {
                text: fullText,
                candidates: candidates,
                data: lastChunk.data,
                functionCalls: lastChunk.functionCalls,
                executableCode: lastChunk.executableCode,
                codeExecutionResult: lastChunk.codeExecutionResult,
                createTime: lastChunk.createTime,
                responseId: lastChunk.responseId,
                automaticFunctionCallingHistory: lastChunk.automaticFunctionCallingHistory,
                modelVersion: lastChunk.modelVersion,
                promptFeedback: lastChunk.promptFeedback,
                usageMetadata: lastChunk.usageMetadata,
            };
            
            resolveAggregatedPromise(finalAggregatedResponse);

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

export { GroundingChunk, Part, Candidate };