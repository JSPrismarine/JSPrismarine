<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, ref } from 'vue';

import type { ReleaseSummary } from '../../../releases.data.mts';
import { releaseAnchor } from '../releases';
import RouteLine, { type RouteStop } from './RouteLine.vue';

/**
 * The release history as a route to ride. Each stop is a feature release, oldest first, and its ring grows
 * with how much the release changed; a diamond marks one that breaks something. Past the newest release a
 * dashed stop stands for the changes already merged and waiting for the next one. Pointing at a stop, or
 * walking the line with the arrow keys, sends the rider there and shows that release under the line.
 *
 * Patch releases are left out: they fix a stop and do not make a new one.
 */
const props = withDefaults(
    defineProps<{
        /** The newest versions in brief, newest first. */
        history: readonly ReleaseSummary[];
        /** The full changelog, for a release the releases page no longer shows in full. */
        changelogUrl?: string;
        /** Changesets merged since the newest release. */
        pending?: number;
        /** Where those waiting changesets can be read. */
        pendingUrl?: string;
        /** The most feature releases to show. The line shows fewer when the history holds fewer. */
        count?: number;
    }>(),
    { changelogUrl: '', pending: 0, pendingUrl: '', count: 5 }
);

/** The feature releases on the line, oldest first. */
const shown = computed(() =>
    props.history
        .filter((release) => release.kind !== 'patch')
        .slice(0, props.count)
        .toReversed()
);
/** The largest number of changes any stop holds, which the largest ring stands for. */
const most = computed(() => Math.max(1, props.pending, ...shown.value.map((release) => release.changes)));
/** A ring between a plain one and nearly twice that, by the square root, so its area follows the count. */
const sizeOf = (changes: number) => 0.9 + 0.8 * Math.sqrt(changes / most.value);

const stops = computed<RouteStop[]>(() => [
    ...shown.value.map((release) => ({
        label: release.date ?? 'Release',
        title: `v${release.version}`,
        flagged: release.breaking > 0,
        size: sizeOf(release.changes)
    })),
    ...(props.pending ? [{ label: 'Up next', title: 'Unreleased', pending: true, size: sizeOf(props.pending) }] : [])
]);

/** The stop being read. It starts on the newest release. */
const selected = ref(shown.value.length - 1);
const release = computed(() => shown.value[selected.value]);
/** A release's notes: on the releases page while it is shown there in full, in the changelog after that. */
const notesUrl = computed(() => {
    if (!release.value) return '';
    return release.value.shownInFull || !props.changelogUrl
        ? withBase(`/releases#${releaseAnchor(release.value.version)}`)
        : props.changelogUrl;
});
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
</script>

<template>
    <div class="release-line">
        <RouteLine v-model="selected" :stops="stops" tone="accent" selectable />
        <!-- The live region stays mounted while its content changes, so a screen reader hears each change. -->
        <div aria-live="polite">
            <Transition name="release-line" mode="out-in">
                <div v-if="release" :key="release.version" class="release-line__detail">
                    <div class="release-line__head">
                        <p class="release-line__version">v{{ release.version }}</p>
                        <p class="release-line__facts">
                            <span>{{ plural(release.changes, 'change') }}</span>
                            <span v-if="release.breaking" class="is-breaking">{{ release.breaking }} breaking</span>
                            <span v-if="release.dependencyUpdates">{{
                                plural(release.dependencyUpdates, 'dependency update')
                            }}</span>
                        </p>
                    </div>
                    <div class="release-line__body">
                        <ul>
                            <li v-for="highlight in release.highlights" :key="highlight">{{ highlight }}</li>
                        </ul>
                        <a :href="notesUrl">Read the v{{ release.version }} notes</a>
                    </div>
                </div>
                <div v-else key="next" class="release-line__detail">
                    <div class="release-line__head">
                        <p class="release-line__version">Up next</p>
                        <p class="release-line__facts">
                            <span>{{ plural(pending, 'change') }} waiting</span>
                        </p>
                    </div>
                    <div class="release-line__body">
                        <p>
                            These are merged and will ship with the next release. Each one is a changeset: a short note
                            on what changed and which packages it touches.
                        </p>
                        <a v-if="pendingUrl" :href="pendingUrl">Read the waiting changesets</a>
                    </div>
                </div>
            </Transition>
        </div>
    </div>
</template>

<style scoped>
/* The line sizes its own detail, so it lays out the same in a tile, a doc page or anywhere else. */
.release-line {
    container-type: inline-size;
    display: grid;
    gap: 26px;
    /* Room above the line for the largest ring and the rider. */
    padding-top: 10px;
}

/* The stop being read: its version as a figure, what it holds, and the first of what it brought. */
.release-line__detail {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
    gap: 16px clamp(20px, 4cqw, 48px);
    align-items: start;
    min-height: 168px;
    padding-top: 22px;
    border-top: 2px solid color-mix(in srgb, currentColor 22%, transparent);
}

.release-line__version {
    margin: 0 0 12px;
    font-size: clamp(44px, 9cqw, 84px);
    font-weight: 800;
    line-height: 0.86;
    /* A figure with dots in it opens its tracking, so the dots show. */
    letter-spacing: -0.03em;
}

.release-line__facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
}

.release-line__facts span {
    padding: 4px 10px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border: 2px solid color-mix(in srgb, currentColor 45%, transparent);
    border-radius: 99px;
}

.release-line__facts .is-breaking {
    color: var(--jsp-ink);
    background: var(--jsp-signal);
    border-color: var(--jsp-signal);
}

.release-line__body {
    display: grid;
    gap: 14px;
    justify-items: start;
    font-size: 15px;
    line-height: 1.45;
    color: color-mix(in srgb, currentColor 82%, var(--jsp-deep));
}

.release-line__body ul {
    display: grid;
    gap: 8px;
    padding: 0;
    margin: 0;
    list-style: none;
}

/* A long first sentence stops at two lines; the notes have the rest. */
.release-line__body li {
    display: -webkit-box;
    padding-left: 16px;
    margin: 0;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    background: linear-gradient(var(--jsp-accent), var(--jsp-accent)) 0 0.5em / 8px 8px no-repeat;
}

.release-line__body p {
    margin: 0;
}

.release-line__body a {
    font-weight: 800;
    color: var(--jsp-cream);
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
}

/* The detail changes hands with a short slide, in the direction the eye is already reading. */
.release-line-enter-active {
    transition:
        opacity 0.2s,
        translate 0.45s var(--jsp-spring);
}

.release-line-leave-active {
    transition: opacity 0.12s;
}

.release-line-enter-from {
    opacity: 0;
    translate: 14px 0;
}

.release-line-leave-to {
    opacity: 0;
}

@container (max-width: 640px) {
    .release-line__detail {
        grid-template-columns: minmax(0, 1fr);
        min-height: 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .release-line-enter-active,
    .release-line-leave-active {
        transition: none;
    }
}
</style>
