import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'; import { Message, ChatSession, WebSource, GenerateContentResponse, GroundingChunk, QuickPrompt } from '../types'; import ChatMessage from './ChatMessage'; import LoadingSpinner from './LoadingSpinner'; import { SendIcon, WarningIcon, ChatBubbleSvgIcon, SearchIcon, RegenerateIcon, TrashIcon, BoltIcon, BoldIcon, ItalicIcon, CodeBracketIcon, CodeBracketSquareIcon, ListBulletIcon } from './Icons'; import { sendMessage as sendMessageToGemini } from '../services/geminiService';

interface ChatAreaProps { activeChatSession: ChatSession | null; onUpdateChatSession: (updatedSession: ChatSession) => void; isSending: boolean; setIsSending: (isSending: boolean) => void; isApiKeyMissing: boolean; onRegenerate: (sessionToUpdate: ChatSession, messageToRegenerateId: string) => Promise<void>; initialSearchTerm?: string; onSearchTermChange?: (term: string) => void; quickPrompts: QuickPrompt[]; onDeleteCurrentChat: () => void; }

const ChatArea: React.FC<ChatAreaProps> = ({ activeChatSession, onUpdateChatSession, isSending, setIsSending, isApiKeyMissing, initialSearchTerm = '', onSearchTermChange, quickPrompts, onDeleteCurrentChat }) => { const [input, setInput] = useState<string>(''); const messagesEndRef = useRef<HTMLDivElement>(null); const [error, setError] = useState<string | null>(null); const [currentSearchTerm, setCurrentSearchTerm] = useState<string>(initialSearchTerm); const textAreaRef = useRef<HTMLTextAreaElement>(null); const [showQuickPrompts, setShowQuickPrompts] = useState(false);

const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, []);

useEffect(() => { scrollToBottom(); }, [activeChatSession?.messages, currentSearchTerm, scrollToBottom]);

useEffect(() => { setInput(''); setError(null); setCurrentSearchTerm(initialSearchTerm); if (textAreaRef.current) textAreaRef.current.style.height = 'auto'; }, [activeChatSession?.id, initialSearchTerm]);

const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newTerm = e.target.value; setCurrentSearchTerm(newTerm); if (onSearchTermChange) onSearchTermChange(newTerm); };

const extractWebSources = (groundingChunks?: GroundingChunk[]): WebSource[] => { if (!groundingChunks) return []; return groundingChunks .filter(chunk => chunk.web && chunk.web.uri) .map(chunk => ({ uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri })); };

const filteredMessages = useMemo(() => { if (!activeChatSession) return []; if (!currentSearchTerm.trim()) return activeChatSession.messages; return activeChatSession.messages.filter(msg => msg.text.toLowerCase().includes(currentSearchTerm.toLowerCase()) ); }, [activeChatSession, currentSearchTerm]);

const handleSend = async () => { const textToSend = input.trim(); if (!textToSend || isSending || !activeChatSession || isApiKeyMissing) return;

const userMessage: Message = {
  id: Date.now().toString(),
  sender: 'user',
  text: textToSend,
  timestamp: Date.now(),
};

const botMessageId = (Date.now() + 1).toString();
const botPlaceholderMessage: Message = {
  id: botMessageId,
  sender: 'bot',
  text: '',
  isLoading: false,
  timestamp: Date.now() + 1,
};

const updatedMessages = [...activeChatSession.messages, userMessage, botPlaceholderMessage];
onUpdateChatSession({ ...activeChatSession, messages: updatedMessages, lastUpdatedAt: Date.now() });

setInput('');
if (textAreaRef.current) textAreaRef.current.style.height = 'auto';
setIsSending(true);
setError(null);

try {
  const history = updatedMessages.filter(m => m.sender !== 'bot');
  const stream = await sendMessageToGemini(textToSend, history, activeChatSession.systemInstruction);
  const aggregatedResponse = await stream.response;
  const sources = extractWebSources(aggregatedResponse?.candidates?.[0]?.groundingMetadata?.groundingChunks);

  const newMessages = updatedMessages.map(msg =>
    msg.id === botMessageId
      ? { ...msg, text: aggregatedResponse?.text || '', sources, isError: false }
      : msg
  );

  onUpdateChatSession({ ...activeChatSession, messages: newMessages, lastUpdatedAt: Date.now() });
} catch (err: any) {
  const errorMessage = err.message || "An unknown error occurred.";
  setError(errorMessage);
  const erroredMessages = updatedMessages.map(msg =>
    msg.id === botMessageId
      ? { ...msg, text: `Error: ${errorMessage}`, isError: true }
      : msg
  );
  onUpdateChatSession({ ...activeChatSession, messages: erroredMessages, lastUpdatedAt: Date.now() });
} finally {
  setIsSending(false);
}

};

