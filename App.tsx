import React, { useState, useEffect, useCallback } from 'react'; import { ChatSession, Message, QuickPrompt } from './types'; import Sidebar from './components/Sidebar'; import ChatArea from './components/ChatArea'; import * as LocalStorageService from './services/localStorageService'; import { getApiKeyError } from './services/geminiService'; import { calculateNextStateAfterDeletion } from './services/chatLogicService'; import { WarningIcon, HamburgerMenuIcon, TuneIcon, PlusCircleIcon, PencilSquareIcon, XCircleIcon } from './components/Icons';

// Interfaces interface SystemInstructionModalState { isOpen: boolean; sessionId: string | null; currentInstruction: string; }

interface QuickPromptModalState { isOpen: boolean; editingPrompt: QuickPrompt | null; formValue: { title: string; text: string }; }

const App: React.FC = () => { const [chatSessions, setChatSessions] = useState<ChatSession[]>([]); const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(() => LocalStorageService.getActiveChatSessionId()); const [isSending, setIsSending] = useState(false); const [apiKeyMissing, setApiKeyMissing] = useState(false); const [globalError, setGlobalError] = useState<string | null>(null); const [isSidebarOpen, setIsSidebarOpen] = useState(false); const [searchTermInActiveChat, setSearchTermInActiveChat] = useState('');

const [systemInstructionModal, setSystemInstructionModal] = useState<SystemInstructionModalState>({ isOpen: false, sessionId: null, currentInstruction: '' }); const [quickPrompts, setQuickPrompts] = useState<QuickPrompt[]>([]); const [quickPromptModal, setQuickPromptModal] = useState<QuickPromptModalState>({ isOpen: false, editingPrompt: null, formValue: { title: '', text: '' } });

// Initial setup useEffect(() => { const keyError = getApiKeyError(); setApiKeyMissing(!!keyError); setGlobalError(keyError);

const loadedSessions = LocalStorageService.getChatSessions();
setChatSessions(loadedSessions);
setQuickPrompts(LocalStorageService.getQuickPrompts());

if (loadedSessions.length === 0 && !keyError) {
  const newSession = createNewChatSession();
  setChatSessions([newSession]);
	}

useEffect(() => { LocalStorageService.saveChatSessions(chatSessions); }, [chatSessions]);

useEffect(() => { LocalStorageService.saveQuickPrompts(quickPrompts); }, [quickPrompts]);

useEffect(() => { let newActiveId = activeChatSessionId; let shouldUpdate = false;

if (chatSessions.length > 0) {
  const isValid = chatSessions.some(s => s.id === activeChatSessionId);
  if (!isValid) {
    newActiveId = chatSessions[0].id;
    shouldUpdate = true;
  }
} else if (activeChatSessionId !== null) {
  newActiveId = null;
  shouldUpdate = true;
}

if (shouldUpdate) setActiveChatSessionId(newActiveId);
LocalStorageService.setActiveChatSessionId(newActiveId);

}, [chatSessions, activeChatSessionId]);

const createNewChatSession = (): ChatSession => { const timestamp = Date.now(); return { id: timestamp.toString(), title: 'New Chat', messages: [{ id: (timestamp + 1).toString(), sender: 'bot', text: "Welcome to Patel Chat! I'm your AI assistant. How can I assist you today?", timestamp: timestamp + 1, isLoading: false, }], createdAt: timestamp, lastUpdatedAt: timestamp, systemInstruction: '', }; };

const handleCreateNewChat = () => { if (apiKeyMissing) return; const newSession = createNewChatSession(); setChatSessions(prev => [newSession, ...prev]); setActiveChatSessionId(newSession.id); if (window.innerWidth < 768) setIsSidebarOpen(false); };

const handleSelectChat = (id: string) => { setActiveChatSessionId(id); if (window.innerWidth < 768) setIsSidebarOpen(false); };

const handleDeleteChat = (id: string) => { const { updatedSessions, newActiveSessionId } = calculateNextStateAfterDeletion(chatSessions, id, activeChatSessionId); setChatSessions(updatedSessions); setActiveChatSessionId(newActiveSessionId); };

const handleRenameChatSession = useCallback((id: string, title: string) => { setChatSessions(prev => prev.map(s => s.id === id ? { ...s, title: title.trim() || 'Untitled Chat', lastUpdatedAt: Date.now() } : s)); }, []);

const handleUpdateChatSession = useCallback((session: ChatSession) => { setChatSessions(prev => prev.map(s => { if (s.id === session.id) { let newTitle = session.title; if (s.title === 'New Chat' && session.messages.length >= 2 && !s.systemInstruction) { const firstUserMessage = session.messages.find(m => m.sender === 'user'); if (firstUserMessage) { newTitle = LocalStorageService.generateChatTitle([firstUserMessage]); } } return { ...session, title: newTitle, lastUpdatedAt: Date.now() }; } return s; })); }, []);

const handleRegenerateResponse = useCallback((session: ChatSession, messageId: string) => { if (!session || isSending || apiKeyMissing) return; const index = session.messages.findIndex(m => m.id === messageId); if (index === -1 || session.messages[index].sender !== 'bot') return;

const updatedMessages = session.messages.map(m =>
  m.id === messageId ? { ...m, text: '', isLoading: true, isError: false, sources: [] } : m
);
handleUpdateChatSession({ ...session, messages: updatedMessages, lastUpdatedAt: Date.now() });

}, [isSending, apiKeyMissing, handleUpdateChatSession]);

const handleExportChats = () => { if (chatSessions.length === 0) return alert("No chats to export."); const blob = new Blob([JSON.stringify(chatSessions, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = patel_chat_backup_${new Date().toISOString().slice(0, 10)}.json; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); setGlobalError("Chats exported successfully!"); setTimeout(() => setGlobalError(null), 3000); };

const handleImportChats = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return;

const reader = new FileReader();
reader.onload = (ev) => {
  try {
    const data = JSON.parse(ev.target?.result as string);
    if (!Array.isArray(data)) throw new Error("Invalid format");
    if (window.confirm("This will replace your existing chats. Continue?")) {
      setChatSessions(data);
      setActiveChatSessionId(data.length > 0 ? data[0].id : null);
      setGlobalError("Chats imported successfully!");
    }
  } catch (err: any) {
    setGlobalError(`Import failed: ${err.message || 'Invalid file.'}`);
  } finally {
    e.target.value = '';
    setTimeout(() => setGlobalError(null), 5000);
  }
};
reader.readAsText(file);

};

const activeChat = chatSessions.find(s => s.id === activeChatSessionId) || null;

return ( <div className="flex flex-col md:flex-row w-full h-screen overflow-hidden text-text-primary"> <Sidebar chatSessions={chatSessions} activeChatSessionId={activeChatSessionId} onSelectChat={handleSelectChat} onCreateNewChat={handleCreateNewChat} onDeleteChat={handleDeleteChat} onRenameChat={handleRenameChatSession} isApiKeyMissing={apiKeyMissing} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} onExportChats={handleExportChats} onImportChats={handleImportChats} onTuneChat={(id) => setSystemInstructionModal({ isOpen: true, sessionId: id, currentInstruction: '' })} onManageQuickPrompts={() => setQuickPromptModal({ isOpen: true, editingPrompt: null, formValue: { title: '', text: '' } })} />

<div className="flex-1 h-full overflow-y-auto">
    <ChatArea
      key={activeChatSessionId}
      activeChatSession={activeChat}
      onUpdateChatSession={handleUpdateChatSession}
      isSending={isSending}
      setIsSending={setIsSending}
      isApiKeyMissing={apiKeyMissing}
      onRegenerate={handleRegenerateResponse}
      initialSearchTerm={searchTermInActiveChat}
      onSearchTermChange={setSearchTermInActiveChat}
      quickPrompts={quickPrompts}
      onDeleteCurrentChat={() => activeChatSessionId && handleDeleteChat(activeChatSessionId)}
    />
  </div>

  {globalError && (
    <div className="fixed bottom-5 right-5 p-3 bg-black/70 text-white text-sm rounded-lg shadow-lg z-50">
      {globalError}
    </div>
  )}

  {apiKeyMissing && !activeChat && (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="p-6 bg-white/10 rounded-lg shadow-xl text-center max-w-md">
        <WarningIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Missing API Key</h2>
        <p className="text-sm text-white/70">{globalError || getApiKeyError()}</p>
      </div>
    </div>
  )}
</div>

); };

export default App;

