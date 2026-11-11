<script setup lang="ts">
import { useRoute } from 'vitepress';

import BrandButton from './components/BrandButton.vue';
import PrismMark from './components/PrismMark.vue';
import TerminalWindow from './components/TerminalWindow.vue';
import { data as project } from '../../project.data.mts';

const route = useRoute();
</script>

<template>
    <div class="not-found">
        <PrismMark :size="72" />
        <h1>This page is not in the docs.</h1>
        <TerminalWindow title="404">
            <span class="t-line"><span class="t-prompt">&gt;</span> {{ route.path }}</span>
            <span class="t-line"
                ><span class="t-warn">[warn]</span> Unknown page. It may have moved or been renamed.</span
            >
            <span class="t-line"><span class="t-prompt">&gt;</span> <span class="t-cursor"></span></span>
        </TerminalWindow>
        <p>Search with <kbd>/</kbd>, or start from one of these.</p>
        <div class="not-found__links">
            <BrandButton href="/">Home</BrandButton>
            <BrandButton href="/guide/running" variant="secondary">Run a server</BrandButton>
            <BrandButton href="/packages" variant="secondary">Packages</BrandButton>
        </div>
        <p class="not-found__report">
            Followed a link here?
            <a
                :href="`${project.repositoryUrl}/issues/new?title=${encodeURIComponent(`Docs: broken link to ${route.path}`)}`"
                >Report it</a
            >.
        </p>
    </div>
</template>

<style scoped>
.not-found {
    display: grid;
    gap: 20px;
    justify-items: start;
    max-width: 640px;
    padding: 64px 24px 96px;
    margin: 0 auto;
}

.not-found h1 {
    margin: 0;
    text-wrap: balance;
    font-size: clamp(36px, 7vw, 64px);
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: -0.05em;
}

.not-found :deep(.terminal) {
    width: 100%;
}

.not-found p {
    margin: 0;
    color: var(--vp-c-text-2);
}

.not-found__links {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
}

@media (max-width: 480px) {
    .not-found__links :deep(.brand-button) {
        flex: 1 1 100%;
        text-align: center;
    }
}

.not-found__report a {
    color: var(--vp-c-brand-1);
}
</style>
