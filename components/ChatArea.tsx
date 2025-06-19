import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'; import { Message, ChatSession, WebSource, GenerateContentResponse, GroundingChunk, QuickPrompt } from '../types'; import ChatMessage from './ChatMessage'; import LoadingSpinner from './LoadingSpinner'; import { SendIcon, WarningIcon, ChatBubbleSvgIcon, SearchIcon, RegenerateIcon, TrashIcon, BoltIcon, BoldIcon, ItalicIcon, CodeBracketIcon, CodeBracketSquareIcon, ListBulletIcon } from './Icons'; import { sendMessage as sendMessageToGemini } from '../services/geminiService';

interface ChatAreaProps { activeChatSession: ChatSession | null; onUpdateChatSession: (updatedSession: ChatSession) => void; isSending: boolean; setIsSending: (isSending: boolean) => void; isApiKeyMissing: boolean; onRegenerate: (sessionToUpdate: ChatSession, messageToRegenerateId: string) => Promise<void>; initialSearchTerm?: string; onSearchTermChange?: (term: string) => void; quickPrompts: QuickPrompt[]; onDeleteCurrentChat: () => void; }

const ChatArea: React.FC<ChatAreaProps> = ({ activeChatSession, onUpdateChatSession, isSending, setIsSending, isApiKeyMissing, initialSearchTerm = '', onSearchTermChange, quickPrompts, onDeleteCurrentChat }) => { const [input, setInput] = useState(''); const messagesEndRef = useRef<HTMLDivElement>(null); const [error, setError] = useState<string | null>(null); const [currentSearchTerm, setCurrentSearchTerm] = useState<string>(initialSearchTerm); const textAreaRef = useRef<HTMLTextAreaElement>(null); const [renderedMessageIds, setRenderedMessageIds] = useState<Set<string>>(new Set());

const scrollToBottom = useCallback(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, []);

useEffect(() => { scrollToBottom(); }, [activeChatSession?.messages, currentSearchTerm, scrollToBottom]);

useEffect(() => { setInput(''); setError(null); setCurrentSearchTerm(initialSearchTerm); setRenderedMessageIds(new Set((activeChatSession?.messages || []).map(m => m.id))); }, [activeChatSession?.id, initialSearchTerm]);

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
  isLoading: true,
  timestamp: Date.now() + 1,
};

const updatedMessages = [...activeChatSession.messages, userMessage, botPlaceholderMessage];
onUpdateChatSession({ ...activeChatSession, messages: updatedMessages });
setInput('');
setIsSending(true);

try {
  const history = updatedMessages.filter(m => m.id !== botMessageId && m.sender !== 'bot');
  const stream = await sendMessageToGemini(textToSend, history);

  let accumulated = '';
  for await (const chunk of stream) {
    if (chunk?.text) {
      accumulated += chunk.text;
      const interimMessages = updatedMessages.map(m =>
        m.id === botMessageId ? { ...m, text: accumulated, isLoading: true } : m
      );
      onUpdateChatSession({ ...activeChatSession, messages: interimMessages });
    }
  }

  const finalText = (await stream.response)?.text || accumulated;
  const finalMessages = updatedMessages.map(m =>
    m.id === botMessageId ? { ...m, text: finalText, isLoading: false } : m
  );

  setRenderedMessageIds(prev => new Set(prev).add(botMessageId));
  onUpdateChatSession({ ...activeChatSession, messages: finalMessages });
} catch (e: any) {
  const errorText = e.message || 'An error occurred';
  const erroredMessages = updatedMessages.map(m =>
    m.id === botMessageId ? { ...m, text: `Error: ${errorText}`, isLoading: false } : m
  );
  setError(errorText);
  onUpdateChatSession({ ...activeChatSession, messages: erroredMessages });
} finally {
  setIsSending(false);
}

};

const filteredMessages = useMemo(() => { if (!activeChatSession) return []; if (!currentSearchTerm) return activeChatSession.messages; return activeChatSession.messages.filter(m => m.text.toLowerCase().includes(currentSearchTerm.toLowerCase())); }, [activeChatSession, currentSearchTerm]);

return ( <div className="flex flex-col h-full"> <header> <input value={currentSearchTerm} onChange={e => setCurrentSearchTerm(e.target.value)} placeholder="Search messages..." /> </header> <main className="flex-1 overflow-y-auto"> {filteredMessages.map(msg => ( <ChatMessage key={msg.id} message={msg} /> ))} <div ref={messagesEndRef} /> </main> <footer> {error && <div className="text-red-500">{error}</div>} <textarea ref={textAreaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="Type a message..." /> <button onClick={handleSend} disabled={isSending || !input.trim()}> Send </button> </footer> </div> ); };

export default ChatArea;

