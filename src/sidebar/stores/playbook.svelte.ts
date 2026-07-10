// Active playbook selection - Svelte 5 runes.
// The Review tab reads the active playbook id so contract review runs against
// the firm's positions and fallback ladders instead of the default.
import type { Playbook } from '$shared/types';

let activePlaybook = $state<Playbook | null>(null);

function setActivePlaybook(playbook: Playbook | null) {
  activePlaybook = playbook;
}

export const playbookStore = {
  get active() {
    return activePlaybook;
  },
  get activeId(): string | null {
    return activePlaybook ? activePlaybook.id : null;
  },
  get activeName(): string | null {
    return activePlaybook ? activePlaybook.name : null;
  },
  setActivePlaybook
};
