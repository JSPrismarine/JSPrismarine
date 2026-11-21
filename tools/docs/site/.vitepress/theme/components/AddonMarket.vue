<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, onMounted, ref } from 'vue';

import AddonIcon from '../AddonIcon.vue';
import type { Market, MarketAddon } from '../addonMarket';
import { tagLabel } from '../addonMarket';
import { useSiteMenu } from '../site-menu/state';
import BrandButton from './BrandButton.vue';
import PrismMark from './PrismMark.vue';

/**
 * The addon marketplace: a console line that filters the cards as the reader types, publisher and
 * tag filters, and one card per addon. When one addon is left, Tab completes its install id and
 * Enter copies the command.
 */
const props = defineProps<{ market: Market }>();
const { currentMenu } = useSiteMenu();

type Publisher = 'everyone' | 'first-party' | 'community';
const query = ref('');
const publisher = ref<Publisher>('everyone');
const tags = ref(new Set<string>());
const showDeprecated = ref(false);
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const deprecatedCount = computed(() => props.market.addons.filter(({ deprecated }) => deprecated).length);
const tagCounts = computed(() =>
    props.market.tags
        .map((tag) => ({ tag, count: props.market.addons.filter((addon) => addon.tags.includes(tag)).length }))
        .filter(({ count }) => count > 0)
);

const matches = (addon: MarketAddon) => {
    const term = query.value.trim().toLowerCase();
    return (
        (showDeprecated.value || !addon.deprecated) &&
        (publisher.value === 'everyone' || (publisher.value === 'first-party') === addon.firstParty) &&
        [...tags.value].every((tag) => addon.tags.includes(tag)) &&
        `${addon.id} ${addon.title} ${addon.description}`.toLowerCase().includes(term)
    );
};

/** The cards the filters keep, deprecated ones last. */
const shown = computed(() =>
    props.market.addons.filter(matches).sort((a, b) => Number(!!a.deprecated) - Number(!!b.deprecated))
);
const only = computed(() => (shown.value.length === 1 ? shown.value[0] : undefined));

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const countLine = computed(() => {
    const total = showDeprecated.value
        ? props.market.addons.length
        : props.market.addons.length - deprecatedCount.value;
    if (shown.value.length !== total) return `${shown.value.length} of ${total}`;
    const repositories = new Set(shown.value.map(({ repository }) => repository)).size;
    return `${plural(total, 'addon', 'addons')} from ${plural(repositories, 'repository', 'repositories')}`;
});

/** What the field would complete to: the one addon's id, after what was typed. */
const ghost = computed(() => {
    const typed = query.value;
    if (only.value === undefined || typed === '' || typed === only.value.id) return undefined;
    return only.value.id.startsWith(typed)
        ? { typed, rest: only.value.id.slice(typed.length) }
        : { typed, rest: `  ${only.value.id}` };
});

function onKey(event: KeyboardEvent) {
    if (only.value === undefined) return;
    if (event.key === 'Tab' && !event.shiftKey && query.value !== only.value.id) {
        event.preventDefault();
        query.value = only.value.id;
    } else if (event.key === 'Enter') {
        event.preventDefault();
        void copy();
    }
}

async function copy() {
    if (only.value === undefined) return;
    try {
        await navigator.clipboard.writeText(`addon install ${only.value.id}`);
    } catch {
        return;
    }
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
        copied.value = false;
    }, 2000);
}

function toggleTag(tag: string) {
    const next = new Set(tags.value);
    if (!next.delete(tag)) next.add(tag);
    tags.value = next;
}

// An addon page's tag links open the marketplace filtered by that tag.
onMounted(() => {
    const tag = new URLSearchParams(window.location.search).get('tag');
    if (tag !== null && props.market.tags.includes(tag)) tags.value = new Set([tag]);
});

const publishers: { value: Publisher; label: string }[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'first-party', label: 'JSPrismarine' },
    { value: 'community', label: 'Community' }
];

/** An install id split at its slashes, so a long one breaks there on a narrow card. */
const idParts = (id: string) => id.split('/');
</script>

