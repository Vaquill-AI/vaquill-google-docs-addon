<script lang="ts">
  import { CheckCircle, AlertTriangle, XCircle } from '@lucide/svelte';

  interface Props {
    compliant: number;
    partial: number;
    nonCompliant: number;
  }

  let { compliant, partial, nonCompliant }: Props = $props();
</script>

<div class="stats-bar">
  <div class="stat compliant">
    <CheckCircle size={14} />
    <span>{compliant} Compliant</span>
  </div>
  <div class="stat partial">
    <AlertTriangle size={14} />
    <span>{partial} Partial</span>
  </div>
  <div class="stat non-compliant">
    <XCircle size={14} />
    <span>{nonCompliant} Non-Compliant</span>
  </div>
</div>

<style>
  .stats-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 500;
  }

  .stat.compliant { color: #188038; }
  .stat.partial { color: #e37400; }
  .stat.non-compliant { color: var(--color-danger); }
</style>
