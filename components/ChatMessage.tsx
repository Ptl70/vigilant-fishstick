
import React, { useEffect, useRef, useState } from 'react'; // Added useState
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Message } from '../types';
import SourceLinkDisplay from './SourceLinkDisplay';
import LoadingSpinner from './LoadingSpinner';
import { CopyIcon, RegenerateIcon } from './Icons';

interface ChatMessageProps {
  message: Message;
  searchTerm?: string; 
  onRegenerate?: (messageId: string) => void;
  isLastBotMessage?: boolean; // To control regenerate button visibility
}

const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const ChatMessage: React.FC<ChatMessageProps> = ({ message, searchTerm, onRegenerate, isLastBotMessage }) => {
  const isUser = message.sender === 'user';
  const contentRef = useRef<HTMLDivElement>(null);
  const [animatedText, setAnimatedText] = useState<string>('');
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isUser || message.isError) {
      setAnimatedText(message.text);
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
      return;
    }

    if (message.isLoading && !message.text) { // Pure loading state
      setAnimatedText('');
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
      return;
    }
    
    // If text already fully animated and message text hasn't changed, do nothing
    if (animatedText === message.text && !message.isLoading) {
        return;
    }

    // Start animation if new text arrives or loading starts with some initial text
    if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
    }

    let currentIndex = 0;
    // If message text starts with current animated text, continue from there
    if (message.text && message.text.startsWith(animatedText)) {
        currentIndex = animatedText.length;
    } else {
        // Otherwise, restart animation from beginning
        setAnimatedText(''); 
    }
    
    const type = () => {
      if (currentIndex < (message.text || "").length) {
        setAnimatedText(prev => (message.text || "").substring(0, currentIndex + 1));
        currentIndex++;
        animationTimeoutRef.current = setTimeout(type, 25); // Adjust typing speed here
      } else {
        // Animation finished
        if (!message.isLoading) { // Ensure final text is set if stream completes
            setAnimatedText(message.text || '');
        }
      }
    };

    if (message.text) { // Only start typing if there's text
      type();
    } else if (!message.isLoading) { // If no text and not loading (e.g. empty final response)
        setAnimatedText('');
    }


    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [message.text, message.isLoading, isUser, message.isError]);


  const getHighlightedText = (text: string, highlight?: string): string => {
    if (!highlight || highlight.trim() === '') {
      return text;
    }
    try {
      const regex = new RegExp(`(${escapeRegExp(highlight)})`, 'gi');
      return text.replace(regex, '<mark class="search-highlight">$1</mark>');
    } catch (e) {
      console.error("Error creating regex for highlighting:", e);
      return text;
    }
  };
  
  const getSanitizedHtml = (text: string) => {
    let textToProcess = text;
    // Apply highlighting to the animated text before Markdown parsing for bot messages.
    // For user messages, apply when constructing the HTML.
    if (searchTerm && searchTerm.trim() !== '' && !isUser && !message.isError) {
      textToProcess = getHighlightedText(text, searchTerm);
    }
    const rawHtml = marked.parse(textToProcess, { breaks: true, gfm: true }) as string;
    return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'], ADD_TAGS: ['mark'] });
  };
  
  // Attach copy buttons after animation is complete and message is not loading
  useEffect(() => {
    if (contentRef.current && message.sender === 'bot' && !message.isLoading && animatedText === message.text) {
      const pres = contentRef.current.querySelectorAll('pre');
      pres.forEach(pre => {
        pre.querySelector('.copy-code-button')?.remove(); // Remove existing if any

        const button = document.createElement('button');
        button.className = 'copy-code-button'; 
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 inline-block"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 0V9.375c0-.621-.504-1.125-1.125-1.125H18v-3.028c0-.987-.842-1.765-1.764-1.631l-1.412.212M12 9v9.75m-3-9.75v9.75m0-9.75H6.375m0 9.75H12m0 0H9.375" /></svg>Copy`;
        
        button.onclick = async () => {
          try {
            const codeElement = pre.querySelector('code');
            const codeToCopy = codeElement ? codeElement.innerText : pre.innerText;
            await navigator.clipboard.writeText(codeToCopy);
            button.innerText = 'Copied!';
            setTimeout(() => {
                 button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 inline-block"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 0V9.375c0-.621-.504-1.125-1.125-1.125H18v-3.028c0-.987-.842-1.765-1.764-1.631l-1.412.212M12 9v9.75m-3-9.75v9.75m0-9.75H6.375m0 9.75H12m0 0H9.375" /></svg>Copy`;
            }, 2000);
          } catch (err) {
            console.error('Failed to copy code: ', err);
            button.innerText = 'Error';
            setTimeout(() => {
                button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 inline-block"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m9.75 0V9.375c0-.621-.504-1.125-1.125-1.125H18v-3.028c0-.987-.842-1.765-1.764-1.631l-1.412.212M12 9v9.75m-3-9.75v9.75m0-9.75H6.375m0 9.75H12m0 0H9.375" /></svg>Copy`;
            }, 2000);
          }
        };
        pre.appendChild(button);
      });
    }
  }, [message.sender, message.isLoading, animatedText, message.text]);


  return (
    <div className={`flex group ${isUser ? 'justify-end' : 'justify-start'} w-full`}>
      <div
        className={`relative max-w-xl lg:max-w-2xl px-4 py-3 rounded-xl shadow-glass backdrop-blur-xl
          ${isUser
            ? 'bg-blue-900/10 text-white rounded-br-none border border-blue-500/40' 
            : `text-text-primary rounded-bl-none ${message.isError ? 'bg-red-900/15 border-red-500/40' : 'bg-gray-800/15 border-gray-500/30'}`
        }`}
      >
        {isUser ? (
          <p 
            className="whitespace-pre-wrap text-sm"
            dangerouslySetInnerHTML={ {__html: DOMPurify.sanitize(getHighlightedText(message.text, searchTerm))} }
          />
        ) : message.isLoading && !animatedText ? (
          <div className="flex items-center text-sm text-text-secondary">
            <LoadingSpinner size="sm" />
            <span className="ml-2 italic">Thinking...</span>
          </div>
        ) : (
          <div
            ref={contentRef}
            className="markdown-body prose-sm max-w-none text-sm"
            dangerouslySetInnerHTML={{
              __html: getSanitizedHtml(animatedText || (message.isLoading && message.text ? "..." : "")),
            }}
          />
        )}

        {!isUser && message.isLoading && animatedText && animatedText !== message.text && (
           <div className="flex items-center justify-start mt-2 pt-2 border-t border-white/10">
             <LoadingSpinner size="xs" />
             <span className="ml-1 italic text-xs text-text-muted">Streaming...</span>
           </div>
        )}

        {message.sources && message.sources.length > 0 && !message.isLoading && (
          <div className={`mt-3 pt-2 border-t ${isUser ? 'border-blue-300/30' : 'border-white/10'}`}>
             <h4 className={`text-xs font-semibold mb-1 ${isUser ? 'text-blue-200' : 'text-text-secondary'}`}>Sources:</h4>
            <SourceLinkDisplay sources={message.sources} isUserMessage={isUser} />
          </div>
        )}
         {message.isError && (
           <p className="mt-2 text-xs text-red-300">This message encountered an error.</p>
         )}
        {onRegenerate && isLastBotMessage && !isUser && !message.isLoading && !message.isError && (
          <button
            onClick={() => onRegenerate(message.id)}
            className="absolute -bottom-2 -right-2 p-1.5 bg-gray-700/50 hover:bg-gray-600/70 backdrop-blur-sm rounded-full text-text-secondary hover:text-text-primary transition-all opacity-0 group-hover:opacity-100"
            aria-label="Regenerate response"
            title="Regenerate response"
          >
            <RegenerateIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