<template>
    <div class="addon-market">
        <div class="addon-market__column">
            <nav class="site-crumb" aria-label="Breadcrumb">
                <ol>
                    <li v-if="currentMenu">{{ currentMenu }}</li>
                    <li aria-current="page">Addons</li>
                </ol>
            </nav>
            <div class="addon-market__head">
                <h1>Addons</h1>
                <p class="addon-market__lede">
                    Behavior packs you add to a running server from its console. None ship with the server, so it runs
                    only the ones you pick.
                    <a :href="withBase('/guide/installing-addons')">How installing works</a>
                </p>
            </div>
        </div>

        <section class="addon-market__band" aria-label="Find an addon">
            <div class="addon-market__column">
                <div class="addon-market__prompt">
                    <span class="addon-market__caret" aria-hidden="true">&gt;</span>
                    <label class="addon-market__verb" for="addon-market-query">addon install</label>
                    <span class="addon-market__field">
                        <span v-if="ghost" class="addon-market__ghost" aria-hidden="true"
                            ><b>{{ ghost.typed }}</b
                            >{{ ghost.rest }}</span
                        >
                        <input
                            id="addon-market-query"
                            v-model="query"
                            type="search"
                            autocomplete="off"
                            spellcheck="false"
                            placeholder="name or what it does"
                            aria-describedby="addon-market-hint"
                            @keydown="onKey"
                        />
                    </span>
                    <BrandButton :disabled="only === undefined" @click="copy">
                        <span aria-live="polite">{{ copied ? 'Copied' : 'Copy command' }}</span>
                    </BrandButton>
                </div>
                <div class="addon-market__hint">
                    <span id="addon-market-hint"
                        >Type to filter. When one addon is left, <kbd>Tab</kbd> completes its name and
                        <kbd>Enter</kbd> copies the command.</span
                    >
                    <span class="addon-market__count" aria-live="polite">{{ countLine }}</span>
                </div>
                <div class="addon-market__filters">
                    <div class="addon-market__group" role="group" aria-label="Publisher">
                        <span>From</span>
                        <button
                            v-for="option in publishers"
                            :key="option.value"
                            type="button"
                            class="addon-market__pill"
                            :aria-pressed="publisher === option.value"
                            @click="publisher = option.value"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                    <div v-if="tagCounts.length" class="addon-market__group" role="group" aria-label="Tags">
                        <span>Tags</span>
                        <button
                            v-for="{ tag, count } in tagCounts"
                            :key="tag"
                            type="button"
                            class="addon-market__pill"
                            :aria-pressed="tags.has(tag)"
                            @click="toggleTag(tag)"
                        >
                            {{ tagLabel(tag) }} <small>{{ count }}</small>
                        </button>
                    </div>
                    <div v-if="deprecatedCount" class="addon-market__group">
                        <button
                            type="button"
                            class="addon-market__pill"
                            :aria-pressed="showDeprecated"
                            @click="showDeprecated = !showDeprecated"
                        >
                            Show deprecated <small>{{ deprecatedCount }}</small>
                        </button>
                    </div>
                </div>
            </div>
        </section>

        <div class="addon-market__column">
            <p class="addon-market__notice">
                Community addons come from other people's repositories. JSPrismarine checks that each download matches
                its listed hash, but does not review what the scripts do.
            </p>
            <ul class="addon-market__grid">
                <li v-for="addon in shown" :key="addon.id">
                    <a class="addon-card" :class="{ 'is-deprecated': addon.deprecated }" :href="withBase(addon.path)">
                        <svg class="addon-card__arrow" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M4 12 12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" stroke-width="2" />
                        </svg>
                        <div class="addon-card__top">
                            <AddonIcon :src="addon.icon" :title="addon.title" :size="60" />
                            <div>
                                <h3 class="addon-card__title">{{ addon.title }}</h3>
                                <div class="addon-card__publisher">
                                    <template v-if="addon.firstParty"><PrismMark :size="15" />JSPrismarine</template>
                                    <template v-else>{{ addon.repository }}</template>
                                </div>
                            </div>
                        </div>
                        <p class="addon-card__description">{{ addon.description }}</p>
                        <div class="addon-card__foot">
                            <code
                                ><template v-for="(part, i) in idParts(addon.id)" :key="i"
                                    ><template v-if="i">/<wbr /></template
                                    ><span class="addon-card__id-part">{{ part }}</span></template
                                ></code
                            >
                            <span v-if="addon.deprecated" class="addon-card__state is-deprecated">Deprecated</span>
                            <span v-else-if="addon.needsNewerServer" class="addon-card__state is-newer"
                                >Needs {{ addon.minServer }}</span
                            >
                            <span v-else>{{ addon.version }}</span>
                        </div>
                    </a>
                </li>
                <li v-if="!shown.length" class="addon-market__empty">
                    <p>
                        <strong>No addon matches “{{ query.trim() || 'these filters' }}”.</strong>
                    </p>
                    <p>Clear the filters, or <a href="#list-your-addon">list one yourself</a>.</p>
                </li>
            </ul>

            <section class="addon-market__list-yours" aria-labelledby="list-your-addon">
                <div class="addon-market__section-head">
                    <h2 id="list-your-addon">List your addon here</h2>
                </div>
                <div class="addon-market__list-grid">
                    <div>
                        <p>
                            Publish your addons from a GitHub repository of your own, then open a pull request that adds
                            the repository to <code>addons/listings.json</code>. Once it merges, each addon gets a page
                            here built from its README, icon and screenshots.
                        </p>
                        <BrandButton href="/guide/listing-addons" variant="secondary"
                            >Read Listing an addon</BrandButton
                        >
                    </div>
                    <pre class="addon-market__code"><span class="addon-market__code-label">addons/listings.json</span>{
    <span class="k">"listings"</span>: [
<span class="plus">+</span>       {
<span class="plus">+</span>           <span class="k">"repository"</span>: <span class="s">"you/your-addons"</span>,
<span class="plus">+</span>           <span class="k">"addons"</span>: [<span class="s">"homes"</span>]
<span class="plus">+</span>       }
    ]
}</pre>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
.addon-market__column {
    max-width: calc(var(--jsp-page-width) + 2 * var(--jsp-page-gutter));
    padding: 0 var(--jsp-page-gutter);
    margin: 0 auto;
}

