import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Message, ChatSession, WebSource,
  GenerateContentResponse, GroundingChunk, QuickPrompt
} from '../types';
import ChatMessage from './ChatMessage';
import LoadingSpinner from './LoadingSpinner';
import {
  SendIcon, TrashIcon, BoldIcon,
  ItalicIcon, CodeBracketIcon, CodeBracketSquareIcon, ListBulletIcon
} from './Icons';
import { sendMessage as sendMessageToGemini } from '../services/geminiService';

interface ChatAreaProps {
  activeChatSession: ChatSession | null;
  onUpdateChatSession: (updatedSession: ChatSession) => void;
  isSending: boolean;
  setIsSending: (isSending: boolean) => void;
  isApiKeyMissing: boolean;
  onRegenerate: (sessionToUpdate: ChatSession, messageToRegenerateId: string) => Promise<void>;
  initialSearchTerm?: string;
  onSearchTermChange?: (term: string) => void;
  quickPrompts: QuickPrompt[];
  onDeleteCurrentChat: () => void;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  activeChatSession,
  onUpdateChatSession,
  isSending,
  setIsSending,
  isApiKeyMissing,
  initialSearchTerm = '',
  onSearchTermChange,
  quickPrompts,
  onDeleteCurrentChat
}) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentSearchTerm, setCurrentSearchTerm] = useState(initialSearchTerm);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeChatSession?.messages, currentSearchTerm]);

  useEffect(() => {
    setInput('');
    setError(null);
    setCurrentSearchTerm(initialSearchTerm);
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
    }
  }, [activeChatSession?.id, initialSearchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setCurrentSearchTerm(term);
    onSearchTermChange?.(term);
  };

  const extractWebSources = (chunks?: GroundingChunk[]): WebSource[] => {
    if (!chunks) return [];
    return chunks
      .filter(chunk => chunk.web?.uri)
      .map(chunk => ({ uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri }));
  };

  const filteredMessages = useMemo(() => {
    if (!activeChatSession) return [];
    if (!currentSearchTerm.trim()) return activeChatSession.messages;
    return activeChatSession.messages.filter(msg =>
      msg.text.toLowerCase().includes(currentSearchTerm.toLowerCase())
    );
  }, [activeChatSession, currentSearchTerm]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending || !activeChatSession || isApiKeyMissing) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: Date.now(),
    };

    const botId = (Date.now() + 1).toString();
    const placeholder: Message = {
      id: botId,
      sender: 'bot',
      text: '',
      isLoading: false,
      timestamp: Date.now() + 1,
    };

    const updated = [...activeChatSession.messages, userMsg, placeholder];
    onUpdateChatSession({ ...activeChatSession, messages: updated, lastUpdatedAt: Date.now() });

    setInput('');
    if (textAreaRef.current) textAreaRef.current.style.height = 'auto';
    setIsSending(true);
    setError(null);

    try {
      const history = updated.filter(m => m.sender !== 'bot');
      const stream = await sendMessageToGemini(text, history, activeChatSession.systemInstruction);
      const aggregated = await stream.response;

      const sources = extractWebSources(aggregated?.candidates?.[0]?.groundingMetadata?.groundingChunks);

      const finalMessages = updated.map(msg =>
        msg.id === botId
          ? { ...msg, text: aggregated?.text || '', sources, isError: false }
          : msg
      );

      onUpdateChatSession({ ...activeChatSession, messages: finalMessages, lastUpdatedAt: Date.now() });
    } catch (err: any) {
      const errorText = err.message || 'An unknown error occurred.';
      setError(errorText);
      const errored = updated.map(msg =>
        msg.id === botId
          ? { ...msg, text: `Error: ${errorText}`, isError: true }
          : msg
      );
      onUpdateChatSession({ ...activeChatSession, messages: errored, lastUpdatedAt: Date.now() });
    } finally {
      setIsSending(false);
    }
  };

  const applyMarkdownFormat = (type: 'bold' | 'italic' | 'inline-code' | 'code-block' | 'list-item') => {
    if (!textAreaRef.current) return;

    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    let formatted = selected;

    switch (type) {
      case 'bold':
        formatted = `**${selected}**`;
        break;
      case 'italic':
        formatted = `*${selected}*`;
        break;
      case 'inline-code':
        formatted = `\`${selected}\``;
        break;
      case 'code-block':
        formatted = `\n\n\`\`\`\n${selected}\n\`\`\`\n\n`;
        break;
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

  if (isApiKeyMissing && !activeChatSession) {
    return <div className="p-6 text-center text-white">Missing API Key</div>;
  }

  if (!activeChatSession) {
    return <div className="p-6 text-center text-white">No Chat Selected</div>;
  }

  return (
    <div className="flex flex-col h-full w-full backdrop-blur-xl bg-white/10 text-white rounded-xl shadow-md border border-white/20">
      <header className="p-4 border-b border-white/20">
        <div className="flex justify-between items-center gap-2">
          <h2 className="text-lg truncate">{activeChatSession.title}</h2>
          <input
            type="text"
            placeholder="Search..."
            value={currentSearchTerm}
            onChange={handleSearchChange}
            className="text-sm p-2 rounded bg-white/10 text-white border border-white/20 w-1/2"
          />
          <button onClick={onDeleteCurrentChat} className="text-red-400 p-2 hover:text-red-500">
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredMessages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            searchTerm={currentSearchTerm}
            onRegenerate={() => {}}
            isLastBotMessage={false}
          />
        ))}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 border-t border-white/20">
        {error && <div className="text-red-400 mb-2">{error}</div>}

        <div className="flex space-x-2 mb-2">
          {[BoldIcon, ItalicIcon, CodeBracketIcon, CodeBracketSquareIcon, ListBulletIcon].map((Icon, idx) => (
            <button
              key={idx}
              onClick={() => applyMarkdownFormat(['bold', 'italic', 'inline-code', 'code-block', 'list-item'][idx] as any)}
              className="p-2 bg-white/10 border border-white/20 hover:bg-white/20 rounded"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:space-x-2 gap-2">
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
            className="flex-1 p-2 bg-white/10 border border-white/20 text-white rounded resize-none"
            rows={2}
            disabled={isSending || isApiKeyMissing}
          />
          <button
            onClick={handleSend}
            disabled={isSending || !input.trim() || isApiKeyMissing}
            className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded"
          >
            {isSending ? <LoadingSpinner size="sm" color="white" /> : <SendIcon className="h-5 w-5" />}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ChatArea;
