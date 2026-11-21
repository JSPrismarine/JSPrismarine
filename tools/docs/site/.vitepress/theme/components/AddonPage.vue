<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, ref } from 'vue';

import AddonIcon from '../AddonIcon.vue';
import type { MarketAddonPage } from '../addonMarket';
import { installCommand, releaseLabel, tagLabel } from '../addonMarket';
import BrandButton from './BrandButton.vue';
import PrismMark from './PrismMark.vue';

/**
 * One addon's page in the marketplace: its install command with Copy, the versions it has, its
 * screenshots and its README. A community addon's page says it is listed, not reviewed, and a
 * deprecated addon's page opens with why.
 */
const props = defineProps<{ addon: MarketAddonPage }>();
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

const command = computed(() => installCommand(props.addon.id));
const released = computed(() =>
    releaseLabel(props.addon.versions.find(({ version }) => version === props.addon.version))
);
const shortHash = computed(() => `${props.addon.sha256.slice(0, 4)}…${props.addon.sha256.slice(-4)}`);
const deprecatedBy = computed(() => {
    const by = props.addon.deprecated?.by;
    if (by === 'author') return 'Its author says';
    if (by === 'maintainer') return "JSPrismarine's maintainers say";
    return undefined;
});

async function copy() {
    try {
        await navigator.clipboard.writeText(command.value);
    } catch {
        return;
    }
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
        copied.value = false;
    }, 2000);
}
</script>

