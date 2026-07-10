<script lang="ts">
  import { Send, MessageCircle, PenLine, ExternalLink } from '@lucide/svelte';
  import { chatStore } from '$stores/chat.svelte';
  import { documentStore } from '$stores/document.svelte';
  import { uiStore } from '$stores/ui.svelte';
  import { navigateToOffset, hybridChat, getDocumentContent, getSelectedText } from '$services/gasClient';
  import type { ChatMode, Citation } from '$shared/types';
  import InfoTip from './ui/InfoTip.svelte';
  import DocScopeNotice from './ui/DocScopeNotice.svelte';
  import { DOC_CHAR_LIMITS } from '../utils/document-scope';

  // Two honest modes. Both are grounded in the open document; there is no
  // web-search path in the thin client, so no "research" mode is offered.
  const modes: { id: ChatMode; label: string; hint: string; icon: typeof MessageCircle }[] = [
    { id: 'ask', label: 'Ask', hint: 'Answer questions about this contract', icon: MessageCircle },
    { id: 'draft', label: 'Draft', hint: 'Generate new clause language', icon: PenLine }
  ];

  const askSuggestions = [
    'What are the key obligations?',
    'Find the termination clause',
    'Summarize the indemnification'
  ];

  const draftSuggestions = [
    'Draft a mutual confidentiality clause',
    'Write a limitation of liability capped at fees',
    'Add a 30-day termination for convenience clause'
  ];

  const isDraftMode = $derived(chatStore.currentMode === 'draft');
  const currentSuggestions = $derived(isDraftMode ? draftSuggestions : askSuggestions);

  const inputPlaceholder = $derived(
    isDraftMode ? 'Describe what you want to draft...' : 'Ask about this contract...'
  );

  async function handleSubmit(e: Event) {
    e.preventDefault();
    const query = chatStore.inputValue.trim();
    if (!query || chatStore.isStreaming) return;

    // Snapshot the history BEFORE adding this turn, so the backend does not
    // receive the current question twice (it appends the query itself). Cap the
    // resent transcript so the payload stays bounded over a long conversation.
    const priorHistory = chatStore.messages.slice(-20);

    chatStore.addMessage({ role: 'user', content: query });
    chatStore.clearInput();
    chatStore.setStreaming(true);

    try {
      // Refresh the document so answers reflect edits made since the add-on
      // opened. A refresh failure is non-fatal; fall back to the cached body.
      try {
        const fresh = await getDocumentContent();
        documentStore.setDocument(fresh);
      } catch {
        // keep the previously loaded document content
      }

      if (!documentStore.content) {
        throw new Error('Open a document first so answers can be grounded in its text.');
      }

      // An empty or image-only (scanned) document has no readable text to ground
      // answers in. getText returns nothing for scanned pages, so a full-looking
      // page can read as empty.
      if ((documentStore.content.text?.trim() ?? '').length < 30) {
        throw new Error('This document has little or no readable text. If it is scanned images, Vaquill reads text, not images.');
      }

      // For a document larger than the chat cap, include whatever the user has
      // selected so a question about a late clause is not lost to truncation.
      let focusText: string | undefined;
      if (documentStore.content.text.length > DOC_CHAR_LIMITS.chat) {
        try {
          const selection = (await getSelectedText())?.trim();
          if (selection) focusText = selection;
        } catch {
          // selection is best-effort; ignore failures
        }
      }

      const response = await hybridChat({
        documentId: documentStore.content.documentId,
        documentText: documentStore.content.text,
        query,
        mode: chatStore.currentMode,
        conversationHistory: priorHistory,
        focusText
      });

      chatStore.addMessage({
        role: 'assistant',
        content: response.answer,
        citations: response.citations || []
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not get a response. Please try again.';
      uiStore.showToast('error', message);
    } finally {
      chatStore.setStreaming(false);
    }
  }

  async function handleCitationClick(citation: Citation) {
    // Offsets are only meaningful when resolved; a 0 offset would jump to the
    // top of the document, so those citations render as static evidence chips.
    if (!citation.charStart || citation.charStart <= 0) return;
    try {
      await navigateToOffset(citation.charStart);
    } catch {
      uiStore.showToast('error', 'Could not jump to that passage.');
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e);
    }
  }

  function setMode(mode: ChatMode) {
    chatStore.setMode(mode);
  }
</script>

<div class="chat-panel">
  <div class="chat-intro">
    <span>Ask questions or draft language, grounded in the open contract.</span>
    <InfoTip
      align="right"
      text="Ask answers questions about this contract with citations. Draft generates new clause language you can paste in. Both read the open document, and grounded answers need a signed-in Vaquill account."
    />
  </div>

  {#if documentStore.content && documentStore.content.characterCount > DOC_CHAR_LIMITS.chat}
    <div class="scope-slot">
      <DocScopeNotice totalChars={documentStore.content.characterCount} limit={DOC_CHAR_LIMITS.chat} feature="Ask" />
    </div>
  {/if}

  <!-- Mode selector: Google-native segmented control -->
  <div class="mode-selector" role="tablist" aria-label="Chat mode">
    {#each modes as mode}
      {@const Icon = mode.icon}
      <button
        type="button"
        class="mode-btn"
        class:active={chatStore.currentMode === mode.id}
        role="tab"
        aria-selected={chatStore.currentMode === mode.id}
        title={mode.hint}
        onclick={() => setMode(mode.id)}
      >
        <Icon size={14} />
        <span>{mode.label}</span>
      </button>
    {/each}
  </div>

  <!-- Messages -->
  <div class="messages-container">
    {#if chatStore.messages.length === 0}
      <div class="empty-state">
        <span class="empty-icon">
          {#if isDraftMode}
            <PenLine size={22} strokeWidth={1.75} />
          {:else}
            <MessageCircle size={22} strokeWidth={1.75} />
          {/if}
        </span>
        <h4 class="empty-title">
          {isDraftMode ? 'Draft new language' : 'Ask about this contract'}
        </h4>
        <p class="empty-desc">
          {isDraftMode
            ? 'Describe what you want to draft and get ready-to-use language.'
            : 'Ask questions about this contract and get answers with citations.'}
        </p>

        {#if !documentStore.hasDocument}
          <div class="empty-hint">Open a document to ground answers in its text.</div>
        {/if}

        <div class="suggestions">
          {#each currentSuggestions as suggestion}
            <button type="button" class="suggestion-chip" onclick={() => chatStore.setInput(suggestion)}>
              {#if isDraftMode}
                <PenLine size={14} class="chip-icon" />
              {:else}
                <MessageCircle size={14} class="chip-icon" />
              {/if}
              <span class="chip-text">{suggestion}</span>
            </button>
          {/each}
        </div>
      </div>
    {:else}
      {#each chatStore.messages as message (message.id)}
        <div class="message message-{message.role}">
          <div class="message-content">
            {message.content}
          </div>

          <!-- Document citations rendered as subtle source chips -->
          {#if message.citations && message.citations.length > 0}
            <div class="citations">
              {#each message.citations as citation}
                {@const clickable = !!citation.charStart && citation.charStart > 0}
                {#if clickable}
                  <button
                    type="button"
                    class="citation-chip"
                    title="Jump to this passage in the document"
                    onclick={() => handleCitationClick(citation)}
                  >
                    <ExternalLink size={11} class="chip-icon" />
                    <span class="chip-text">{citation.text}</span>
                  </button>
                {:else}
                  <span class="citation-chip static" title="Cited passage">
                    <span class="chip-text">{citation.text}</span>
                  </span>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      {#if chatStore.isStreaming}
        <div class="message message-assistant">
          <div class="message-content loading">
            <span class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span class="loading-label">Thinking</span>
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Composer -->
  <form class="composer" onsubmit={handleSubmit}>
    <textarea
      class="composer-input"
      placeholder={inputPlaceholder}
      value={chatStore.inputValue}
      oninput={(e) => chatStore.setInput((e.target as HTMLTextAreaElement).value)}
      onkeydown={handleKeyDown}
      rows={1}
      disabled={chatStore.isStreaming}
    ></textarea>
    <div class="composer-row">
      <span class="composer-hint">Enter to send, Shift + Enter for a new line</span>
      <button
        type="submit"
        class="send-btn"
        disabled={!chatStore.inputValue.trim() || chatStore.isStreaming}
      >
        <Send size={16} />
        <span>Send</span>
      </button>
    </div>
  </form>
</div>

<style>
  .chat-panel {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 180px);
  }

  .chat-intro {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-gray-600);
    margin-bottom: var(--spacing-sm);
  }

  .scope-slot {
    margin-bottom: var(--spacing-md);
  }

  /* Mode selector */
  .mode-selector {
    display: flex;
    gap: 4px;
    padding: 4px;
    background-color: var(--color-gray-100);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-md);
  }

  .mode-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-gray-600);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .mode-btn:hover:not(.active) {
    color: var(--color-gray-800);
    background-color: var(--color-gray-50);
  }

  .mode-btn.active {
    background-color: white;
    color: var(--color-primary);
    box-shadow: var(--shadow-sm);
  }

  /* Messages */
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-xs) 2px var(--spacing-md);
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--spacing-xl) var(--spacing-sm) var(--spacing-md);
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background-color: var(--color-gray-100);
    color: var(--color-primary);
    margin-bottom: var(--spacing-md);
  }

  .empty-title {
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--color-gray-800);
    margin: 0;
  }

  .empty-desc {
    font-size: 0.8125rem;
    color: var(--color-gray-600);
    line-height: 1.5;
    margin: var(--spacing-xs) 0 0;
    max-width: 240px;
  }

  .empty-hint {
    margin-top: var(--spacing-md);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: 0.75rem;
    color: var(--color-warning);
    background-color: var(--color-warning-bg);
    border-radius: var(--radius-sm);
  }

  .suggestions {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    width: 100%;
    margin-top: var(--spacing-lg);
  }

  .suggestion-chip {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: 0.8125rem;
    text-align: left;
    color: var(--color-gray-700);
    background-color: white;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .suggestion-chip:hover {
    background-color: var(--color-gray-50);
    border-color: var(--color-gray-400);
  }

  .suggestion-chip :global(.chip-icon) {
    flex-shrink: 0;
    color: var(--color-gray-500);
  }

  .suggestion-chip .chip-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .message {
    margin-bottom: var(--spacing-md);
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .message-user .message-content {
    background-color: var(--color-primary);
    color: white;
    border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg);
    padding: var(--spacing-sm) var(--spacing-md);
    margin-left: var(--spacing-xl);
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .message-assistant .message-content {
    background-color: white;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    margin-right: var(--spacing-lg);
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--color-gray-800);
    white-space: pre-wrap;
  }

  /* Citations as subtle Google-style source chips */
  .citations {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-sm);
    margin-right: var(--spacing-lg);
  }

  .citation-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 3px 10px 3px 8px;
    font-size: 0.75rem;
    color: var(--color-gray-700);
    background-color: var(--color-gray-100);
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .citation-chip:hover {
    color: var(--color-primary);
    background-color: white;
    border-color: var(--color-primary);
  }

  /* A citation without a resolved offset is evidence, not a link. */
  .citation-chip.static {
    cursor: default;
    padding-left: 10px;
  }

  .citation-chip.static:hover {
    color: var(--color-gray-700);
    background-color: var(--color-gray-100);
    border-color: var(--color-gray-300);
  }

  .citation-chip :global(.chip-icon) {
    flex-shrink: 0;
    color: var(--color-gray-500);
  }

  .citation-chip:hover :global(.chip-icon) {
    color: var(--color-primary);
  }

  .citation-chip .chip-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Loading */
  .message-content.loading {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .loading-label {
    font-size: 0.8125rem;
    color: var(--color-gray-500);
  }

  .typing-indicator {
    display: inline-flex;
    gap: 4px;
  }

  .typing-indicator span {
    width: 6px;
    height: 6px;
    background-color: var(--color-gray-400);
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
  .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }

  /* Composer */
  .composer {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background-color: white;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-md);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .composer:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
  }

  .composer-input {
    width: 100%;
    border: none;
    padding: var(--spacing-xs);
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--color-gray-800);
    resize: none;
    min-height: 20px;
    max-height: 120px;
  }

  .composer-input:focus {
    outline: none;
    box-shadow: none;
    border: none;
  }

  .composer-input:disabled {
    background-color: transparent;
    color: var(--color-gray-500);
  }

  .composer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
  }

  .composer-hint {
    font-size: 0.6875rem;
    color: var(--color-gray-500);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .send-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    padding: 0 14px;
    font-size: 0.8125rem;
    font-weight: 500;
    color: white;
    background-color: var(--color-primary);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .send-btn:hover:not(:disabled) {
    background-color: var(--color-primary-dark);
  }

  .send-btn:disabled {
    background-color: var(--color-gray-300);
    color: var(--color-gray-500);
    cursor: not-allowed;
  }
</style>
