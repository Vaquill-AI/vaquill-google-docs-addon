<script lang="ts">
  import { Info } from '@lucide/svelte';

  interface Props {
    /** The guidance text shown in the popover. */
    text: string;
    /** Accessible label for the trigger button. */
    label?: string;
    /** Which way the popover grows. 'right' anchors its right edge to the icon
     *  (grows left) and is safest when the icon sits near the right of a row. */
    align?: 'left' | 'right';
    /** Icon size in px. */
    size?: number;
  }

  let { text, label = 'What is this?', align = 'right', size = 13 }: Props = $props();

  let open = $state(false);

  function toggle(e: MouseEvent) {
    // Stop a parent (e.g. an expandable card header) from also toggling.
    e.stopPropagation();
    open = !open;
  }

  function close() {
    open = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<span class="infotip">
  <button
    type="button"
    class="trigger"
    class:open
    aria-label={label}
    aria-expanded={open}
    title={label}
    onclick={toggle}
  >
    <Info {size} strokeWidth={2} />
  </button>

  {#if open}
    <!-- Transparent backdrop closes on any outside click (matches SettingsMenu). -->
    <button
      type="button"
      class="backdrop"
      aria-label="Close"
      onclick={(e) => {
        e.stopPropagation();
        close();
      }}
    ></button>
    <span class="popover" class:left={align === 'left'} role="tooltip">
      {text}
    </span>
  {/if}
</span>

<style>
  .infotip {
    position: relative;
    display: inline-flex;
    vertical-align: middle;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--color-gray-400);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .trigger:hover,
  .trigger.open {
    background: var(--color-gray-100);
    color: var(--color-gray-600);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: transparent;
    border: none;
    cursor: default;
  }

  .popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 70;
    width: max-content;
    max-width: 232px;
    padding: 8px 10px;
    background: var(--color-gray-800);
    color: #ffffff;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.45;
    text-align: left;
    white-space: normal;
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.24);
    animation: infotip-pop 0.12s ease-out;
  }

  .popover.left {
    right: auto;
    left: 0;
  }

  @keyframes infotip-pop {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