<template>
    <div class="addon-page" :class="{ 'is-deprecated': addon.deprecated }">
        <div class="addon-page__column">
            <nav class="site-crumb" aria-label="Breadcrumb">
                <ol>
                    <li><a :href="withBase('/addons/')">Addons</a></li>
                    <li aria-current="page">{{ addon.title }}</li>
                </ol>
            </nav>
            <div class="addon-page__head">
                <AddonIcon class="addon-page__icon" :src="addon.icon" :title="addon.title" :size="132" />
                <div>
                    <h1>{{ addon.title }}</h1>
                    <p class="addon-page__lede">{{ addon.description }}</p>
                    <div class="addon-page__byline">
                        <span class="addon-page__publisher">
                            <template v-if="addon.firstParty"><PrismMark :size="16" />JSPrismarine</template>
                            <template v-else>{{ addon.repository }}</template>
                        </span>
                        <a :href="addon.sourceUrl">{{
                            addon.firstParty ? `addons/${addon.name} on GitHub` : 'Source on GitHub'
                        }}</a>
                        <a v-for="tag in addon.tags" :key="tag" :href="withBase(`/addons/?tag=${tag}`)">{{
                            tagLabel(tag)
                        }}</a>
                    </div>
                </div>
            </div>

            <div v-if="addon.deprecated" class="addon-page__deprecation" role="note">
                <strong>Deprecated</strong>
                <p>
                    <template v-if="deprecatedBy"
                        >{{ deprecatedBy }}: “{{ addon.deprecated.reason }}”{{ ' ' }}</template
                    >
                    <template v-else>{{ addon.deprecated.reason }}{{ ' ' }}</template>
                    <template v-if="addon.deprecated.replacedByPath">
                        <a :href="withBase(addon.deprecated.replacedByPath)">{{ addon.deprecated.replacedByTitle }}</a>
                        replaces it.
                    </template>
                    <template v-else-if="addon.deprecated.replacedBy">
                        <code>{{ installCommand(addon.deprecated.replacedBy) }}</code> installs its replacement.
                    </template>
                    You can still install this one{{
                        addon.deprecated.by === 'author' ? ', and the console warns you when you do' : ''
                    }}.
                </p>
            </div>
        </div>

        <section class="addon-page__band" aria-label="Install">
            <div class="addon-page__column">
                <div class="addon-page__install">
                    <p class="addon-page__prompt">
                        <span class="addon-page__caret" aria-hidden="true">&gt;</span>
                        <span class="addon-page__verb">addon install</span>
                        <span class="addon-page__id">{{ addon.id }}</span>
                    </p>
                    <BrandButton :variant="addon.deprecated ? 'outline' : 'primary'" @click="copy">
                        <span aria-live="polite">{{ copied ? 'Copied' : 'Copy command' }}</span>
                    </BrandButton>
                </div>
                <dl class="addon-page__figures">
                    <div>
                        <dt>Version</dt>
                        <dd>{{ addon.version }}</dd>
                    </div>
                    <div>
                        <dt>Runs on</dt>
                        <dd>
                            JSPrismarine {{ addon.minServer }} <small>or newer</small>
                            <small v-if="addon.needsNewerServer">, not released yet</small>
                        </dd>
                    </div>
                    <div v-if="addon.license">
                        <dt>License</dt>
                        <dd>{{ addon.license }}</dd>
                    </div>
                </dl>
            </div>
        </section>

        <div class="addon-page__column">
            <div v-if="!addon.firstParty" class="addon-page__unreviewed" role="note">
                <span class="addon-page__mark" aria-hidden="true" />
                <strong>Listed, not reviewed</strong>
                <p>
                    This addon comes from <a :href="addon.sourceUrl">{{ addon.repository }}</a>. JSPrismarine checks
                    that the download matches the hash its index lists, not what its scripts do. They run in the script
                    host's sandbox, with the Script API's reach and nothing more.
                </p>
            </div>

            <div class="addon-page__body">
                <article class="addon-page__readme">
                    <div v-if="addon.screenshots.length" class="addon-page__shots">
                        <figure v-for="shot in addon.screenshots" :key="shot.src">
                            <img :src="withBase(shot.src)" :alt="shot.alt" loading="lazy" />
                            <figcaption>{{ shot.alt }}</figcaption>
                        </figure>
                    </div>
                    <!-- Rendered by the docs build with raw HTML off; see tools/docs/addonReadme.mts. -->
                    <div v-if="addon.readmeHtml" class="vp-doc addon-page__readme-text" v-html="addon.readmeHtml" />
                    <p v-if="addon.readmeHtml" class="addon-page__source">
                        From the addon's README.md, version {{ addon.version }}.
                    </p>
                </article>

                <aside class="addon-page__rail" aria-label="About this addon">
                    <section>
                        <h2>Details</h2>
                        <dl class="addon-page__facts">
                            <div>
                                <dt>Published by</dt>
                                <dd>
                                    <a :href="`https://github.com/${addon.repository}`">{{ addon.repository }}</a>
                                </dd>
                            </div>
                            <div v-if="addon.authors.length">
                                <dt>Written by</dt>
                                <dd>{{ addon.authors.join(', ') }}</dd>
                            </div>
                            <div>
                                <dt>Released</dt>
                                <dd>{{ released }}</dd>
                            </div>
                            <div>
                                <dt>Pack SHA-256</dt>
                                <dd>
                                    <code :title="addon.sha256">{{ shortHash }}</code>
                                </dd>
                            </div>
                        </dl>
                    </section>
                    <section>
                        <h2>Versions</h2>
                        <ul class="addon-page__versions">
                            <li v-for="(entry, i) in addon.versions" :key="entry.version">
                                <code>{{ entry.version }}</code>
                                <span>{{ releaseLabel(entry) }}{{ i === 0 ? ', newest' : '' }}</span>
                            </li>
                        </ul>
                        <p class="addon-page__small">
                            Pin one with a range, such as <code>{{ addon.id }}@~{{ addon.version }}</code
                            >.
                        </p>
                    </section>
                    <section>
                        <h2>Problems</h2>
                        <p class="addon-page__small">
                            Report them on <a :href="addon.issuesUrl">{{ addon.repository }}</a>.
                        </p>
                    </section>
                </aside>
            </div>
        </div>
    </div>
</template>

<style scoped>
.addon-page {
    padding-bottom: 96px;
}

.addon-page__column {
    max-width: calc(var(--jsp-page-width) + 2 * var(--jsp-page-gutter));
    padding: 0 var(--jsp-page-gutter);
    margin: 0 auto;
}

.addon-page .site-crumb {
    margin-top: 40px;
}

.addon-page__head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 20px 32px;
    align-items: center;
}