.addon-market .site-crumb {
    margin-top: 40px;
}

.addon-market__head {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 24px 56px;
    align-items: end;
}

.addon-market__head h1 {
    margin: 0;
    font-size: clamp(64px, 11vw, 148px);
    font-weight: 800;
    line-height: 0.9;
    letter-spacing: -0.055em;
}

.addon-market__lede {
    max-width: 60ch;
    padding-bottom: 14px;
    margin: 0;
    font-size: 19px;
    line-height: 1.55;
    color: var(--vp-c-text-2);
}

.addon-market__lede a {
    white-space: nowrap;
    color: var(--vp-c-brand-1);
    text-decoration: underline;
    text-underline-offset: 3px;
}

/* The page's one full-width band, in the console's colors. */
.addon-market__band {
    margin-top: 40px;
    color: var(--jsp-term-text);
    background: var(--jsp-deep);
}

.addon-market__band > .addon-market__column {
    padding-top: 32px;
    padding-bottom: 32px;
}

.addon-market__prompt {
    display: flex;
    flex-wrap: wrap;
    gap: 0 14px;
    align-items: center;
    margin-bottom: 18px;
    font: 500 clamp(18px, 2.4vw, 28px) / 1.3 var(--vp-font-family-mono);
}

.addon-market__caret {
    font-weight: 700;
    color: var(--jsp-signal);
}

.addon-market__verb {
    color: var(--jsp-mint);
    white-space: nowrap;
}

.addon-market__field {
    position: relative;
    flex: 1 1 14ch;
    min-width: 0;
}

.addon-market__field input,
.addon-market__ghost {
    width: 100%;
    padding: 6px 0;
    font: inherit;
}

