<script lang="ts">
/** Commits already fetched, so closing and reopening a row does not spend the API's rate limit again. */
const cache = new Map<string, Commit[]>();

interface Commit {
    date: string;
    message: string;
    sha: string;
    url: string;
}

interface GitHubCommit {
    commit: { author: { date: string } | null; message: string };
    html_url: string;
    sha: string;
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ login: string; repo: string }>();

const COMMIT_LIMIT = 250;
const PAGE_SIZE = 100;
const ROW_HEIGHT = 44;
const VIEWPORT_ROWS = 7;
const OVERSCAN = 4;

const commits = ref<Commit[]>(cache.get(props.login) ?? []);
const loading = ref(!cache.has(props.login));
const failed = ref(false);
const scrollTop = ref(0);
const abort = new AbortController();
const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

const allCommitsUrl = computed(
    () => `https://github.com/${props.repo}/commits?author=${encodeURIComponent(props.login)}`
);
const viewportHeight = computed(() => Math.min(commits.value.length, VIEWPORT_ROWS) * ROW_HEIGHT);
const first = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN));
const last = computed(() =>
    Math.min(commits.value.length, Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT) + OVERSCAN)
);
const visible = computed(() => commits.value.slice(first.value, last.value));

function onScroll(event: Event) {
    if (event.currentTarget instanceof HTMLElement) scrollTop.value = event.currentTarget.scrollTop;
}

async function load() {
    const collected: Commit[] = [];
    for (let page = 1; collected.length < COMMIT_LIMIT; page++) {
        const response = await fetch(
            `https://api.github.com/repos/${props.repo}/commits?author=${encodeURIComponent(props.login)}&per_page=${PAGE_SIZE}&page=${page}`,
            { headers: { Accept: 'application/vnd.github+json' }, signal: abort.signal }
        );
        if (!response.ok) throw new Error(`GitHub responded with ${response.status}`);
        // GitHub's documented response shape.
        const body: GitHubCommit[] = await response.json();
        collected.push(
            ...body.map(({ sha, html_url, commit }) => ({
                sha,
                url: html_url,
                message: commit.message.split('\n', 1)[0],
                date: commit.author?.date ?? ''
            }))
        );
        // Show each page as it lands so the first rows appear without waiting for all three.
        commits.value = collected.slice(0, COMMIT_LIMIT);
        if (body.length < PAGE_SIZE) break;
    }
    cache.set(props.login, commits.value);
}

onMounted(async () => {
    if (cache.has(props.login)) return;
    try {
        await load();
    } catch {
        if (!abort.signal.aborted) failed.value = true;
    } finally {
        loading.value = false;
    }
});

onBeforeUnmount(() => abort.abort());
</script>

<template>
    <div class="commits">
        <p v-if="loading && !commits.length" class="commits__status" role="status">Loading commits…</p>
        <p v-else-if="failed && !commits.length" class="commits__status">
            Could not load commits, which usually means GitHub's rate limit. See them on
            <a :href="allCommitsUrl" rel="noopener">GitHub</a>.
        </p>
        <p v-else-if="!commits.length" class="commits__status">No commits found for this author.</p>
        <template v-else>
            <div
                class="commits__viewport"
                :style="{ height: `${viewportHeight}px` }"
                tabindex="0"
                role="region"
                :aria-label="`Latest commits by ${login}`"
                @scroll.passive="onScroll"
            >
                <ul class="commits__list" :style="{ height: `${commits.length * ROW_HEIGHT}px` }">
                    <li
                        v-for="(commit, offset) in visible"
                        :key="commit.sha"
                        class="commits__row"
                        :style="{ top: `${(first + offset) * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }"
                        :aria-posinset="first + offset + 1"
                        :aria-setsize="commits.length"
                    >
                        <a class="commits__link" :href="commit.url" rel="noopener">
                            <span class="commits__message">{{ commit.message }}</span>
                            <span class="commits__meta"
                                ><code>{{ commit.sha.slice(0, 7) }}</code>
                                <time v-if="commit.date" :datetime="commit.date">{{
                                    date.format(new Date(commit.date))
                                }}</time></span
                            >
                        </a>
                    </li>
                </ul>
            </div>
            <p class="commits__status">
                Latest {{ commits.length }} commits{{ loading ? ', loading more…' : '' }}.
                <a :href="allCommitsUrl" rel="noopener">View all on GitHub</a>
            </p>
        </template>
    </div>
</template>

<style scoped>
.commits {
    padding: 0 0 16px;
}

.commits__viewport {
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--vp-c-divider);
    border-radius: 8px;
}

.commits__list {
    position: relative;
    padding: 0;
    margin: 0;
    list-style: none;
}

.commits__row {
    position: absolute;
    right: 0;
    left: 0;
    margin: 0;
    border-top: 1px solid var(--vp-c-divider);
}

.commits__row:first-child {
    border-top: 0;
}

.commits__link {
    display: grid;
    align-content: center;
    height: 100%;
    padding: 0 14px;
    text-decoration: none;
}

.commits__link:is(:hover, :focus-visible) {
    background: var(--vp-c-default-soft);
}

.commits__message {
    overflow: hidden;
    font-size: 14px;
    line-height: 20px;
    color: var(--vp-c-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.commits__meta {
    display: flex;
    gap: 10px;
    font-size: 12px;
    line-height: 16px;
    color: var(--vp-c-text-2);
}

.commits__meta code {
    padding: 0;
    font-size: 12px;
    background: none;
}

.commits__status {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--vp-c-text-2);
}
</style>
