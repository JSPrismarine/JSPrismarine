<script setup lang="ts">
import { ref } from 'vue';

import type { Release, ReleaseChange } from '../../../releases.data.mts';

/** Notes listed per group before its "show all" button; some releases carry hundreds. */
const SHOWN = 6;

defineProps<{ releases: Release[] }>();
const expanded = ref(new Set<string>());

function anchor(version: string) {
    return `v${version.replaceAll('.', '-')}`;
}

/** New features first, then fixes, leaving out empty groups. */
function groups(release: Release): { title: string; changes: ReleaseChange[] }[] {
    return [
        { title: 'New', changes: [...release.major, ...release.minor] },
        { title: 'Fixes and changes', changes: release.patch }
    ].filter(({ changes }) => changes.length);
}

function toggle(key: string) {
    const next = new Set(expanded.value);
    if (!next.delete(key)) next.add(key);
    expanded.value = next;
}
</script>

<template>
    <div class="release-notes">
        <article v-for="release in releases" :id="anchor(release.version)" :key="release.version" class="release">
            <header class="release__header">
                <h2>
                    <a :href="`#${anchor(release.version)}`">v{{ release.version }}</a>
                </h2>
                <span class="release__kind" :class="`is-${release.kind}`">{{ release.kind }}</span>
                <time v-if="release.date" :datetime="release.date">{{ release.date }}</time>
            </header>

            <section v-for="group in groups(release)" :key="group.title" class="release__group">
                <h3>
                    {{ group.title }} <span>{{ group.changes.length }}</span>
                </h3>
                <ul>
                    <li
                        v-for="change in expanded.has(`${release.version}:${group.title}`)
                            ? group.changes
                            : group.changes.slice(0, SHOWN)"
                        :key="change.html"
                    >
                        <div class="release__text" v-html="change.html"></div>
                        <a v-if="change.commit" class="release__commit" :href="change.commit.url">{{
                            change.commit.sha
                        }}</a>
                    </li>
                </ul>
                <button
                    v-if="group.changes.length > SHOWN"
                    type="button"
                    class="release__more"
                    :aria-expanded="expanded.has(`${release.version}:${group.title}`)"
                    @click="toggle(`${release.version}:${group.title}`)"
                >
                    {{
                        expanded.has(`${release.version}:${group.title}`)
                            ? 'Show fewer'
                            : `Show all ${group.changes.length}`
                    }}
                </button>
            </section>

            <p v-if="release.dependencyUpdates" class="release__deps">
                Plus {{ release.dependencyUpdates }} dependency update{{ release.dependencyUpdates === 1 ? '' : 's' }}.
            </p>
        </article>
    </div>
</template>

<style scoped>
.release {
    padding: 28px 0;
    border-top: 2px solid var(--vp-c-divider);
}

.release__header {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: baseline;
}

.release__header h2 {
    padding: 0;
    margin: 0;
    font-size: 36px;
    line-height: 1;
    border: 0;
}

.release__header h2 a {
    color: inherit;
    text-decoration: none;
}

.release__kind {
    padding: 3px 10px;
    font: 700 11px var(--vp-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-radius: 99px;
}

.release__kind.is-major {
    color: var(--jsp-ink);
    background: var(--jsp-signal);
}

.release__kind.is-minor {
    color: var(--jsp-forest);
    background: var(--jsp-accent);
}

.release__kind.is-patch {
    color: var(--vp-c-text-2);
    border: 1.5px solid var(--vp-c-divider);
}

.release time {
    font: 13px var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.release__group h3 span {
    margin-left: 6px;
    opacity: 0.6;
}

.release__group h3 {
    margin: 24px 0 8px;
    font: 700 12px var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
    text-transform: uppercase;
    letter-spacing: 0.12em;
}

.release__group ul {
    display: grid;
    gap: 12px;
    padding: 0;
    margin: 0;
    list-style: none;
}

.release__group li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    margin: 0;
}

.release__text {
    min-width: 0;
    overflow-wrap: anywhere;
}

.release__text :deep(p) {
    margin: 0 0 8px;
}

.release__commit {
    font: 12px var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.release__more {
    margin-top: 14px;
    padding: 6px 14px;
    font-size: 14px;
    font-weight: 700;
    border: 2px solid currentColor;
    border-radius: 99px;
}

.release__deps {
    margin: 18px 0 0;
    font-size: 14px;
    color: var(--vp-c-text-2);
}

@media (max-width: 640px) {
    .release__group li {
        grid-template-columns: minmax(0, 1fr);
        gap: 2px;
    }
}
</style>
