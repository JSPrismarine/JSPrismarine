<script setup lang="ts">
import { ref } from 'vue';

/** Copies `text` to the clipboard and says so for two seconds. */
const props = defineProps<{ text: string }>();
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
    try {
        await navigator.clipboard.writeText(props.text);
    } catch {
        return;
    }
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
        copied.value = false;
    }, 2000);
}
</script>

<template>
    <button type="button" class="copy-button" @click="copy">
        <span aria-live="polite">{{ copied ? 'Copied' : 'Copy' }}</span>
    </button>
</template>

<style scoped>
.copy-button {
    min-height: 30px;
    padding: 6px 12px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--jsp-ink);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    background: var(--jsp-accent);
    border-radius: 99px;
}

.copy-button:hover {
    background: var(--jsp-mint);
}
</style>