.addon-market__field input {
    position: relative;
    z-index: 1;
    color: var(--jsp-cream);
    caret-color: var(--jsp-signal);
    background: transparent;
    border: 0;
    border-bottom: 2px solid var(--jsp-term-muted);
    border-radius: 0;
    outline: none;
}

.addon-market__field input::placeholder {
    color: var(--jsp-term-muted);
}

.addon-market__field input:focus-visible {
    border-bottom-color: var(--jsp-signal);
}

.addon-market__ghost {
    position: absolute;
    inset: 0;
    overflow: hidden;
    color: var(--jsp-term-muted);
    white-space: pre;
    pointer-events: none;
    border-bottom: 2px solid transparent;
}

.addon-market__ghost b {
    font-weight: inherit;
    visibility: hidden;
}

.addon-market__prompt :deep(.brand-button) {
    --jsp-primary-shadow: var(--jsp-mint);
    padding: 10px 18px;
    font-size: 15px;
}

.addon-market__hint {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 24px;
    justify-content: space-between;
    margin-bottom: 22px;
    font: var(--jsp-label-size) / 1.5 var(--vp-font-family-mono);
    color: var(--jsp-term-muted);
}

.addon-market__hint kbd {
    padding: 0 5px;
    font: inherit;
    color: var(--jsp-cream);
    border: 1px solid var(--jsp-term-muted);
    border-radius: 4px;
}

.addon-market__count {
    color: var(--jsp-mint);
}

.addon-market__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 28px;
    align-items: center;
}

.addon-market__group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

.addon-market__group > span {
    margin-right: 4px;
    font: var(--jsp-label-size) / 1 var(--vp-font-family-mono);
    color: var(--jsp-term-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.addon-market__pill {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    min-height: 36px;
    padding: 0 14px;
    font: 600 14px / 1 var(--vp-font-family-base);
    color: var(--jsp-cream);
    cursor: pointer;
    background: none;
    border: 2px solid color-mix(in srgb, var(--jsp-mint) 55%, var(--jsp-deep));
    border-radius: 999px;
}

.addon-market__pill:hover {
    border-color: var(--jsp-mint);
}

.addon-market__pill[aria-pressed='true'] {
    color: var(--jsp-deep);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
}

.addon-market__pill small {
    font: var(--jsp-label-size) / 1 var(--vp-font-family-mono);
    opacity: 0.8;
}

.addon-market__notice {
    display: flex;
    gap: 12px;
    align-items: baseline;
    margin: 22px 0 18px;
    font-size: 15px;
    color: var(--vp-c-text-2);
}

.addon-market__notice::before {
    flex: none;
    width: 10px;
    height: 10px;
    content: '';
    background: var(--jsp-warning);
    transform: translateY(1px);
}

.addon-market__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--jsp-gap);
    padding: 0;
    margin: 0;
    list-style: none;
}

.addon-market__grid > li {
    display: flex;
    min-width: 0;
}

.addon-card {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    color: var(--vp-c-text-1);
    text-decoration: none;
    background: var(--vp-c-bg-soft);
    border: 1px solid var(--vp-c-divider);
    border-radius: var(--jsp-radius-panel);
}

.addon-card:hover {
    border-color: var(--vp-c-text-1);
}

.addon-card:hover .addon-card__title {
    text-decoration: underline;
    text-decoration-thickness: 2px;
}

.addon-card__arrow {
    position: absolute;
    top: 18px;
    right: 18px;
    width: 18px;
    height: 18px;
    color: var(--vp-c-text-3);
}

.addon-card__top {
    display: flex;
    gap: 14px;
    align-items: center;
    padding-right: 20px;
}

.addon-card__title {
    margin: 0;
    font-size: 23px;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.04em;
    text-underline-offset: 4px;
}

