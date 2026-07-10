// Chat store - Svelte 5 runes
import type { ChatMessage, ChatMode } from '$shared/types';

// Chat state
let messages = $state<ChatMessage[]>([]);
let isStreaming = $state(false);
let currentMode = $state<ChatMode>('ask');
let inputValue = $state('');

// Derived state
let messageCount = $derived(messages.length);
let lastMessage = $derived(messages.length > 0 ? messages[messages.length - 1] : null);
let hasMessages = $derived(messages.length > 0);

// Generate unique ID
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Actions
function addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>) {
  const newMessage: ChatMessage = {
    ...message,
    id: generateId(),
    timestamp: Date.now()
  };
  messages = [...messages, newMessage];
  return newMessage.id;
}

function updateMessage(id: string, updates: Partial<ChatMessage>) {
  messages = messages.map(msg =>
    msg.id === id ? { ...msg, ...updates } : msg
  );
}

function removeMessage(id: string) {
  messages = messages.filter(msg => msg.id !== id);
}

function clearMessages() {
  messages = [];
}

function setStreaming(streaming: boolean) {
  isStreaming = streaming;
}

function setMode(mode: ChatMode) {
  currentMode = mode;
}

function setInput(value: string) {
  inputValue = value;
}

function clearInput() {
  inputValue = '';
}

// Export reactive getters and actions
export const chatStore = {
  // Getters (reactive)
  get messages() { return messages; },
  get isStreaming() { return isStreaming; },
  get currentMode() { return currentMode; },
  get inputValue() { return inputValue; },
  get messageCount() { return messageCount; },
  get lastMessage() { return lastMessage; },
  get hasMessages() { return hasMessages; },

  // Actions
  addMessage,
  updateMessage,
  removeMessage,
  clearMessages,
  setStreaming,
  setMode,
  setInput,
  clearInput
};
