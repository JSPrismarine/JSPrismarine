<script setup lang="ts">
import { withBase } from 'vitepress';
import { ref, useId, useTemplateRef } from 'vue';

import CopyButton from './CopyButton.vue';

export interface Audience {
    id: string;
    /** The tab label, written in the reader's voice: "I host". */
    tab: string;
    title: string;
    pitch: string;
    /** A command or snippet shown beside the pitch. */
    code: string;
    /** Whether `code` is a command a reader would paste, which adds a copy button. */
    copyable?: boolean;
    links: { text: string; hint: string; href: string }[];
}

const props = defineProps<{ audiences: Audience[] }>();
const active = ref(0);
/** Prefixes element ids so two tab sets on one page do not collide. */
const uid = useId();
const tabs = useTemplateRef<HTMLButtonElement[]>('tabs');

/** Arrow keys, Home and End move between tabs and select them, as the WAI-ARIA tabs pattern describes. */
function onKeydown(event: KeyboardEvent) {
    const last = props.audiences.length - 1;
    const next = { ArrowRight: active.value + 1, ArrowLeft: active.value - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    active.value = (next + last + 1) % (last + 1);
    tabs.value?.[active.value]?.focus();
}
</script>

<template>
    <div class="audience-tabs">
        <div class="audience-tabs__list" role="tablist" @keydown="onKeydown">
            <button
                v-for="(audience, index) in audiences"
                :id="`${uid}-tab-${audience.id}`"
                ref="tabs"
                :key="audience.id"
                type="button"
                role="tab"
                :tabindex="index === active ? 0 : -1"
                :aria-selected="index === active"
                :aria-controls="`${uid}-panel-${audience.id}`"
                @click="active = index"
            >
                {{ audience.tab }}
            </button>
        </div>
        <div
            v-for="(audience, index) in audiences"
            v-show="index === active"
            :id="`${uid}-panel-${audience.id}`"
            :key="audience.id"
            class="audience-tabs__panel"
            role="tabpanel"
            :aria-labelledby="`${uid}-tab-${audience.id}`"
        >
            <div class="audience-tabs__pitch">
                <h3>{{ audience.title }}</h3>
                <p>{{ audience.pitch }}</p>
            </div>
            <div class="audience-tabs__code">
                <pre>{{ audience.code }}</pre>
                <CopyButton v-if="audience.copyable" class="audience-tabs__copy" :text="audience.code" />
            </div>
            <div class="audience-tabs__links">
                <a v-for="link in audience.links" :key="link.href" :href="withBase(link.href)">
                    {{ link.text }}<span>{{ link.hint }}</span>
                </a>
            </div>
        </div>
    </div>
</template>

<style scoped>
.audience-tabs__list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 22px 0;
}

.audience-tabs__list button {
    padding: 10px 16px;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    color: inherit;
    cursor: pointer;
    background: transparent;
    border: 2px solid currentColor;
    border-radius: 99px;
}

.audience-tabs__list button[aria-selected='true'] {
    color: var(--jsp-cream);
    background: var(--jsp-ink);
    border-color: var(--jsp-ink);
}

.audience-tabs__panel {
    display: grid;
    /* minmax(0, 1fr) lets a long command scroll inside its box instead of widening the page. */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.audience-tabs__pitch {
    padding: 22px;
    color: var(--jsp-cream);
    background: var(--jsp-forest);
    border-radius: var(--jsp-radius-control);
}

.audience-tabs__pitch h3 {
    padding: 0;
    margin: 0 0 10px;
    font-size: clamp(22px, 3.4vw, 34px);
    line-height: 1;
    letter-spacing: -0.03em;
    color: inherit;
    border: 0;
}

.audience-tabs__pitch p {
    margin: 0;
    font-size: 15px;
    color: var(--jsp-mint);
}

.audience-tabs__code {
    position: relative;
    padding: 18px;
    background: var(--jsp-ink);
    border-radius: var(--jsp-radius-control);
}

.audience-tabs__code pre {
    /* Commands keep their lines, so a copied command reads the way it runs; wide ones scroll. */
    padding-bottom: 32px;
    margin: 0;
    overflow-x: auto;
    font: 13px/1.7 var(--vp-font-family-mono);
    color: var(--jsp-cream);
    white-space: pre;
}

.audience-tabs__copy {
    position: absolute;
    right: 12px;
    bottom: 12px;
}

.audience-tabs__links {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr));
    gap: 10px;
}

.audience-tabs__links a {
    padding: 14px 16px;
    font-weight: 800;
    color: inherit;
    text-decoration: none;
    border: 2px solid currentColor;
    border-radius: var(--jsp-radius-control);
}

.audience-tabs__links a:hover {
    color: var(--jsp-forest);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
}

.audience-tabs__links span {
    display: block;
    margin-top: 2px;
    font: 400 12px var(--vp-font-family-mono);
    opacity: 0.7;
}

@media (max-width: 640px) {
    .audience-tabs__panel {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
