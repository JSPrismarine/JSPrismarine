<script setup lang="ts">
/**
 * A server-console frame. Slot content is preformatted; wrap spans in the `t-*` classes
 * (`t-prompt`, `t-ok`, `t-dim`, `t-warn`), put each line in a `t-line` span and add `<span class="t-cursor" />` for a cursor.
 */
withDefaults(defineProps<{ title?: string }>(), { title: 'jsprismarine' });
</script>

<template>
    <div class="terminal">
        <div class="terminal__bar">
            <b></b><b></b><b></b>
            <span>{{ title }}</span>
        </div>
        <pre class="terminal__body"><slot /></pre>
    </div>
</template>

<style scoped>
.terminal {
    overflow: hidden;
    font: 13px/1.65 var(--vp-font-family-mono);
    color: var(--jsp-term-text);
    background: var(--jsp-ink);
    border-radius: var(--jsp-radius-control);
}

.terminal__bar {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 10px 14px;
    background: var(--jsp-term-bar);
}

.terminal__bar b {
    width: 10px;
    height: 10px;
    background: var(--jsp-term-muted);
    border-radius: 50%;
}

.terminal__bar span {
    margin-left: auto;
    font-size: var(--jsp-label-size);
    color: var(--jsp-term-muted);
}

.terminal__body {
    padding: 14px 16px 20px;
    margin: 0;
    font: inherit;
    white-space: normal;
    /* A log line can carry a long path or URL; break it rather than push the frame wider. */
    overflow-wrap: anywhere;
}

.terminal__body :deep(.t-line) {
    display: block;
}

.terminal__body :deep(.t-prompt) {
    color: var(--jsp-signal);
}

.terminal__body :deep(.t-ok) {
    color: var(--jsp-accent);
}

.terminal__body :deep(.t-dim) {
    color: var(--jsp-term-muted);
}

.terminal__body :deep(.t-warn) {
    color: var(--jsp-mint);
}

.terminal__body :deep(.t-cursor) {
    display: inline-block;
    width: 8px;
    height: 15px;
    vertical-align: -2px;
    background: var(--jsp-accent);
    animation: blink 1s steps(1) infinite;
}

@keyframes blink {
    50% {
        opacity: 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .terminal__body :deep(.t-cursor) {
        animation: none;
    }
}
</style>
