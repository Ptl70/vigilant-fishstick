import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'; import { Message, ChatSession, WebSource, GroundingChunk, QuickPrompt } from '../types'; import ChatMessage from './ChatMessage'; import LoadingSpinner from './LoadingSpinner'; import { SendIcon, WarningIcon, ChatBubbleSvgIcon, SearchIcon, TrashIcon, BoltIcon, BoldIcon, ItalicIcon, CodeBracketIcon, CodeBracketSquareIcon, ListBulletIcon } from './Icons'; import { sendMessage as sendMessageToGemini } from '../services/geminiService';

interface ChatAreaProps { activeChatSession: ChatSession | null; onUpdateChatSession: (updatedSession: ChatSession) => void; isSending: boolean; setIsSending: (isSending: boolean) => void; isApiKeyMissing: boolean; onRegenerate: (sessionToUpdate: ChatSession, messageToRegenerateId: string) => Promise<void>; initialSearchTerm?: string; onSearchTermChange?: (term: string) => void; quickPrompts: QuickPrompt[]; onDeleteCurrentChat: () => void; }

const ChatArea: React.FC<ChatAreaProps> = ({ activeChatSession, onUpdateChatSession, isSending, setIsSending, isApiKeyMissing, initialSearchTerm = '', onSearchTermChange, quickPrompts, onDeleteCurrentChat }) => { const [input, setInput] = useState(''); const messagesEndRef = useRef<HTMLDivElement>(null); const [error, setError] = useState<string | null>(null); const [currentSearchTerm, setCurrentSearchTerm] = useState(initialSearchTerm); const textAreaRef = useRef<HTMLTextAreaElement>(null); const [showQuickPrompts, setShowQuickPrompts] = useState(false);

const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);

useEffect(() => { scrollToBottom(); }, [activeChatSession?.messages, currentSearchTerm, scrollToBottom]);

useEffect(() => { setInput(''); setError(null); setCurrentSearchTerm(initialSearchTerm); if (textAreaRef.current) { textAreaRef.current.style.height = 'auto'; } }, [activeChatSession?.id, initialSearchTerm]);

const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newTerm = e.target.value; setCurrentSearchTerm(newTerm); onSearchTermChange?.(newTerm); };

const extractWebSources = (groundingChunks?: GroundingChunk[]): WebSource[] => { if (!groundingChunks) return []; return groundingChunks .filter(chunk => chunk.web?.uri) .map(chunk => ({ uri: chunk.web!.uri, title: chunk.web!.title || chunk.web!.uri })); };

const filteredMessages = useMemo(() => { if (!activeChatSession) return []; if (!currentSearchTerm.trim()) return activeChatSession.messages; return activeChatSession.messages.filter(msg => msg.text?.toLowerCase().includes(currentSearchTerm.toLowerCase()) ); }, [activeChatSession, currentSearchTerm]);

const handleSend = async (messageTextOverride?: string, isRegeneration?: boolean, historyOverride?: Message[]) => { const textToSend = messageTextOverride || input.trim(); if (!textToSend || isSending || !activeChatSession || isApiKeyMissing) return;

const currentSession = activeChatSession;
let messagesToUpdate: Message[];
const userMessageId = crypto.randomUUID();
const botMessageId = crypto.randomUUID();

if (isRegeneration) {
  const regenIndex = currentSession.messages.findIndex(m => m.isLoading && m.sender === 'bot');
  if (regenIndex === -1) return;
  messagesToUpdate = [...currentSession.messages];
} else {
  const userMessage: Message = {
    id: userMessageId,
    sender: 'user',
    text: textToSend,
    timestamp: Date.now()
  };
  const botPlaceholder: Message = {
    id: botMessageId,
    sender: 'bot',
    text: '',
    isLoading: true,
    timestamp: Date.now() + 1
  };
  messagesToUpdate = [...currentSession.messages, userMessage, botPlaceholder];
  onUpdateChatSession({ ...currentSession, messages: messagesToUpdate, lastUpdatedAt: Date.now() });
}

if (!isRegeneration) {
  setInput('');
  textAreaRef.current!.style.height = 'auto';
}

setIsSending(true);
setError(null);

try {
  const history = historyOverride || (
    isRegeneration
      ? currentSession.messages.slice(0, currentSession.messages.findIndex(m => m.id === botMessageId))
      : messagesToUpdate.filter(m => m.id !== botMessageId && (m.sender !== 'bot' || !m.isLoading))
  );

  const response = await sendMessageToGemini(textToSend, history, currentSession.systemInstruction);
  const finalText = response?.text || '';
  const sources = extractWebSources(response?.candidates?.[0]?.groundingMetadata?.groundingChunks);

  messagesToUpdate = messagesToUpdate.map(msg =>
    msg.id === botMessageId ? { ...msg, text: finalText, isLoading: false, sources, isError: false } : msg
  );

  onUpdateChatSession({ ...currentSession, messages: messagesToUpdate, lastUpdatedAt: Date.now() });
} catch (err: any) {
  const errorMessage = err.message || 'An unknown error occurred.';
  setError(errorMessage);
  messagesToUpdate = messagesToUpdate.map(msg =>
    msg.id === botMessageId ? { ...msg, text: `Error: ${errorMessage}`, isLoading: false, isError: true } : msg
  );
  onUpdateChatSession({ ...currentSession, messages: messagesToUpdate, lastUpdatedAt: Date.now() });
} finally {
  setIsSending(false);
}

};

