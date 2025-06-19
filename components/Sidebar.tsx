
import React, { useState, useEffect, useRef } from 'react';
import { ChatSession } from '../types';
import { PlusIcon, TrashIcon, ChatBubbleSvgIcon, EditIcon, CloseIcon, DownloadIcon, UploadIcon, TuneIcon, PencilSquareIcon } from './Icons';

interface SidebarProps {
  chatSessions: ChatSession[];
  activeChatSessionId: string | null;
  onSelectChat: (sessionId: string) => void;
  onCreateNewChat: () => void;
  onDeleteChat: (sessionId: string) => void;
  onRenameChat: (sessionId: string, newTitle: string) => void;
  isApiKeyMissing: boolean;
  isOpen: boolean; 
  onClose: () => void;
  onExportChats: () => void;
  onImportChats: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTuneChat: (sessionId: string) => void; 
  onManageQuickPrompts: () => void; // To open modal in App.tsx
}

const Sidebar: React.FC<SidebarProps> = ({
  chatSessions,
  activeChatSessionId,
  onSelectChat,
  onCreateNewChat,
  onDeleteChat,
  onRenameChat,
  isApiKeyMissing,
  isOpen,
  onClose,
  onExportChats,
  onImportChats,
  onTuneChat,
  onManageQuickPrompts
}) => {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSessionId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingSessionId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (window.innerWidth < 768 && isOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        const hamburgerButton = document.querySelector('[aria-label="Open sidebar"]');
        if (hamburgerButton && hamburgerButton.contains(event.target as Node)) {
          return;
        }
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);


  const handleStartEdit = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const handleRenameSubmit = () => {
    if (editingSessionId && editingTitle.trim() !== '') {
      onRenameChat(editingSessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleRenameSubmit();
    } else if (event.key === 'Escape') {
      setEditingSessionId(null);
    }
  };

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  return (
    <div
      ref={sidebarRef}
      className={`
        glass-panel flex flex-col h-full text-text-primary
        fixed inset-y-0 left-0 z-30 w-72 transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:flex-shrink-0 md:h-full md:inset-y-auto md:left-auto md:w-72
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
      `}
    >
      <div className="p-4 border-b border-glass-stroke flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Patel Chat</h1>
        <button 
          onClick={onClose} 
          className="md:hidden p-1 text-text-muted hover:text-text-primary glass-button rounded"
          aria-label="Close sidebar"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
      <button
        onClick={onCreateNewChat}
        disabled={isApiKeyMissing}
        className="flex items-center justify-center m-3 sm:m-4 p-3 glass-button rounded-lg text-sm font-medium"
        aria-label="Create new chat"
      >
        <PlusIcon className="h-5 w-5 mr-2" />
        New Chat
      </button>
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {chatSessions.length === 0 && !isApiKeyMissing && (
          <p className="px-3 py-2 text-sm text-text-muted">No chats yet. Create one!</p>
        )}
        {chatSessions.map((session) => (
          <div
            key={session.id}
            onClick={() => editingSessionId !== session.id && onSelectChat(session.id)}
            className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 ease-in-out
              ${activeChatSessionId === session.id ? 'bg-white/15 shadow-md' : 'hover:bg-white/5'}
              ${editingSessionId === session.id ? 'bg-white/20' : ''}
            `}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => editingSessionId !== session.id && e.key === 'Enter' && onSelectChat(session.id)}
            aria-current={activeChatSessionId === session.id ? "page" : undefined}
          >
            <div className="flex items-center overflow-hidden flex-1 min-w-0">
              <ChatBubbleSvgIcon className="h-5 w-5 mr-2 sm:mr-3 flex-shrink-0 text-text-secondary group-hover:text-text-primary transition-colors"/>
              {editingSessionId === session.id ? (
                <input
                  ref={renameInputRef}
                  type="text"
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={handleRenameKeyDown}
                  className="text-sm font-medium bg-transparent border-b border-blue-400 text-text-primary focus:outline-none w-full"
                />
              ) : (
                <span className="truncate text-sm font-medium text-text-primary" title={session.title}>
                  {session.title}
                </span>
              )}
            </div>
            {editingSessionId !== session.id && (
              <div className="flex items-center ml-1 sm:ml-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onTuneChat(session.id); }}
                  className="p-1 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                  aria-label={`Tune chat "${session.title}"`}
                  title="Custom Instructions"
                >
                  <TuneIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleStartEdit(session); }}
                  className="p-1 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 ml-0.5 sm:ml-1"
                  aria-label={`Rename chat "${session.title}"`}
                  title="Rename Chat"
                >
                  <EditIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Are you sure you want to delete "${session.title}"? This action cannot be undone.`)) {
                      onDeleteChat(session.id);
                    }
                  }}
                  className="p-1 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 ml-0.5 sm:ml-1"
                  aria-label={`Delete chat "${session.title}"`}
                  title="Delete Chat"
                >
                  <TrashIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </nav>
      
      <div className="p-3 border-t border-glass-stroke space-y-2">
        <button
            onClick={onManageQuickPrompts}
            className="w-full flex items-center justify-center p-2.5 glass-button rounded-lg text-xs font-medium"
            aria-label="Manage quick prompts"
            disabled={isApiKeyMissing}
        >
            <PencilSquareIcon className="h-4 w-4 mr-2"/> Manage Quick Prompts
        </button>
        <button
            onClick={handleImportClick}
            className="w-full flex items-center justify-center p-2.5 glass-button rounded-lg text-xs font-medium"
            aria-label="Import chats"
            disabled={isApiKeyMissing}
        >
            <UploadIcon className="h-4 w-4 mr-2"/> Import Chats
        </button>
        <input type="file" ref={importFileRef} onChange={onImportChats} accept=".json" style={{display: 'none'}} />
        <button
            onClick={onExportChats}
            className="w-full flex items-center justify-center p-2.5 glass-button rounded-lg text-xs font-medium"
            aria-label="Export all chats"
            disabled={isApiKeyMissing || chatSessions.length === 0}
        >
            <DownloadIcon className="h-4 w-4 mr-2"/> Export All Chats
        </button>
      </div>

      <div className="p-2 sm:p-3 border-t border-glass-stroke text-center text-xs text-text-muted">
         Patel Chat by Yahya
      </div>
    </div>
  );
};

export default Sidebar;
