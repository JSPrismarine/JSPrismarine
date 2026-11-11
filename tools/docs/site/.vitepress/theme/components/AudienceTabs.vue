<script setup lang="ts">
import { withBase } from 'vitepress';
import { nextTick, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue';

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

const props = defineProps<{
    audiences: Audience[];
    /**
     * Gives each panel a stable id, `<anchor>-<audience id>`, so a link such as `#start-host` scrolls to
     * that audience and selects its tab. Without it, ids are generated and links cannot target one.
     */
    anchor?: string;
}>();
const active = ref(0);
/** Prefixes element ids so two tab sets on one page do not collide. */
const uid = useId();
const panelId = (audience: Audience) =>
    props.anchor ? `${props.anchor}-${audience.id}` : `${uid}-panel-${audience.id}`;
const tabId = (audience: Audience) => `${panelId(audience)}-tab`;

/** Selects the audience the URL fragment names, if any, and scrolls to it once it is shown. */
function selectFromHash() {
    const index = props.audiences.findIndex((audience) => `#${panelId(audience)}` === window.location.hash);
    if (index === -1) return;
    active.value = index;
    void nextTick(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView());
}

onMounted(() => {
    if (!props.anchor) return;
    selectFromHash();
    window.addEventListener('hashchange', selectFromHash);
});
onBeforeUnmount(() => {
    window.removeEventListener('hashchange', selectFromHash);
});
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
                :id="tabId(audience)"
                ref="tabs"
                :key="audience.id"
                type="button"
                role="tab"
                :tabindex="index === active ? 0 : -1"
                :aria-selected="index === active"
                :aria-controls="panelId(audience)"
                @click="active = index"
            >
                <span class="audience-tabs__tab">{{ audience.tab }}</span>
                <!-- Each tab names what its audience gets, so all four read at a glance before any click. -->
                <span class="audience-tabs__hint">{{ audience.title }}</span>
            </button>
        </div>
        <div
            v-for="(audience, index) in audiences"
            v-show="index === active"
            :id="panelId(audience)"
            :key="audience.id"
            class="audience-tabs__panel"
            role="tabpanel"
            :aria-labelledby="tabId(audience)"
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
                <a
                    v-for="link in audience.links"
                    :key="link.href"
                    :href="/^[a-z]+:/i.test(link.href) ? link.href : withBase(link.href)"
                >
                    {{ link.text }}<span>{{ link.hint }}</span>
                </a>
            </div>
        </div>
    </div>
</template>

<style scoped>
.audience-tabs__list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--jsp-gap);
    margin: 22px 0 var(--jsp-gap);
}

/* A tab is a card: the audience in mono caps, then what it gets. */
.audience-tabs__list button {
    display: grid;
    gap: 4px;
    align-content: start;
    min-height: var(--jsp-target);
    padding: 14px 16px;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 2px solid currentColor;
    border-radius: var(--jsp-radius-control);
}

.audience-tabs__list button:hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
}

.audience-tabs__tab {
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.audience-tabs__hint {
    font-size: 17px;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.02em;
}

.audience-tabs__list button[aria-selected='true'] {
    color: var(--jsp-cream);
    background: var(--jsp-ink);
    border-color: var(--jsp-ink);
}

/* Forest cards on a dark panel need an edge to stay separate blocks. */
.dark .audience-tabs__pitch,
.dark .audience-tabs__code {
    box-shadow: inset 0 0 0 1px var(--jsp-dark-edge);
}

/* On a dark panel an ink tab would vanish, so the selected tab takes the accent. */
.dark .audience-tabs__list button[aria-selected='true'] {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
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
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
}

.audience-tabs__links span {
    display: block;
    margin-top: 2px;
    font: 400 var(--jsp-label-size) var(--vp-font-family-mono);
    opacity: 0.7;
}

@media (max-width: 640px) {
    /* Two even rows instead of a ragged wrap that leaves the last tab alone. */
    .audience-tabs__list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .audience-tabs__list button {
        align-content: center;
        padding: 10px;
        text-align: center;
    }

    /* On a phone the audience reads in sentence case so it fits, with what it gets set small beneath. */
    .audience-tabs__hint {
        font-size: 13px;
        font-weight: 700;
    }

    .audience-tabs__tab {
        font: 700 15px var(--vp-font-family-base);
        text-transform: none;
        letter-spacing: 0;
    }

    .audience-tabs__panel {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
