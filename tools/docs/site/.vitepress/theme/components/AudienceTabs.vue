<script setup lang="ts">
import { withBase } from 'vitepress';
import { ref } from 'vue';

export interface Audience {
    id: string;
    /** The tab label, written in the reader's voice: "I host". */
    tab: string;
    title: string;
    pitch: string;
    /** A command or snippet shown beside the pitch. */
    code: string;
    links: { text: string; hint: string; href: string }[];
}

defineProps<{ audiences: Audience[] }>();
const active = ref(0);
</script>

<template>
    <div class="audience-tabs">
        <div class="audience-tabs__list" role="tablist">
            <button
                v-for="(audience, index) in audiences"
                :id="`tab-${audience.id}`"
                :key="audience.id"
                role="tab"
                :aria-selected="index === active"
                :aria-controls="`panel-${audience.id}`"
                @click="active = index"
            >
                {{ audience.tab }}
            </button>
        </div>
        <template v-for="(audience, index) in audiences" :key="audience.id">
            <div
                v-show="index === active"
                :id="`panel-${audience.id}`"
                class="audience-tabs__panel"
                role="tabpanel"
                :aria-labelledby="`tab-${audience.id}`"
            >
                <div class="audience-tabs__pitch">
                    <h3>{{ audience.title }}</h3>
                    <p>{{ audience.pitch }}</p>
                </div>
                <pre class="audience-tabs__code">{{ audience.code }}</pre>
                <div class="audience-tabs__links">
                    <a v-for="link in audience.links" :key="link.href" :href="withBase(link.href)">
                        {{ link.text }}<span>{{ link.hint }}</span>
                    </a>
                </div>
            </div>
        </template>
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
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.audience-tabs__pitch {
    padding: 22px;
    color: var(--jsp-cream);
    background: var(--jsp-forest);
    border-radius: 12px;
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
    padding: 18px;
    margin: 0;
    font: 13px/1.7 var(--vp-font-family-mono);
    color: var(--jsp-cream);
    white-space: pre-wrap;
    background: var(--jsp-ink);
    border-radius: 12px;
}

.audience-tabs__links {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
}

.audience-tabs__links a {
    padding: 14px 16px;
    font-weight: 800;
    color: inherit;
    text-decoration: none;
    border: 2px solid currentColor;
    border-radius: 12px;
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
        grid-template-columns: 1fr;
    }
}
</style>