.addon-card__publisher {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 4px;
    overflow-wrap: anywhere;
    font: var(--jsp-label-size) / 1.3 var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.addon-card__description {
    flex: 1;
    margin: 0;
    font-size: 16px;
    line-height: 1.5;
}

.addon-card__foot {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    font: var(--jsp-label-size) / 1.3 var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
    border-top: 1px solid var(--vp-c-divider);
}

.addon-card__foot code {
    font: inherit;
    color: var(--vp-c-text-1);
    background: none;
}

.addon-card__id-part {
    white-space: nowrap;
}

.addon-card__state {
    display: inline-flex;
    flex: none;
    gap: 6px;
    align-items: center;
}

.addon-card__state::before {
    width: 8px;
    height: 8px;
    content: '';
}

.addon-card__state.is-deprecated {
    color: var(--vp-c-text-1);
}

.addon-card__state.is-deprecated::before {
    background: var(--jsp-signal);
}

.addon-card__state.is-newer::before {
    background: var(--jsp-warning);
}

.addon-card.is-deprecated {
    background: transparent;
    border-style: dashed;
}

.addon-card.is-deprecated :deep(.addon-icon) {
    opacity: 0.7;
    filter: grayscale(1);
}

.addon-card.is-deprecated .addon-card__description {
    color: var(--vp-c-text-2);
}

.addon-market__empty {
    display: block !important;
    grid-column: 1 / -1;
    padding: 40px 24px;
    border: 2px dashed var(--vp-c-divider);
    border-radius: var(--jsp-radius-panel);
}

.addon-market__empty p {
    margin: 0 0 6px;
}

.addon-market__empty strong {
    font-size: 22px;
    letter-spacing: -0.03em;
}

.addon-market__empty a,
.addon-market__list-yours a:not(.brand-button) {
    color: var(--vp-c-brand-1);
}

/* A second-level section: a short solid bar over a display heading. */
.addon-market__section-head {
    margin: 72px 0 20px;
}

.addon-market__section-head::before {
    display: block;
    width: 36px;
    height: 5px;
    margin-bottom: 18px;
    content: '';
    background: var(--jsp-state);
}

.addon-market__section-head h2 {
    margin: 0;
    font-size: 34px;
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.045em;
    border: 0;
}

.addon-market__list-yours {
    margin-bottom: 96px;
}

.addon-market__list-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 24px 48px;
    align-items: start;
}

.addon-market__list-grid p {
    max-width: 52ch;
    margin: 0 0 18px;
    font-size: 17px;
}

.addon-market__list-grid p code {
    padding: 2px 6px;
    font-size: 0.86em;
    background: var(--vp-c-brand-soft);
    border-radius: 5px;
}

.addon-market__code {
    padding: 18px 20px;
    margin: 0;
    overflow-x: auto;
    font: 14px / 1.6 var(--vp-font-family-mono);
    color: var(--vp-code-block-color);
    background: var(--vp-code-block-bg);
    border: 1px solid var(--vp-c-divider);
    border-radius: var(--jsp-radius-panel);
}

.addon-market__code-label {
    display: block;
    margin-bottom: 8px;
    font-size: var(--jsp-label-size);
    color: var(--jsp-term-muted);
}

.addon-market__code .k {
    color: var(--jsp-accent);
}

.addon-market__code .s {
    color: var(--jsp-mint);
}

.addon-market__code .plus {
    color: var(--jsp-accent);
    user-select: none;
}

@media (max-width: 1000px) {
    .addon-market__grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 760px) {
    .addon-market__head {
        grid-template-columns: 1fr;
        gap: 14px;
    }

    .addon-market__lede {
        padding-bottom: 0;
        font-size: 17px;
    }

    .addon-market__grid,
    .addon-market__list-grid {
        grid-template-columns: 1fr;
    }

    .addon-market__prompt {
        gap: 4px 12px;
    }

    .addon-market__verb {
        flex-basis: calc(100% - 2ch - 12px);
    }

    .addon-market__field {
        flex-basis: 100%;
    }

    .addon-market__prompt :deep(.brand-button) {
        flex: 1;
        margin-top: 10px;
    }

    .addon-market__filters {
        gap: 14px;
    }

    .addon-market__code {
        font-size: var(--jsp-label-size);
        overflow-wrap: anywhere;
        white-space: pre-wrap;
    }
}
</style>
