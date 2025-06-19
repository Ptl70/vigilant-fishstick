
import { ChatSession, Message, QuickPrompt } from '../types';

const CHAT_SESSIONS_KEY = 'geminiChatSessions';
const ACTIVE_CHAT_ID_KEY = 'geminiActiveChatId';
const QUICK_PROMPTS_KEY = 'geminiQuickPrompts';

export const getChatSessions = (): ChatSession[] => {
  try {
    const sessionsJson = localStorage.getItem(CHAT_SESSIONS_KEY);
    return sessionsJson ? JSON.parse(sessionsJson) : [];
  } catch (error) {
    console.error("Error loading chat sessions from localStorage:", error);
    return [];
  }
};

export const saveChatSessions = (sessions: ChatSession[]): void => {
  try {
    localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error("Error saving chat sessions to localStorage:", error);
  }
};

export const getActiveChatSessionId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_CHAT_ID_KEY);
  } catch (error) {
    console.error("Error loading active chat ID from localStorage:", error);
    return null;
  }
};

export const setActiveChatSessionId = (id: string | null): void => {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_CHAT_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_CHAT_ID_KEY);
    }
  } catch (error) {
    console.error("Error saving active chat ID to localStorage:", error);
  }
};

// Helper to generate a somewhat more user-friendly title from the first message
export const generateChatTitle = (messages: Message[]): string => {
  const firstUserMessage = messages.find(m => m.sender === 'user');
  if (firstUserMessage) {
    return firstUserMessage.text.substring(0, 30) + (firstUserMessage.text.length > 30 ? '...' : '');
  }
  return "New Chat";
};

// Quick Prompts Management
export const getQuickPrompts = (): QuickPrompt[] => {
  try {
    const promptsJson = localStorage.getItem(QUICK_PROMPTS_KEY);
    return promptsJson ? JSON.parse(promptsJson) : [];
  } catch (error) {
    console.error("Error loading quick prompts from localStorage:", error);
    return [];
  }
};

export const saveQuickPrompts = (prompts: QuickPrompt[]): void => {
  try {
    localStorage.setItem(QUICK_PROMPTS_KEY, JSON.stringify(prompts));
  } catch (error) {
    console.error("Error saving quick prompts to localStorage:", error);
  }
};
