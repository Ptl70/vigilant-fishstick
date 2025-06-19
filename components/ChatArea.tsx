import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Message, ChatSession, WebSource,
  GenerateContentResponse, GroundingChunk, QuickPrompt
} from '../types';
import ChatMessage from './ChatMessage';
import LoadingSpinner from './LoadingSpinner';
import {
  SendIcon, WarningIcon, ChatBubbleSvgIcon, SearchIcon,
  RegenerateIcon, TrashIcon, BoltIcon, BoldIcon, ItalicIcon,
  CodeBracketIcon, CodeBracketSquareIcon, ListBulletIcon
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
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeChatSession?.messages, currentSearchTerm, scrollToBottom]);

  useEffect(() => {
    setInput('');
    setError(null);
    setCurrentSearchTerm(initialSearchTerm);
    if (textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
    }
  }, [activeChatSession?.id, initialSearchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTerm = e.target.value;
    setCurrentSearchTerm(newTerm);
    onSearchTermChange?.(newTerm);
  };

  const extractWebSources = (groundingChunks?: GroundingChunk[]): WebSource[] =>
    groundingChunks?.filter(chunk => chunk.web?.uri)
      .map(chunk => ({
        uri: chunk.web!.uri,
        title: chunk.web!.title || chunk.web!.uri
      })) || [];

  const filteredMessages = useMemo(() => {
    if (!activeChatSession) return [];
    const term = currentSearchTerm.trim().toLowerCase();
    return !term
      ? activeChatSession.messages
      : activeChatSession.messages.filter(m => m.text.toLowerCase().includes(term));
  }, [activeChatSession, currentSearchTerm]);

  const handleSend = async (
    messageTextOverride?: string,
    isRegeneration?: boolean,
    historyOverride?: Message[]
  ) => {
    const textToSend = messageTextOverride || input.trim();
    if (!textToSend || isSending || !activeChatSession || isApiKeyMissing) return;

    const sessionBeforeSend = activeChatSession;
    const systemInstruction = sessionBeforeSend.systemInstruction;
    let messages = sessionBeforeSend.messages;
    let botMessageId: string;

    if (isRegeneration) {
      const index = messages.findIndex(m => m.isLoading && m.sender === 'bot');
      if (index === -1) return;
      botMessageId = messages[index].id;
    } else {
      const userMessage: Message = {
        id: `${Date.now()}`,
        sender: 'user',
        text: textToSend,
        timestamp: Date.now()
      };
      botMessageId = `${Date.now() + 1}`;
      const botPlaceholder: Message = {
        id: botMessageId,
        sender: 'bot',
        text: '',
        isLoading: true,
        timestamp: Date.now() + 1
      };
      messages = [...messages, userMessage, botPlaceholder];
      onUpdateChatSession({
        ...sessionBeforeSend,
        messages,
        lastUpdatedAt: Date.now()
      });
      setInput('');
      if (textAreaRef.current) textAreaRef.current.style.height = 'auto';
    }

    setIsSending(true);
    setError(null);

    try {
      const history = historyOverride || (
        isRegeneration
          ? sessionBeforeSend.messages.slice(0, sessionBeforeSend.messages.findIndex(m => m.id === botMessageId))
          : messages.filter(m => m.id !== botMessageId && !(m.sender === 'bot' && m.isLoading))
      );

      let fullText = '';
      const stream = await sendMessageToGemini(textToSend, history, systemInstruction);

      for await (const chunk of stream) {
        if (chunk?.text) {
          fullText = chunk.text;
          messages = messages.map(m =>
            m.id === botMessageId ? { ...m, text: fullText, isLoading: true, isError: false } : m
          );
          onUpdateChatSession({ ...sessionBeforeSend, messages, lastUpdatedAt: Date.now() });
        }
      }

      const final = await stream.response;
      const finalText = final?.text?.trim() || fullText;
      const sources = extractWebSources(final?.candidates?.[0]?.groundingMetadata?.groundingChunks);

      messages = messages.map(m =>
        m.id === botMessageId
          ? { ...m, text: finalText, isLoading: false, sources, isError: false }
          : m
      );
      onUpdateChatSession({ ...sessionBeforeSend, messages, lastUpdatedAt: Date.now() });

    } catch (err: any) {
      const errorMsg = err.message || 'An unknown error occurred.';
      setError(errorMsg);
      messages = messages.map(m =>
        m.id === botMessageId
          ? { ...m, text: `Error: ${errorMsg}`, isLoading: false, isError: true }
          : m
      );
      onUpdateChatSession({ ...sessionBeforeSend, messages, lastUpdatedAt: Date.now() });
    } finally {
      setIsSending(false);
    }
  };

  const initiateRegeneration = async (messageId: string) => {
    if (!activeChatSession || isSending) return;
    const index = activeChatSession.messages.findIndex(m => m.id === messageId);
    if (index < 1 || activeChatSession.messages[index - 1].sender !== 'user') return;

    const history = activeChatSession.messages.slice(0, index);
    const updatedMessages = activeChatSession.messages.map(m =>
      m.id === messageId
        ? { ...m, text: '', isLoading: true, isError: false, sources: [] }
        : m
    );
    onUpdateChatSession({ ...activeChatSession, messages: updatedMessages, lastUpdatedAt: Date.now() });
    await handleSend(activeChatSession.messages[index - 1].text, true, history);
  };

  const applyMarkdownFormat = (type: 'bold' | 'italic' | 'inline-code' | 'code-block' | 'list-item') => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);

    const wrapped = {
      bold: `**${selected}**`,
      italic: `*${selected}*`,
      'inline-code': `\`${selected}\``,
      'code-block': `\`\`\`\n${selected}\n\`\`\``,
      'list-item': selected.includes('\n') ? selected.split('\n').map(l => `- ${l}`).join('\n') : `- ${selected}`
    }[type];

    const updated = textarea.value.slice(0, start) + wrapped + textarea.value.slice(end);
    setInput(updated);

    setTimeout(() => {
      textarea.focus();
      const pos = start + wrapped.length;
      textarea.setSelectionRange(pos, pos);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }, 0);
  };

  if (isApiKeyMissing && !activeChatSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center glass-panel m-2 sm:m-4">
        <WarningIcon className="h-16 w-16 text-red-400 mb-6" />
        <h2 className="text-xl font-semibold text-white mb-3">API Key Error</h2>
        <p className="text-text-secondary">Missing or invalid Gemini API key. Set the <code>API_KEY</code>.</p>
      </div>
    );
  }

  if (!activeChatSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center glass-panel m-2 sm:m-4">
        <ChatBubbleSvgIcon className="h-16 w-16 text-text-muted mb-6" />
        <h2 className="text-xl font-semibold text-white mb-3">No Chat Selected</h2>
        <p className="text-text-secondary">Create or select a chat to begin.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col glass-panel min-w-0">
      {/* Header */}
      <header className="p-4 border-b border-glass-stroke flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white truncate flex-1">{activeChatSession.title}</h2>
        <div className="relative w-full sm:w-auto sm:max-w-sm">
          <input
            type="text"
            placeholder="Search in chat..."
            value={currentSearchTerm}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-3 py-2 glass-input rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none"
          />
          <SearchIcon className="h-4 w-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
        <button
          onClick={onDeleteCurrentChat}
          className="p-2 glass-button rounded-lg text-text-muted hover:text-red-400"
          title="Delete Chat"
          aria-label="Delete"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </header>

      {/* Message List */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredMessages.map((msg, i, arr) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            searchTerm={currentSearchTerm}
            onRegenerate={initiateRegeneration}
            isLastBotMessage={i === arr.length - 1 && msg.sender === 'bot'}
          />
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Footer */}
      <footer className="p-4 border-t border-glass-stroke">
        {error && (
          <div className="mb-2 p-3 bg-red-500/20 text-red-100 border border-red-500/50 rounded-md text-sm">
            {error}
          </div>
        )}

        {quickPrompts.length > 0 && (
          <div className="mb-2 relative">
            <button
              onClick={() => setShowQuickPrompts(!showQuickPrompts)}
              className="flex items-center w-full sm:w-auto text-left p-2 glass-button rounded-md text-sm hover:bg-white/10"
            >
              <BoltIcon className="h-4 w-4 mr-2 text-yellow-400" />
              Quick Prompts
              <svg className={`w-3 h-3 ml-auto transition-transform ${showQuickPrompts ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showQuickPrompts && (
              <div className="absolute bottom-full left-0 mb-1 w-full sm:w-72 max-h-48 overflow-y-auto glass-panel p-2 rounded-md shadow-lg z-10">
                {quickPrompts.map(qp => (
                  <button
                    key={qp.id}
                    onClick={() => {
                      setInput(prev => prev ? `${prev}\n${qp.text}` : qp.text);
                      setShowQuickPrompts(false);
                      textAreaRef.current?.focus();
                      setTimeout(() => textAreaRef.current?.dispatchEvent(new Event('input', { bubbles: true })), 0);
                    }}
                    className="block w-full text-left p-2 hover:bg-white/10 rounded-md"
                  >
                    <p className="font-medium text-white truncate">{qp.title}</p>
                    <p className="text-text-muted truncate text-xs">{qp.text}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Markdown Controls */}
        <div className="flex items-center space-x-2 mb-2">
          {['bold', 'italic', 'inline-code', 'code-block', 'list-item'].map(type => (
            <button
              key={type}
              onClick={() => applyMarkdownFormat(type as any)}
              className="p-2 glass-button rounded-md hover:bg-white/10"
              title={type}
              disabled={isSending || isApiKeyMissing}
            >
              {type === 'bold' && <BoldIcon className="h-4 w-4" />}
              {type === 'italic' && <ItalicIcon className="h-4 w-4" />}
              {type === 'inline-code' && <CodeBracketIcon className="h-4 w-4" />}
              {type === 'code-block' && <CodeBracketSquareIcon className="h-4 w-4" />}
              {type === 'list-item' && <ListBulletIcon className="h-4 w-4" />}
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className="flex items-end space-x-3">
          <textarea
            ref={textAreaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => {
              if (e.key === 'Enter' && !e.shiftKey && !isSending) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Send a message (Shift+Enter for new line)..."
            className="flex-1 p-3 glass-input rounded-lg text-sm resize-none"
            rows={1}
            style={{ minHeight: '44px', maxHeight: '120px' }}
            onInput={e => {
              const el = e.target as HTMLTextAreaElement;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            disabled={isSending || isApiKeyMissing}
          />
          <button
            onClick={() => handleSend()}
            disabled={isSending || input.trim() === '' || isApiKeyMissing}
            className="p-3 glass-button rounded-lg h-[44px] aspect-square flex items-center justify-center"
          >
            {isSending
              ? <LoadingSpinner size="sm" color="white" />
              : <SendIcon className="h-5 w-5 text-white" />}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ChatArea;
