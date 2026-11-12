<script setup lang="ts">
import { ref } from 'vue';

import type { Release, ReleaseChange } from '../../../releases.data.mts';
import { releaseAnchor } from '../releases';

/** Notes listed per group before its "show all" button; some releases carry hundreds. */
const SHOWN = 6;

defineProps<{ releases: Release[] }>();
const expanded = ref(new Set<string>());

/** New features first, then fixes, leaving out empty groups. */
function groups(release: Release): { title: string; changes: ReleaseChange[] }[] {
    return [
        { title: 'New', changes: [...release.major, ...release.minor] },
        { title: 'Fixes and changes', changes: release.patch }
    ].filter(({ changes }) => changes.length);
}

/** One line per release: how many changes of each kind, and how many break something. */
function summary(release: Release) {
    const changes = [...release.major, ...release.minor, ...release.patch];
    const breaking = changes.filter((change) => change.breaking).length;
    return [
        ...groups(release).map(({ title, changes: group }) => `${group.length} ${title.toLowerCase()}`),
        ...(breaking ? [`${breaking} breaking`] : [])
    ].join(' · ');
}

function toggle(key: string) {
    const next = new Set(expanded.value);
    if (!next.delete(key)) next.add(key);
    expanded.value = next;
}
</script>

<template>
    <div class="release-notes">
        <article v-for="release in releases" :key="release.version" class="release">
            <header class="release__header">
                <!-- The id sits on the heading, so the page outline lists each release. -->
                <h2 :id="releaseAnchor(release.version)">
                    <a :href="`#${releaseAnchor(release.version)}`">v{{ release.version }}</a>
                </h2>
                <span class="release__kind" :class="`is-${release.kind}`">{{ release.kind }}</span>
                <time v-if="release.date" :datetime="release.date">{{ release.date }}</time>
                <p class="release__summary">{{ summary(release) }}</p>
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
    font-weight: 800;
    line-height: 1;
    /* A version has dots, which tighter tracking would close up. */
    letter-spacing: -0.03em;
    border: 0;
}

.release__header h2 a {
    color: inherit;
    text-decoration: none;
}

.release__kind {
    padding: 3px 10px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-radius: 99px;
}

.release__kind.is-major {
    color: var(--jsp-ink);
    background: var(--jsp-signal);
}

.release__kind.is-minor {
    color: var(--jsp-on-accent);
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
    color: var(--vp-c-text-2);
}

.release__group h3 {
    margin: 24px 0 8px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-text-1);
    text-transform: uppercase;
    letter-spacing: 0.12em;
}

.release__group ul {
    display: grid;
    gap: 14px;
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

/* A rule between changes gives a long release a line to scan down. */
.release__group li + li {
    padding-top: 14px;
    border-top: 1px solid var(--vp-c-divider);
}

.release__text {
    min-width: 0;
    overflow-wrap: anywhere;
}

/* Release notes name many identifiers; mono marks them without a chip on every one. They keep the
   body color, so accent still means a link. */
.release__text :deep(:not(pre) > code) {
    padding: 0;
    font-size: 0.9em;
    color: var(--vp-c-text-1);
    background: none;
}

/* A paragraph that breaks or removes something carries a signal rule, so upgraders find it first. */
.release__text :deep(.release__breaking) {
    padding-left: 12px;
    margin: 8px 0;
    border-left: 3px solid var(--jsp-signal);
}

/* A long note's body folds behind a quiet label under its lead sentence. */
.release__text :deep(.release__details) {
    margin: 0 0 8px;
}

/* Every breaking note folds behind the same label, whatever word its text starts with; a long body's
   "Details" uses the same control, in the muted color. */
.release__text :deep(:is(.release__breaking, .release__details) > summary) {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 28px;
    margin: 0;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-text-1);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    list-style: none;
}

.release__text :deep(:is(.release__breaking, .release__details) > summary::-webkit-details-marker) {
    display: none;
}

.release__text :deep(:is(.release__breaking, .release__details) > summary)::after {
    width: 0;
    height: 0;
    content: '';
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-left: 7px solid var(--jsp-accent);
    transition: transform 0.15s;
}

.release__text :deep(:is(.release__breaking, .release__details)[open] > summary)::after {
    transform: rotate(90deg);
}

@media (max-width: 640px) {
    .release__text :deep(:is(.release__breaking, .release__details) > summary) {
        min-height: var(--jsp-target);
    }
}

.release__text :deep(.release__details > summary) {
    color: var(--vp-c-text-2);
}

.release__text :deep(:is(.release__breaking, .release__details) > p) {
    margin: 4px 0 0;
}

.release__summary {
    flex-basis: 100%;
    margin: 0;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.release__text :deep(p) {
    margin: 0 0 8px;
}

.release__commit {
    font: var(--jsp-label-size) var(--vp-font-family-mono);
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