const applyMarkdownFormat = (format: 'bold' | 'italic' | 'inline-code' | 'code-block' | 'list-item') => { const textarea = textAreaRef.current; if (!textarea) return;

const start = textarea.selectionStart;
const end = textarea.selectionEnd;
const selected = textarea.value.substring(start, end);
const defaultText = {
  'bold': 'bold text',
  'italic': 'italic text',
  'inline-code': 'code',
  'code-block': 'code block',
  'list-item': 'list item'
}[format];
const content = selected || defaultText;

let formatted = '';
switch (format) {
  case 'bold': formatted = `**${content}**`; break;
  case 'italic': formatted = `*${content}*`; break;
  case 'inline-code': formatted = `\`${content}\``; break;
  case 'code-block': formatted = `\\`\\`\\`\n${content}\n\\`\\`\\``; break;
  case 'list-item':
    formatted = content.includes('\n') ? content.split('\n').map(line => `- ${line}`).join('\n') : `- ${content}`;
    break;
}

const before = textarea.value.substring(0, start);
const after = textarea.value.substring(end);
setInput(before + formatted + after);
setTimeout(() => {
  textarea.focus();
  const pos = before.length + formatted.length;
  textarea.setSelectionRange(pos, pos);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}, 0);

};

if (isApiKeyMissing && !activeChatSession) { return ( <div className="flex-1 flex flex-col items-center justify-center p-6 text-center glass-panel m-2 sm:m-4"> <WarningIcon className="h-16 w-16 text-red-400 mb-6" /> <h2 className="text-xl sm:text-2xl font-semibold text-white mb-3">API Key Error</h2> <p className="text-text-secondary text-sm sm:text-base"> The Gemini API key is missing or invalid. Please set the <code>API_KEY</code> environment variable. </p> </div> ); }

if (!activeChatSession) { return ( <div className="flex-1 flex flex-col items-center justify-center p-6 text-center glass-panel m-2 sm:m-4"> <ChatBubbleSvgIcon className="h-16 w-16 text-text-muted mb-6" /> <h2 className="text-xl sm:text-2xl font-semibold text-white mb-3">No Chat Selected</h2> <p className="text-text-secondary text-sm sm:text-base">Select or create a chat from the sidebar to begin.</p> </div> ); }

return ( <div className="flex-1 flex flex-col glass-panel min-w-0"> <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4"> {filteredMessages.map((msg, i, arr) => ( <ChatMessage key={msg.id} message={msg} searchTerm={currentSearchTerm} onRegenerate={() => handleSend(msg.text, true)} isLastBotMessage={i === arr.length - 1 && msg.sender === 'bot'} /> ))} <div ref={messagesEndRef} /> </main> <footer className="p-2 sm:p-3 md:p-4 border-t border-glass-stroke"> {error && ( <div className="mb-2 p-3 bg-red-500/30 text-red-100 border border-red-500/50 rounded-lg text-xs sm:text-sm"> {error} </div> )} <div className="flex items-end w-full min-w-0 space-x-2 md:space-x-3"> <textarea ref={textAreaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isSending) { e.preventDefault(); handleSend(); } }} placeholder="Send a message (Shift+Enter for new line)..." className="flex-1 p-3 glass-input rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none transition-shadow disabled:opacity-70 resize-none text-sm overflow-hidden" rows={1} style={{ minHeight: '44px', maxHeight: '120px' }} onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = ${Math.min(target.scrollHeight, 120)}px; }} disabled={isSending || isApiKeyMissing} aria-label="Chat input" /> <button onClick={() => handleSend()} disabled={isSending || input.trim() === '' || isApiKeyMissing} className="p-3 glass-button rounded-lg font-semibold h-[44px] aspect-square flex items-center justify-center self-end" aria-label="Send message" > {isSending ? <LoadingSpinner size="sm" color="white" /> : <SendIcon className="h-5 w-5 text-white" />} </button> </div> </footer> </div> ); };

export default ChatArea;