.addon-page__head :deep(.addon-icon) {
    border-radius: var(--jsp-radius-panel);
}

.addon-page.is-deprecated .addon-page__head :deep(.addon-icon) {
    opacity: 0.75;
    filter: grayscale(1);
}

.addon-page__head h1 {
    margin: 0;
    font-size: clamp(52px, 8vw, 112px);
    font-weight: 800;
    line-height: 0.9;
    letter-spacing: -0.055em;
    overflow-wrap: anywhere;
}

.addon-page__lede {
    max-width: 60ch;
    margin: 14px 0 0;
    font-size: 19px;
    line-height: 1.55;
    color: var(--vp-c-text-2);
}

.addon-page__byline {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    align-items: center;
    margin-top: 16px;
    font: var(--jsp-label-size) / 1.4 var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.addon-page__publisher {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    color: var(--vp-c-text-1);
}

.addon-page a {
    color: var(--vp-c-brand-1);
    text-decoration: underline;
    text-underline-offset: 3px;
}

.addon-page :deep(.brand-button) {
    text-decoration: none;
}

.addon-page__deprecation {
    padding: 16px 20px 16px 22px;
    margin-top: 28px;
    background: var(--vp-c-bg-soft);
    border-left: 6px solid var(--jsp-signal);
    border-radius: 0 var(--jsp-radius-panel) var(--jsp-radius-panel) 0;
}

.addon-page__deprecation strong {
    display: block;
    font-size: 20px;
    letter-spacing: -0.03em;
}

.addon-page__deprecation p {
    max-width: 70ch;
    margin: 4px 0 0;
    font-size: 16px;
}

/* The page's one full-width band: the install command, in the console's colors. */
.addon-page__band {
    margin-top: 40px;
    color: var(--jsp-term-text);
    background: var(--jsp-deep);
}

.addon-page__band > .addon-page__column {
    padding-top: 32px;
    padding-bottom: 32px;
}

.addon-page__install {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px 24px;
    align-items: center;
}

.addon-page__prompt {
    display: flex;
    flex-wrap: wrap;
    gap: 0 14px;
    align-items: center;
    margin: 0;
    font: 500 clamp(18px, 2.4vw, 28px) / 1.3 var(--vp-font-family-mono);
}

.addon-page__caret {
    font-weight: 700;
    color: var(--jsp-signal);
}

.addon-page__verb {
    color: var(--jsp-mint);
    white-space: nowrap;
}

.addon-page__id {
    overflow-wrap: anywhere;
    color: var(--jsp-cream);
}

.addon-page__band :deep(.brand-button) {
    --jsp-primary-shadow: var(--jsp-mint);
    padding: 10px 18px;
    font-size: 15px;
}

.addon-page__figures {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 40px;
    padding-top: 20px;
    margin: 24px 0 0;
    border-top: 1px solid color-mix(in srgb, var(--jsp-mint) 22%, transparent);
}

.addon-page__figures div {
    display: grid;
    gap: 4px;
}

.addon-page__figures dt {
    font: var(--jsp-label-size) / 1 var(--vp-font-family-mono);
    color: var(--jsp-term-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.addon-page__figures dd {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--jsp-cream);
}

.addon-page__figures small {
    font-size: 15px;
    font-weight: 500;
    color: var(--jsp-mint);
}

.addon-page__unreviewed {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 14px;
    align-items: start;
    padding: 18px 20px;
    margin-top: 28px;
    color: var(--jsp-ink);
    background: var(--jsp-warning);
    border-radius: var(--jsp-radius-panel);
}

.addon-page__unreviewed strong {
    font-size: 18px;
    letter-spacing: -0.02em;
}

.addon-page__unreviewed p {
    grid-column: 2;
    margin: 0;
    font-size: 15px;
    line-height: 1.5;
}

.addon-page__unreviewed a {
    color: var(--jsp-ink);
}

.addon-page__mark {
    grid-row: span 2;
    width: 12px;
    height: 12px;
    margin-top: 7px;
    background: var(--jsp-ink);
}

.addon-page__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 48px;
}

.addon-page__readme {
    min-width: 0;
    max-width: 70ch;
}

.addon-page__shots {
    display: grid;
    gap: var(--jsp-gap);
    margin-top: 40px;
}

.addon-page__shots figure {
    margin: 0;
}

.addon-page__shots img {
    display: block;
    width: 100%;
    background: var(--jsp-forest);
    border: 1px solid var(--vp-c-divider);
    border-radius: var(--jsp-radius-panel);
}

.addon-page__shots figcaption,
.addon-page__source {
    margin-top: 8px;
    font: var(--jsp-label-size) / 1.4 var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.addon-page__source {
    margin: 40px 0 0;
    color: var(--vp-c-text-3);
}

.addon-page__readme-text {
    margin-top: 40px;
}

/* The README's code blocks sit on the terminal surface, as the site's own do. */
.addon-page__readme-text :deep(pre) {
    padding: 18px 20px;
    margin: 16px 0;
    overflow-x: auto;
    font: 14px / 1.6 var(--vp-font-family-mono);
    color: var(--vp-code-block-color);
    background: var(--vp-code-block-bg);
    border-radius: var(--jsp-radius-panel);
}

.addon-page__readme-text :deep(pre code) {
    padding: 0;
    font-size: inherit;
    color: inherit;
    background: none;
}

/* The README's sections take the site's section heading: a short solid bar over the title. */
.addon-page__readme-text :deep(h2) {
    padding-top: 0;
    margin: 72px 0 20px;
    font-size: 34px;
    line-height: 1.05;
    letter-spacing: -0.045em;
    border-top: 0;
}

.addon-page__readme-text :deep(h2)::before {
    display: block;
    width: 36px;
    height: 5px;
    margin-bottom: 18px;
    content: '';
    background: var(--jsp-state);
}

.addon-page__readme-text :deep(:is(p, li)) {
    font-size: 17px;
    line-height: 1.7;
}

.addon-page__readme-text :deep(img) {
    border-radius: var(--jsp-radius-panel);
}

.addon-page__rail {
    position: sticky;
    top: calc(var(--vp-nav-height) + 24px);
    display: grid;
    gap: 28px;
    align-self: start;
    padding-top: 72px;
}

.addon-page__rail h2 {
    margin: 0 0 10px;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.03em;
}

.addon-page__facts {
    margin: 0;
}

.addon-page__facts div {
    display: grid;
    gap: 2px;
    padding: 10px 0;
    border-bottom: 1px solid var(--vp-c-divider);
}

.addon-page__facts dt {
    font: var(--jsp-label-size) / 1.3 var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.addon-page__facts dd {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 15px;
}

.addon-page__rail code {
    font-family: var(--vp-font-family-mono);
    font-size: var(--jsp-label-size);
}

.addon-page__versions {
    padding: 0;
    margin: 0;
    list-style: none;
}

.addon-page__versions li {
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding: 9px 0;
    font-size: 15px;
    border-bottom: 1px solid var(--vp-c-divider);
}

.addon-page__versions code {
    font-weight: 700;
}

.addon-page__versions span {
    font: var(--jsp-label-size) / 1.6 var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.addon-page__small {
    margin: 10px 0 0;
    font-size: 14px;
    color: var(--vp-c-text-2);
}

.addon-page__small code {
    overflow-wrap: anywhere;
}

@media (max-width: 900px) {
    .addon-page__body {
        grid-template-columns: 1fr;
        gap: 0;
    }

    .addon-page__rail {
        position: static;
        padding-top: 48px;
    }
}

@media (max-width: 760px) {
    .addon-page__head {
        grid-template-columns: 1fr;
    }

    .addon-page__head :deep(.addon-icon) {
        --addon-icon-size: 88px !important;
    }

    .addon-page__install {
        grid-template-columns: 1fr;
    }

    .addon-page__band :deep(.brand-button) {
        width: 100%;
    }

    .addon-page__id {
        flex-basis: 100%;
    }

    .addon-page__figures {
        gap: 14px 28px;
    }

    .addon-page__figures dd {
        font-size: 17px;
    }

    .addon-page__readme-text :deep(h2) {
        font-size: 28px;
    }
}
</style>
