<script lang="ts">
  import { Settings, Check, User, LogOut } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import {
    getNativeSuggestionsStatus,
    setNativeSuggestions,
    getAuthStatus,
    signOutVaquill
  } from '$services/gasClient';

  let open = $state(false);
  let nativeEnabled = $state(true);
  let loading = $state(true);
  let saving = $state(false);

  // Vaquill account status (resolved lazily when the menu opens).
  let accountChecked = $state(false);
  let accountLoading = $state(false);
  let accountEmail = $state('');
  let needsSignup = $state(false);
  let accountConnected = $state(false);

  onMount(async () => {
    try {
      const status = await getNativeSuggestionsStatus();
      nativeEnabled = status.enabled;
    } catch {
      // Default to enabled if status cannot be read (for example outside GAS).
      nativeEnabled = true;
    } finally {
      loading = false;
    }
  });

  async function loadAccount() {
    if (accountChecked || accountLoading) return;
    accountLoading = true;
    try {
      const status = await getAuthStatus();
      accountConnected = status.signedIn;
      accountEmail = status.email || '';
      needsSignup = status.needsSignup;
    } catch {
      // Backend not configured or unreachable: stay silent, non-blocking.
      accountConnected = false;
    } finally {
      accountLoading = false;
      accountChecked = true;
    }
  }

  function toggleOpen() {
    open = !open;
    if (open) {
      void loadAccount();
    }
  }

  async function handleSignOut() {
    try {
      await signOutVaquill();
    } catch {
      // ignore
    }
    accountChecked = false;
    accountConnected = false;
    accountEmail = '';
    needsSignup = false;
    void loadAccount();
  }

  async function toggleNative() {
    if (saving) return;
    const next = !nativeEnabled;
    saving = true;
    // Optimistic update for a responsive feel.
    nativeEnabled = next;
    try {
      const result = await setNativeSuggestions(next);
      nativeEnabled = result.enabled;
    } catch {
      // Revert on failure.
      nativeEnabled = !next;
    } finally {
      saving = false;
    }
  }
</script>

<div class="settings">
  <button
    class="gear"
    class:active={open}
    aria-label="Settings"
    aria-expanded={open}
    onclick={toggleOpen}
  >
    <Settings size={18} strokeWidth={2} />
  </button>

  {#if open}
    <button class="backdrop" aria-label="Close settings" onclick={() => (open = false)}></button>
    <div class="popover" role="dialog" aria-label="Settings">
      <div class="popover-title">Account</div>

      <div class="account">
        {#if accountLoading && !accountChecked}
          <div class="account-line muted">Checking your Vaquill account...</div>
        {:else if accountConnected}
          <div class="account-connected">
            <span class="avatar"><User size={14} /></span>
            <div class="account-copy">
              <span class="account-label">Signed in</span>
              <span class="account-email">{accountEmail}</span>
            </div>
            <button class="signout" onclick={handleSignOut} aria-label="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        {:else if needsSignup}
          <div class="account-line">
            No Vaquill account for {accountEmail ? accountEmail : 'this Google account'}.
            <a href="https://www.vaquill.ai" target="_blank" rel="noopener">Sign up</a>
            with this email to unlock grounded review.
          </div>
        {:else}
          <div class="account-line muted">
            Not connected to Vaquill. Reopen the add-on, or check your connection and try again.
          </div>
        {/if}
      </div>

      <div class="popover-title">Settings</div>

      <button
        class="setting-row"
        role="switch"
        aria-checked={nativeEnabled}
        disabled={loading || saving}
        onclick={toggleNative}
      >
        <div class="setting-copy">
          <span class="setting-name">Native tracked changes</span>
          <span class="setting-desc">
            Insert redlines as real Google Docs suggestions. Requires Developer Preview access and
            falls back to highlighted markup automatically.
          </span>
        </div>
        <span class="switch" class:on={nativeEnabled}>
          <span class="knob"></span>
        </span>
      </button>

      <div class="popover-foot">
        {#if nativeEnabled}
          <Check size={13} />
          <span>Redlines apply as native suggestions when supported.</span>
        {:else}
          <span>Redlines apply as highlighted markup.</span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .settings {
    position: relative;
  }

  .gear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--color-gray-600);
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
  }

  .gear:hover {
    background: var(--color-gray-100);
  }

  .gear.active {
    background: var(--color-gray-200);
    transform: rotate(30deg);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: transparent;
    border: none;
    cursor: default;
  }

  .popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 50;
    width: 260px;
    background: #ffffff;
    color: var(--color-gray-900, #202124);
    border: 1px solid var(--color-gray-200, #e8eaed);
    border-radius: 10px;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
    padding: 12px;
    animation: pop 0.14s ease-out;
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .popover-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-gray-400, #bdc1c6);
    margin-bottom: 8px;
  }

  .account {
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-gray-100, #f1f3f4);
  }

  .account-line {
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-gray-700, #3c4043);
  }

  .account-line.muted {
    color: var(--color-gray-500, #5f6368);
  }

  .account-line a {
    color: var(--color-primary, #1a73e8);
    font-weight: 500;
  }

  .account-connected {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-gray-100, #f1f3f4);
    color: var(--color-gray-500, #5f6368);
    flex-shrink: 0;
  }

  .account-copy {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
  }

  .account-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-gray-400, #bdc1c6);
  }

  .account-email {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-gray-900, #202124);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .signout {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-gray-400, #bdc1c6);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    flex-shrink: 0;
  }

  .signout:hover {
    background: var(--color-gray-100, #f1f3f4);
    color: var(--color-danger, #d93025);
  }

  .setting-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .setting-row:hover:not(:disabled) {
    background: var(--color-gray-50, #f8f9fa);
  }

  .setting-row:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .setting-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .setting-name {
    font-size: 13px;
    font-weight: 600;
  }

  .setting-desc {
    font-size: 11px;
    line-height: 1.45;
    color: var(--color-gray-500, #5f6368);
  }

  .switch {
    flex-shrink: 0;
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: var(--color-gray-300, #dadce0);
    transition: background 0.18s ease;
    margin-top: 2px;
  }

  .switch.on {
    background: var(--color-primary, #1a73e8);
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.25);
    transition: transform 0.18s ease;
  }

  .switch.on .knob {
    transform: translateX(16px);
  }

  .popover-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--color-gray-100, #f1f3f4);
    font-size: 11px;
    color: var(--color-gray-500, #5f6368);
  }
</style>
