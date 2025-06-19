import React, { useState, useEffect, useCallback } from 'react';
import { ChatSession, Message, QuickPrompt } from './types';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import * as LocalStorageService from './services/localStorageService';
import { getApiKeyError } from './services/geminiService';
import { calculateNextStateAfterDeletion } from './services/chatLogicService';
import { WarningIcon, HamburgerMenuIcon, TuneIcon, PlusCircleIcon, PencilSquareIcon, XCircleIcon } 
  from './components/Icons'; 

interface SystemInstructionModalState {
  isOpen: boolean;
  sessionId: string | null;
  currentInstruction: string;
}

interface QuickPromptModalState {
  isOpen: boolean;
  editingPrompt: QuickPrompt | null; 
  formValue: { title: string; text: string };
}

const App: React.FC = () => {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(() => {
    return LocalStorageService.getActiveChatSessionId();
  });
  const [isSending, setIsSending] = useState<boolean>(false);
  const [apiKeyMissing, setApiKeyMissing] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [searchTermInActiveChat, setSearchTermInActiveChat] = useState<string>(''); 
  const [streamingSpeed] = useState<number>(5);

  const [systemInstructionModal, setSystemInstructionModal] = useState<SystemInstructionModalState>({
    isOpen: false,
    sessionId: null,
    currentInstruction: '',
  });

  const [quickPrompts, setQuickPrompts] = useState<QuickPrompt[]>([]);
  const [quickPromptModal, setQuickPromptModal] = useState<QuickPromptModalState>({
    isOpen: false,
    editingPrompt: null,
    formValue: { title: '', text: '' },
  });

  useEffect(() => {
    const keyError = getApiKeyError();
    if (keyError) {
      setApiKeyMissing(true);
      setGlobalError(keyError);
    } else {
      setApiKeyMissing(false);
    }

    const loadedSessions = LocalStorageService.getChatSessions().map(session => ({
      ...session,
      messages: session.messages.map(msg => ({ 
        ...msg, 
        isLoading: false,
        text: msg.text
      }))
    }));
    
    setChatSessions(loadedSessions);
    setQuickPrompts(LocalStorageService.getQuickPrompts());

    if (loadedSessions.length === 0 && !keyError) {
        const newSession = createNewChatSession();
        setChatSessions([newSession]); 
    }
  }, []); 

  useEffect(() => {
    LocalStorageService.saveChatSessions(chatSessions);
  }, [chatSessions]);

  useEffect(() => {
    LocalStorageService.saveQuickPrompts(quickPrompts);
  }, [quickPrompts]);
  
  useEffect(() => {
    let newActiveIdToPersist: string | null = activeChatSessionId;
    let shouldUpdateActiveIdState = false;

    if (chatSessions.length > 0) {
      const currentActiveIsValid = chatSessions.some(s => s.id === activeChatSessionId);
      if (!currentActiveIsValid) {
        newActiveIdToPersist = chatSessions[0].id;
        shouldUpdateActiveIdState = true;
      }
    } else {
      if (activeChatSessionId !== null) {
        newActiveIdToPersist = null;
        shouldUpdateActiveIdState = true;
      }
    }

    if (shouldUpdateActiveIdState) {
      setActiveChatSessionId(newActiveIdToPersist);
    }
    
    LocalStorageService.setActiveChatSessionId(newActiveIdToPersist);
  }, [chatSessions, activeChatSessionId]);

  const createNewChatSession = (): ChatSession => {
    const timestamp = Date.now();
    return {
      id: timestamp.toString(),
      title: 'New Chat',
      messages: [{
        id: (timestamp + 1).toString(),
        sender: 'bot',
        text: "Welcome! I'm your AI assistant. How can I help you today?",
        timestamp: timestamp + 1,
        isLoading: false,
      }],
      createdAt: timestamp,
      lastUpdatedAt: timestamp,
      systemInstruction: '', 
    };
  };

  const handleCreateNewChat = () => {
    if (apiKeyMissing) return;
    const newSession = createNewChatSession();
    setChatSessions(prev => [newSession, ...prev]);
    setActiveChatSessionId(newSession.id); 
    if (window.innerWidth < 768) setIsSidebarOpen(false); 
  };

  const handleSelectChat = (sessionId: string) => {
    setActiveChatSessionId(sessionId);
    if (window.innerWidth < 768) setIsSidebarOpen(false); 
  };
  
  const handleDeleteChat = (sessionIdToDelete: string) => {
    const { updatedSessions, newActiveSessionId } = calculateNextStateAfterDeletion(
      chatSessions,
      sessionIdToDelete,
      activeChatSessionId
    );
    setChatSessions(updatedSessions);
    setActiveChatSessionId(newActiveSessionId);
  };
  
  const handleDeleteCurrentChatFromArea = () => {
    if (activeChatSessionId) {
      const currentChat = chatSessions.find(s => s.id === activeChatSessionId);
      if (window.confirm(`Delete "${currentChat?.title || 'this chat'}"?`)) {
        handleDeleteChat(activeChatSessionId);
      }
    }
  };

  const handleRenameChatSession = useCallback((sessionId: string, newTitle: string) => {
    setChatSessions(prev =>
      prev.map(s => s.id === sessionId ? { 
        ...s, 
        title: newTitle.trim() || "Untitled Chat", 
        lastUpdatedAt: Date.now() 
      } : s)
    );
  }, []);

  const handleUpdateChatSession = useCallback((updatedSession: ChatSession) => {
    setChatSessions(prev =>
        prev.map(s => {
            if (s.id === updatedSession.id) {
                let finalTitle = updatedSession.title;
                if (s.title === "New Chat" && updatedSession.messages.length >= 2 && !s.systemInstruction) {
                    const firstUserMessage = updatedSession.messages.find(m => m.sender === 'user');
                    if (firstUserMessage) {
                        finalTitle = LocalStorageService.generateChatTitle([firstUserMessage]);
                    }
                }
                return { 
                  ...updatedSession, 
                  title: finalTitle, 
                  lastUpdatedAt: Date.now(),
                  messages: updatedSession.messages.map(msg => ({
                    ...msg,
                    text: msg.text
                  }))
                };
            }
            return s;
        })
    );
  }, []);

  const handleRegenerateResponse = useCallback(async (sessionToUpdate: ChatSession, messageToRegenerateId: string) => {
    if (!sessionToUpdate || isSending || apiKeyMissing) return;

    const messageIndex = sessionToUpdate.messages.findIndex(m => m.id === messageToRegenerateId);
    if (messageIndex === -1 || sessionToUpdate.messages[messageIndex].sender !== 'bot') return; 

    const updatedMessages = sessionToUpdate.messages.map(msg => 
      msg.id === messageToRegenerateId ? { ...msg, text: '', isLoading: true, isError: false, sources: [] } : msg
    );

    handleUpdateChatSession({
      ...sessionToUpdate,
      messages: updatedMessages,
      lastUpdatedAt: Date.now(),
    });
  }, [isSending, apiKeyMissing, handleUpdateChatSession]);

  const activeChat = chatSessions.find(s => s.id === activeChatSessionId) || null;

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleExportChats = () => {
    if (chatSessions.length === 0) {
      alert("No chats to export.");
      return;
    }
    const fileName = `chat_backup_${new Date().toISOString().slice(0,10)}.json`;
    const jsonString = JSON.stringify(chatSessions, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    setGlobalError("Chats exported!");
    setTimeout(() => setGlobalError(null), 3000);
  };

  const handleImportChats = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const importedSessions = JSON.parse(text) as ChatSession[];
        if (!Array.isArray(importedSessions) || !importedSessions.every(s => s.id && s.title && Array.isArray(s.messages))) {
          throw new Error("Invalid file format.");
        }
        
        if (window.confirm("Importing will replace all current chats. Continue?")) {
          const processedSessions = importedSessions.map(session => ({
            ...session,
            messages: session.messages.map(msg => ({ ...msg, isLoading: false }))
          }));
          
          setChatSessions(processedSessions);
          setActiveChatSessionId(processedSessions.length > 0 ? processedSessions[0].id : null);
          setGlobalError("Chats imported!");
        }
      } catch (error: any) {
        setGlobalError(`Import failed: ${error.message || 'Invalid file'}`);
      } finally {
        event.target.value = ''; 
        setTimeout(() => setGlobalError(null), 5000);
      }
    };
    reader.readAsText(file);
  };
  
  const handleOpenSystemInstructionModal = (sessionId: string) => {
    const session = chatSessions.find(s => s.id === sessionId);
    if (session) {
      setSystemInstructionModal({
        isOpen: true,
        sessionId: sessionId,
        currentInstruction: session.systemInstruction || '',
      });
    }
  };

  const handleSaveSystemInstruction = () => {
    if (systemInstructionModal.sessionId) {
      setChatSessions(prevSessions =>
        prevSessions.map(s =>
          s.id === systemInstructionModal.sessionId
            ? { ...s, systemInstruction: systemInstructionModal.currentInstruction, lastUpdatedAt: Date.now() }
            : s
        )
      );
    }
    setSystemInstructionModal({ isOpen: false, sessionId: null, currentInstruction: '' });
  };

  const openQuickPromptModal = (promptToEdit: QuickPrompt | null = null) => {
    if (promptToEdit) {
      setQuickPromptModal({
        isOpen: true,
        editingPrompt: promptToEdit,
        formValue: { title: promptToEdit.title, text: promptToEdit.text },
      });
    } else {
      setQuickPromptModal({
        isOpen: true,
        editingPrompt: null,
        formValue: { title: '', text: '' },
      });
    }
  };

  const closeQuickPromptModal = () => {
    setQuickPromptModal({ isOpen: false, editingPrompt: null, formValue: { title: '', text: '' } });
  };

  const handleQuickPromptFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setQuickPromptModal(prev => ({
      ...prev,
      formValue: { ...prev.formValue, [name]: value },
    }));
  };

  const handleSaveQuickPrompt = () => {
    if (!quickPromptModal.formValue.title.trim() || !quickPromptModal.formValue.text.trim()) {
      alert("Title and prompt text are required.");
      return;
    }

    if (quickPromptModal.editingPrompt) { 
      setQuickPrompts(prev =>
        prev.map(p =>
          p.id === quickPromptModal.editingPrompt?.id ? { ...quickPromptModal.editingPrompt, ...quickPromptModal.formValue } : p
        )
      );
    } else { 
      const newPrompt: QuickPrompt = {
        id: Date.now().toString(),
        ...quickPromptModal.formValue,
      };
      setQuickPrompts(prev => [newPrompt, ...prev]);
    }
    closeQuickPromptModal();
  };

  const handleDeleteQuickPrompt = (promptId: string) => {
    if (window.confirm("Delete this quick prompt?")) {
      setQuickPrompts(prev => prev.filter(p => p.id !== promptId));
    }
  };

  return (
    <div className="flex h-screen w-screen antialiased text-text-primary p-2 sm:p-4 gap-2 sm:gap-4 relative">
      <button 
        onClick={toggleSidebar}
        className="md:hidden fixed top-3 left-3 z-40 p-2 glass-button rounded-md"
        aria-label="Open sidebar"
      >
        <HamburgerMenuIcon className="h-6 w-6 text-white" />
      </button>

      <Sidebar
        chatSessions={chatSessions}
        activeChatSessionId={activeChatSessionId}
        onSelectChat={handleSelectChat}
        onCreateNewChat={handleCreateNewChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChatSession}
        isApiKeyMissing={apiKeyMissing}
        isOpen={isSidebarOpen}
        onClose={toggleSidebar}
        onExportChats={handleExportChats}
        onImportChats={handleImportChats}
        onTuneChat={handleOpenSystemInstructionModal}
        onManageQuickPrompts={() => openQuickPromptModal(null)}
      />
      
      {isSidebarOpen && window.innerWidth < 768 && (
        <div 
          onClick={toggleSidebar} 
          className="md:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-20"
          aria-hidden="true"
        ></div>
      )}

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
        onDeleteCurrentChat={handleDeleteCurrentChatFromArea}
        streamingSpeed={streamingSpeed}
      />

      {systemInstructionModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass-panel p-6 rounded-lg shadow-xl w-full max-w-lg text-text-primary">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Custom Instructions</h3>
              <button onClick={() => setSystemInstructionModal({ isOpen: false, sessionId: null, currentInstruction: '' })} className="p-1 text-text-muted hover:text-text-primary">&times;</button>
            </div>
            <p className="text-sm text-text-secondary mb-3">Set instructions for this chat:</p>
            <textarea
              value={systemInstructionModal.currentInstruction}
              onChange={(e) => setSystemInstructionModal(prev => ({ ...prev, currentInstruction: e.target.value }))}
              rows={8}
              className="w-full p-2.5 glass-input rounded-md text-sm mb-4 focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
              placeholder="Example: Respond as a Python expert..."
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setSystemInstructionModal({ isOpen: false, sessionId: null, currentInstruction: '' })}
                className="px-4 py-2 text-sm glass-button rounded-md hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSystemInstruction}
                className="px-4 py-2 text-sm bg-blue-500/80 hover:bg-blue-500/100 text-white rounded-md glass-button"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {quickPromptModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="glass-panel p-6 rounded-lg shadow-xl w-full max-w-xl text-text-primary">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                {quickPromptModal.editingPrompt ? 'Edit Prompt' : 'Add New Prompt'}
              </h3>
              <button onClick={closeQuickPromptModal} className="p-1 text-text-muted hover:text-text-primary">&times;</button>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-text-secondary mb-1">Title</label>
              <input
                type="text"
                name="title"
                value={quickPromptModal.formValue.title}
                onChange={handleQuickPromptFormChange}
                className="w-full p-2.5 glass-input rounded-md text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
                placeholder="Prompt title..."
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-text-secondary mb-1">Content</label>
              <textarea
                name="text"
                value={quickPromptModal.formValue.text}
                onChange={handleQuickPromptFormChange}
                rows={5}
                className="w-full p-2.5 glass-input rounded-md text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none"
                placeholder="Enter prompt content..."
              />
            </div>
            <div className="flex justify-between items-center">
              <div> 
                {quickPromptModal.editingPrompt && (
                  <button
                    onClick={() => openQuickPromptModal(null)} 
                    className="flex items-center text-xs text-blue-400 hover:text-blue-300 glass-button p-2 rounded-md"
                  >
                    <PlusCircleIcon className="h-4 w-4 mr-1.5" /> Add New
                  </button>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={closeQuickPromptModal}
                  className="px-4 py-2 text-sm glass-button rounded-md hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveQuickPrompt}
                  className="px-4 py-2 text-sm bg-blue-500/80 hover:bg-blue-500/100 text-white rounded-md glass-button"
                >
                  {quickPromptModal.editingPrompt ? 'Save' : 'Add'}
                </button>
              </div>
            </div>

            {!quickPromptModal.editingPrompt && quickPrompts.length > 0 && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <h4 className="text-md font-semibold text-white mb-2">Existing Prompts</h4>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                  {quickPrompts.map(qp => (
                    <div key={qp.id} className="flex items-center justify-between p-2.5 glass-input rounded-md text-sm hover:bg-white/5">
                      <div className="flex-1 overflow-hidden">
                        <p className="font-medium text-text-primary truncate">{qp.title}</p>
                        <p className="text-xs text-text-muted truncate">{qp.text}</p>
                      </div>
                      <div className="flex-shrink-0 flex items-center space-x-2 ml-2">
                        <button onClick={() => openQuickPromptModal(qp)} className="p-1 text-text-muted hover:text-blue-400">
                          <PencilSquareIcon className="h-4 w-4"/>
                        </button>
                        <button onClick={() => handleDeleteQuickPrompt(qp.id)} className="p-1 text-text-muted hover:text-red-400">
                          <XCircleIcon className="h-4 w-4"/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {apiKeyMissing && !activeChat && (
         <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="glass-panel p-8 rounded-lg shadow-xl text-center max-w-md">
              <WarningIcon className="h-16 w-16 text-red-400 mx-auto mb-6" />
              <h2 className="text-2xl font-semibold text-white mb-3">Configuration Required</h2>
              <p className="text-text-secondary mb-4">{globalError || 'Missing API key configuration'}</p>
              <p className="text-sm text-text-muted">Set the API_KEY environment variable to continue</p>
            </div>
         </div>
       )}
       
      {globalError && (apiKeyMissing ? !activeChat : true) && ( 
        <div className="fixed bottom-5 right-5 glass-panel p-3 text-sm text-white rounded-md shadow-lg z-50">
          {globalError}
        </div>
      )}
    </div>
  );
};

export default App;
