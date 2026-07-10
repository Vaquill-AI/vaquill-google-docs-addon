<script lang="ts">
  interface Props {
    message: string;
  }

  let { message }: Props = $props();
</script>

{#if message}
  <div class="error-message">{message}</div>
{/if}

<style>
  .error-message {
    padding: 10px;
    background: var(--color-danger-bg);
    border: 1px solid #fad2cf;
    border-radius: 6px;
    color: var(--color-danger);
    font-size: 12px;
  }
</style>
