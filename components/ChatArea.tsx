import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Message, ChatSession, WebSource, GenerateContentResponse, GroundingChunk, QuickPrompt } from '../types';
import ChatMessage from './ChatMessage';
import LoadingSpinner from './LoadingSpinner';
import {
  SendIcon, WarningIcon, ChatBubbleSvgIcon, SearchIcon, RegenerateIcon, TrashIcon,
  BoltIcon, BoldIcon, ItalicIcon, CodeBracketIcon, CodeBracketSquareIcon, ListBulletIcon
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
  const [input, setInput] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSearchTerm, setCurrentSearchTerm] = useState<string>(initialSearchTerm);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [showQuickPrompts, setShowQuickPrompts] = useState(false);

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
    if(textAreaRef.current) {
      textAreaRef.current.style.height = 'auto';
    }
  }, [activeChatSession?.id, initialSearchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTerm = e.target.value;
    setCurrentSearchTerm(newTerm);
    if (onSearchTermChange) {
      onSearchTermChange(newTerm);
    }
  };

  const extractWebSources = (groundingChunks?: GroundingChunk[]): WebSource[] => {
    if (!groundingChunks) return [];
    const sources: WebSource[] = [];
    groundingChunks.forEach(chunk => {
      if (chunk.web && chunk.web.uri) {
        sources.push({ uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri });
      }
    });
    return sources;
  };

  const filteredMessages = useMemo(() => {
    if (!activeChatSession) return [];
    if (!currentSearchTerm.trim()) return activeChatSession.messages;
    return activeChatSession.messages.filter(msg =>
      msg.text.toLowerCase().includes(currentSearchTerm.toLowerCase())
    );
  }, [activeChatSession, currentSearchTerm]);

  const getLoadingMessageText = (): string => {
    if (Math.random() < 0.3) return 'Searching...';
    if (Math.random() < 0.6) return 'Working...';
    return 'Thinking...';
  };

  const handleSend = async (messageTextOverride?: string, isRegeneration?: boolean, historyOverride?: Message[]) => {
    const textToSend = messageTextOverride || input.trim();
    if (textToSend === '' || isSending || !activeChatSession || isApiKeyMissing) return;

    const currentSessionStateBeforeSend = activeChatSession;  
    let messagesForThisSendOperation: Message[];  
    let botMessageId: string;  
    const currentSystemInstruction = currentSessionStateBeforeSend.systemInstruction;  

    if (isRegeneration) {  
      const regenTargetIndex = currentSessionStateBeforeSend.messages.findIndex(m => m.isLoading && m.sender === 'bot');  
      if (regenTargetIndex === -1) return;  
      botMessageId = currentSessionStateBeforeSend.messages[regenTargetIndex].id;  
      messagesForThisSendOperation = [...currentSessionStateBeforeSend.messages];  
    } else {  
      const userMessage: Message = {  
        id: Date.now().toString(),  
        sender: 'user',  
        text: textToSend,  
        timestamp: Date.now(),  
      };  
      botMessageId = (Date.now() + 1).toString();  
      const botPlaceholderMessage: Message = {  
        id: botMessageId,  
        sender: 'bot',  
        text: getLoadingMessageText(),
        isLoading: true,  
        timestamp: Date.now() + 1,  
      };  
      messagesForThisSendOperation = [...currentSessionStateBeforeSend.messages, userMessage, botPlaceholderMessage];  
      onUpdateChatSession({  
        ...currentSessionStateBeforeSend,  
        messages: messagesForThisSendOperation,  
        lastUpdatedAt: Date.now(),  
      });  
    }  

    if (!isRegeneration) {  
      setInput('');  
      if(textAreaRef.current) textAreaRef.current.style.height = 'auto';  
    }  
    setIsSending(true);  
    setError(null);  

    try {  
      const historyForGemini = historyOverride ||   
        (isRegeneration   
          ? currentSessionStateBeforeSend.messages.slice(0, currentSessionStateBeforeSend.messages.findIndex(m => m.id === botMessageId))  
          : messagesForThisSendOperation.filter(m => m.id !== botMessageId && m.sender !== 'bot' || (m.sender === 'bot' && !m.isLoading)));  

      const response = await sendMessageToGemini(textToSend, historyForGemini, currentSystemInstruction);  
      const aggregatedResponse = await response.response;  

      let finalBotText = '';
      let sources: WebSource[] = [];

      if (aggregatedResponse) {  
        if (typeof aggregatedResponse.text === 'string' && aggregatedResponse.text.trim().length > 0) {  
          finalBotText = aggregatedResponse.text;  
        }  
        sources = extractWebSources(aggregatedResponse.candidates?.[0]?.groundingMetadata?.groundingChunks);  
      }  

      messagesForThisSendOperation = messagesForThisSendOperation.map(msg =>  
        msg.id === botMessageId 
          ? { ...msg, text: finalBotText, isLoading: false, sources, isError: false } 
          : msg  
      );  
      onUpdateChatSession({ ...currentSessionStateBeforeSend, messages: messagesForThisSendOperation, lastUpdatedAt: Date.now() });  

    } catch (err: any) {  
      console.error("Error sending message:", err);  
      const errorMessage = err.message || "An unknown error occurred.";  
      setError(errorMessage);  
      messagesForThisSendOperation = messagesForThisSendOperation.map(msg =>  
        msg.id === botMessageId ? { ...msg, text: `Error: ${errorMessage}`, isLoading: false, isError: true } : msg  
      );  
      onUpdateChatSession({ ...currentSessionStateBeforeSend, messages: messagesForThisSendOperation, lastUpdatedAt: Date.now() });  
    } finally {  
      setIsSending(false);  
    }
  };

  const initiateRegeneration = async (messageId: string) => {
    if (!activeChatSession || isSending) return;
    const botMessageToRegenerate = activeChatSession.messages.find(m => m.id === messageId && m.sender === 'bot');
    if (!botMessageToRegenerate) return;
    const botMessageIndex = activeChatSession.messages.findIndex(m => m.id === messageId);
    if (botMessageIndex < 1) return;
    const userPromptMessage = activeChatSession.messages[botMessageIndex - 1];
    if (userPromptMessage.sender !== 'user') return;

    const updatedMessagesForRegenUI = activeChatSession.messages.map(msg =>   
        msg.id === messageId ? { ...msg, text: getLoadingMessageText(), isLoading: true, isError: false, sources: [] } : msg  
    );  
    onUpdateChatSession({ ...activeChatSession, messages: updatedMessagesForRegenUI, lastUpdatedAt: Date.now() });  
    const historyForRegen = activeChatSession.messages.slice(0, botMessageIndex - 1);  
    await handleSend(userPromptMessage.text, true, historyForRegen);
  };

  const applyMarkdownFormat = (formatType: 'bold' | 'italic' | 'inline-code' | 'code-block' | 'list-item') => {
    if (!textAreaRef.current) return;
    const textarea = textAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let newText = '';

    switch (formatType) {  
      case 'bold':  
        newText = `**${selectedText}**`;  
        break;  
      case 'italic':  
        newText = `*${selectedText}*`;  
        break;  
      case 'inline-code':  
        newText = `\`${selectedText}\``;  
        break;  
      case 'code-block':  
        newText = `\`\`\`\n${selectedText}\n\`\`\``;  
        break;  
      case 'list-item':  
        if (selectedText.includes('\n')) {  
          newText = selectedText.split('\n').map(line => `- ${line}`).join('\n');  
        } else {  
          newText = `- ${selectedText}`;  
        }  
        break;  
      default:  
        return;  
    }  

    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    setInput(before + newText + after);

    setTimeout(() => {  
      textarea.focus();
      const newCursorPosition = start + newText.length;
      textarea.setSelectionRange(newCursorPosition, newCursorPosition);
      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);
    }, 0);
  };

  if (isApiKeyMissing && !activeChatSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center glass-panel m-2 sm:m-4">
        <WarningIcon className="h-16 w-16 text-red-400 mb-6" />
        <h2 className="text-xl sm:text-2xl font-semibold text-white mb-3">API Key Error</h2>
        <p className="text-text-secondary text-sm sm:text-base">
          The Gemini API key is missing or invalid. Please set the <code>API_KEY</code> environment variable.
        </p>
      </div>
    );
  }

  if (!activeChatSession) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center glass-panel m-2 sm:m-4">
        <ChatBubbleSvgIcon className="h-16 w-16 text-text-muted mb-6" />
        <h2 className="text-xl sm:text-2xl font-semibold text-white mb-3">No Chat Selected</h2>
        <p className="text-text-secondary text-sm sm:text-base">Select or create a chat from the sidebar to begin.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col glass-panel min-w-0">
      <header className="p-3 sm:p-4 border-b border-glass-stroke flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4">
        <h2 className="text-md sm:text-lg font-semibold text-white truncate order-1 sm:order-none flex-1 min-w-0" title={activeChatSession.title}>
          {activeChatSession.title}
        </h2>
        <div className="relative w-full sm:w-auto sm:max-w-xs md:max-w-sm order-none sm:order-1 flex-shrink">
          <input  
            type="text"  
            placeholder="Search in chat..."  
            value={currentSearchTerm}  
            onChange={handleSearchChange}  
            className="w-full pl-10 pr-3 py-2 text-xs sm:text-sm glass-input rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none transition-shadow"  
          />
          <SearchIcon className="h-4 w-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
        <button  
          onClick={onDeleteCurrentChat}  
          className="p-2 glass-button rounded-lg text-text-muted hover:text-red-400 order-2 sm:order-2"  
          title="Delete Current Chat"  
          aria-label="Delete Current Chat"  
          disabled={!activeChatSession}  
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      </header>
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        {filteredMessages.map((msg, index, arr) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            searchTerm={currentSearchTerm}
            onRegenerate={initiateRegeneration}
            isLastBotMessage={index === arr.length - 1 && msg.sender === 'bot'}
          />
        ))}
        <div ref={messagesEndRef} />
      </main>
      <footer className="p-2 sm:p-3 md:p-4 border-t border-glass-stroke">
        {error && (
          <div className="mb-2 p-3 bg-red-500/30 text-red-100 border border-red-500/50 rounded-lg text-xs sm:text-sm">
            {error}
          </div>
        )}
        
        {quickPrompts.length > 0 && (
          <div className="mb-2 relative">
            <button
              onClick={() => setShowQuickPrompts(!showQuickPrompts)}
              className="flex items-center w-full sm:w-auto text-left p-2 glass-button rounded-md text-xs hover:bg-white/10"
              title="Use a Quick Prompt"
            >
              <BoltIcon className="h-4 w-4 mr-2 text-yellow-400" />
              Quick Prompts
              <svg className={`w-3 h-3 ml-auto transition-transform ${showQuickPrompts ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            {showQuickPrompts && (
              <div className="absolute bottom-full left-0 mb-1 w-full sm:w-72 max-h-48 overflow-y-auto glass-panel p-2 rounded-md shadow-lg z-10 border border-glass-stroke">
                {quickPrompts.map(qp => (
                  <button
                    key={qp.id}
                    onClick={() => {
                      setInput(prev => prev ? `${prev}\n${qp.text}` : qp.text);
                      setShowQuickPrompts(false);
                      textAreaRef.current?.focus();
                      setTimeout(() => {
                        if(textAreaRef.current) {
                          const event = new Event('input', { bubbles: true });
                          textAreaRef.current.dispatchEvent(event);
                        }
                      },0);
                    }}
                    className="block w-full text-left p-2.5 hover:bg-white/10 rounded-md text-xs"
                    title={qp.text}
                  >
                    <p className="font-medium text-text-primary truncate">{qp.title}</p>
                    <p className="text-text-muted truncate text-xs">{qp.text}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center space-x-1 mb-2">
          {['bold', 'italic', 'inline-code', 'code-block', 'list-item'].map(type => (
            <button
              key={type}
              onClick={() => applyMarkdownFormat(type as any)}
              className="p-2 glass-button rounded-md hover:bg-white/10"
              title={type.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
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

        <div className="flex items-end space-x-2 md:space-x-3">  
          <textarea  
            ref={textAreaRef}  
            value={input}  
            onChange={(e) => setInput(e.target.value)}  
            onKeyPress={(e) => {  
              if (e.key === 'Enter' && !e.shiftKey && !isSending) {  
                e.preventDefault();  
                handleSend();  
              }  
            }}  
            placeholder="Send a message (Shift+Enter for new line)..."  
            className="flex-1 p-3 glass-input rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none transition-shadow disabled:opacity-70 resize-none text-sm"  
            rows={1}  
            style={{ minHeight: '44px', maxHeight: '120px' }}   
            onInput={(e) => {  
                const target = e.target as HTMLTextAreaElement;  
                target.style.height = 'auto';  
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;  
            }}  
            disabled={isSending || isApiKeyMissing}  
            aria-label="Chat input"  
          />  
          <button  
            onClick={() => handleSend()}  
            disabled={isSending || input.trim() === '' || isApiKeyMissing}  
            className="p-3 glass-button rounded-lg font-semibold h-[44px] aspect-square flex items-center justify-center self-end"  
            aria-label="Send message"  
          >  
            {isSending ? <LoadingSpinner size="sm" color="white" /> : <SendIcon className="h-5 w-5 text-white" />}  
          </button>  
        </div>  
      </footer>  
    </div>
  );
};

export default ChatArea;
