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
    color: #cfd8d3;
    background: var(--jsp-ink);
    border-radius: 12px;
}

.terminal__bar {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 10px 14px;
    background: #16241f;
}

.terminal__bar b {
    width: 10px;
    height: 10px;
    background: #2f4a41;
    border-radius: 50%;
}

.terminal__bar span {
    margin-left: auto;
    font-size: 11px;
    color: #7a948a;
}

.terminal__body {
    padding: 14px 16px 20px;
    margin: 0;
    font: inherit;
    white-space: normal;
}

.terminal__body :deep(.t-line) {
    display: block;
}

.terminal__body :deep(.t-prompt) {
    color: var(--jsp-signal);
}

.terminal__body :deep(.t-ok) {
    color: #70bdb3;
}

.terminal__body :deep(.t-dim) {
    color: #6f8a80;
}

.terminal__body :deep(.t-warn) {
    color: #e0b570;
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