const applyMarkdownFormat = (type: 'bold' | 'italic' | 'inline-code' | 'code-block' | 'list-item') => { if (!textAreaRef.current) return; const textarea = textAreaRef.current; const start = textarea.selectionStart; const end = textarea.selectionEnd; const selected = textarea.value.substring(start, end); let formatted = selected;

switch (type) {
  case 'bold': formatted = `**${selected}**`; break;
  case 'italic': formatted = `*${selected}*`; break;
  case 'inline-code': formatted = `\`${selected}\``; break;
  case 'code-block': formatted = `\n\n\\`\\`\\`\n${selected}\n\\`\\`\\``; break;
  case 'list-item':
    formatted = selected.split('\n').map(line => `- ${line}`).join('\n');
    break;
}

const before = textarea.value.substring(0, start);
const after = textarea.value.substring(end);
const newText = before + formatted + after;
setInput(newText);
setTimeout(() => {
  textarea.focus();
  const newCursor = before.length + formatted.length;
  textarea.setSelectionRange(newCursor, newCursor);
}, 0);

};

if (isApiKeyMissing && !activeChatSession) { return <div className="p-6 text-center text-white">Missing API Key</div>; }

if (!activeChatSession) { return <div className="p-6 text-center text-white">No Chat Selected</div>; }

return ( <div className="flex flex-col h-full"> <header className="p-4 border-b"> <div className="flex justify-between items-center"> <h2 className="text-white text-lg truncate">{activeChatSession.title}</h2> <input
type="text"
placeholder="Search..."
value={currentSearchTerm}
onChange={handleSearchChange}
className="text-sm p-2 rounded bg-gray-800 text-white"
/> <button onClick={onDeleteCurrentChat} className="text-red-400 p-2"> <TrashIcon className="h-5 w-5" /> </button> </div> </header>

<main className="flex-1 overflow-y-auto p-4 space-y-4">
    {filteredMessages.map((msg) => (
      <ChatMessage key={msg.id} message={msg} searchTerm={currentSearchTerm} onRegenerate={() => {}} isLastBotMessage={false} />
    ))}
    <div ref={messagesEndRef} />
  </main>

  <footer className="p-4 border-t">
    {error && <div className="text-red-400 mb-2">{error}</div>}
    <div className="flex space-x-2 mb-2">
      {[BoldIcon, ItalicIcon, CodeBracketIcon, CodeBracketSquareIcon, ListBulletIcon].map((Icon, idx) => (
        <button
          key={idx}
          onClick={() => applyMarkdownFormat(['bold', 'italic', 'inline-code', 'code-block', 'list-item'][idx] as any)}
          className="p-2 bg-gray-700 text-white rounded"
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
    <div className="flex space-x-2">
      <textarea
        ref={textAreaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        className="flex-1 p-2 bg-gray-800 text-white rounded resize-none"
        rows={2}
        disabled={isSending || isApiKeyMissing}
      />
      <button
        onClick={handleSend}
        disabled={isSending || !input.trim() || isApiKeyMissing}
        className="p-3 bg-blue-500 text-white rounded"
      >
        {isSending ? <LoadingSpinner size="sm" color="white" /> : <SendIcon className="h-5 w-5" />}
      </button>
    </div>
  </footer>
</div>

); };

export default ChatArea;

