<script setup lang="ts">
import { useRouter, withBase } from 'vitepress';
import { computed, nextTick, onMounted, ref, shallowRef, useId, watch } from 'vue';

import { type ResultGroup, SCOPES, type SearchEngine, type SearchResult, loadSearch, parseQuery } from './search.ts';
import { closeAll, menu, readRecent, useSiteMenu } from './state.ts';

/**
 * The menu's search: a WAI-ARIA combobox over a listbox of grouped results. `bar` puts the field in
 * the header and the results in the panel below it, with a preview of the highlighted result; `sheet`
 * fits the phone menu, without the preview.
 */
const props = defineProps<{ variant: 'bar' | 'sheet' }>();
const emit = defineEmits<{ close: [restoreFocus: boolean] }>();

const uid = useId();
const router = useRouter();
const { actions, current } = useSiteMenu();
const input = ref<HTMLInputElement | null>(null);
const engine = shallowRef<SearchEngine | null>(null);
const failed = ref(false);
const active = ref(0);
const recent = ref<{ url: string; title: string }[]>([]);

onMounted(async () => {
    recent.value = readRecent().filter((entry) => entry.url !== current.value);
    try {
        engine.value = await loadSearch();
    } catch {
        failed.value = true;
    }
});

const parsed = computed(() => parseQuery(menu.query));

watch(
    () => parsed.value.scope?.kind,
    (kind) => {
        if (kind === 'package') void engine.value?.loadApi().then(() => (apiTick.value += 1));
    }
);
/** Bumped when the API symbols arrive, so a search already showing re-runs with them. */
const apiTick = ref(0);

const groups = computed((): ResultGroup[] => {
    void apiTick.value;
    const { scope, text } = parsed.value;
    if (!scope && !text) {
        const entries: ResultGroup[] = [];
        if (recent.value.length)
            entries.push({
                kind: 'page',
                label: 'Recent',
                total: recent.value.length,
                results: recent.value.map(({ url, title }) => ({
                    id: `recent:${url}`,
                    kind: 'page',
                    title,
                    context: engine.value?.pages.get(url)?.section ?? '',
                    href: url,
                    description: engine.value?.pages.get(url)?.description,
                    outline: engine.value?.pages.get(url)?.headings.map(({ text: heading }) => heading)
                }))
            });
        entries.push({ kind: 'action', label: 'Quick actions', total: actions.value.length, results: actions.value });
        return entries;
    }
    return engine.value?.query(text, scope, { actions: actions.value, pageUrl: current.value }) ?? [];
});

const flat = computed(() => groups.value.flatMap((group) => group.results));
const total = computed(() =>
    parsed.value.text || parsed.value.scope ? groups.value.reduce((sum, group) => sum + group.total, 0) : 0
);
const highlighted = computed(() => flat.value[active.value]);
const optionId = (index: number) => `${uid}-option-${index}`;

watch(
    () => menu.query,
    () => {
        active.value = 0;
    }
);

function focusInput() {
    void nextTick(() => input.value?.focus());
}
defineExpose({ focusInput });

function isExternal(href: string) {
    return /^[a-z]+:/i.test(href);
}

async function activate(result: SearchResult | undefined, newTab = false) {
    if (!result) return;
    if (result.run) {
        await result.run();
        emit('close', true);
        return;
    }
    if (!result.href) return;
    const href = isExternal(result.href) ? result.href : withBase(result.href);
    if (newTab || isExternal(result.href)) {
        window.open(href, '_blank', 'noopener');
        return;
    }
    closeAll();
    await router.go(href);
}

function move(step: number) {
    const count = flat.value.length;
    if (!count) return;
    active.value = (active.value + step + count) % count;
    void nextTick(() => document.getElementById(optionId(active.value))?.scrollIntoView({ block: 'nearest' }));
}

function onKeydown(event: KeyboardEvent) {
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            move(1);
            break;
        case 'ArrowUp':
            event.preventDefault();
            move(-1);
            break;
        case 'Home':
        case 'End':
            if (!flat.value.length || !event.ctrlKey) return;
            event.preventDefault();
            active.value = event.key === 'Home' ? 0 : flat.value.length - 1;
            break;
        case 'Enter':
            event.preventDefault();
            void activate(highlighted.value, event.metaKey || event.ctrlKey);
            break;
        case 'Escape':
            event.preventDefault();
            if (menu.query) menu.query = '';
            else emit('close', true);
            break;
    }
}

function useScope(prefix: string) {
    menu.query = `${prefix}${parseQuery(menu.query).text}`;
    focusInput();
}

/** The position of each result in the flat list, for ids and the active row. */
function indexOf(result: SearchResult) {
    return flat.value.indexOf(result);
}

const status = computed(() => {
    if (failed.value) return 'Search is unavailable right now.';
    if (!engine.value) return 'Loading search…';
    if (!parsed.value.text && !parsed.value.scope) return '';
    return total.value === 1 ? '1 result' : `${total.value} results`;
});

/** Splits a title around the query's words, so the matched letters can be marked. */
function marked(title: string) {
    const words = parsed.value.text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [{ text: title, hit: false }];
    const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return title
        .split(pattern)
        .filter(Boolean)
        .map((text) => ({ text, hit: words.includes(text.toLowerCase()) }));
}

const KIND_TAG: Record<SearchResult['kind'], string> = {
    action: 'ACT',
    command: 'CMD',
    page: 'PAGE',
    heading: '#',
    setting: 'SET',
    package: 'PKG',
    api: 'API'
};
</script>

<template>
    <div class="site-search" :class="`is-${props.variant}`">
        <div class="site-search__field">
            <span class="site-search__icon" aria-hidden="true"></span>
            <input
                :id="`${uid}-input`"
                ref="input"
                v-model="menu.query"
                class="site-search__input"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                :aria-expanded="flat.length > 0"
                :aria-controls="`${uid}-listbox`"
                :aria-activedescendant="highlighted ? optionId(active) : undefined"
                aria-label="Search the docs"
                placeholder="Search pages, commands, settings…"
                autocomplete="off"
                spellcheck="false"
                enterkeyhint="go"
                @keydown="onKeydown"
            />
            <span v-if="parsed.scope" class="site-search__scope">{{ parsed.scope.label }}</span>
            <span class="site-search__status" aria-live="polite">{{ status }}</span>
            <kbd v-if="props.variant === 'bar'" class="site-search__esc">esc</kbd>
        </div>

        <Teleport to="body" :disabled="props.variant === 'sheet'">
            <div
                v-if="props.variant === 'bar' || parsed.text || parsed.scope"
                class="site-search__results"
                :class="`is-${props.variant}`"
            >
                <div class="site-search__body">
                    <div :id="`${uid}-listbox`" class="site-search__list" role="listbox" aria-label="Search results">
                        <template v-for="(group, groupIndex) in groups" :key="group.label">
                            <div
                                class="site-search__group"
                                role="group"
                                :aria-labelledby="`${uid}-group-${groupIndex}`"
                            >
                                <div :id="`${uid}-group-${groupIndex}`" class="site-search__heading">
                                    {{ group.label }}
                                    <span v-if="group.total > group.results.length">
                                        {{ group.results.length }} of {{ group.total }}
                                    </span>
                                    <span v-else-if="parsed.text">{{ group.total }}</span>
                                </div>
                                <div
                                    v-for="result in group.results"
                                    :id="optionId(indexOf(result))"
                                    :key="result.id"
                                    class="site-search__option"
                                    role="option"
                                    :aria-selected="indexOf(result) === active"
                                    @pointermove="active = indexOf(result)"
                                    @mousedown.prevent
                                    @click="activate(result, $event.metaKey || $event.ctrlKey)"
                                >
                                    <span class="site-search__kind">{{ KIND_TAG[result.kind] }}</span>
                                    <span class="site-search__title">
                                        <template v-for="(part, index) in marked(result.title)" :key="index">
                                            <mark v-if="part.hit">{{ part.text }}</mark>
                                            <template v-else>{{ part.text }}</template>
                                        </template>
                                        <small v-if="result.context">{{ result.context }}</small>
                                    </span>
                                    <span class="site-search__go" aria-hidden="true">{{
                                        result.run ? '↵' : result.href && isExternal(result.href) ? '↗' : '↵'
                                    }}</span>
                                </div>
                            </div>
                        </template>

                        <div v-if="engine && (parsed.text || parsed.scope) && !flat.length" class="site-search__empty">
                            <strong>Nothing matches “{{ parsed.text || parsed.scope?.prefix }}”.</strong>
                            <p>
                                No page, heading, command, setting or package uses that word. Try a broader one, or ask.
                            </p>
                        </div>
                    </div>

                    <aside
                        v-if="props.variant === 'bar' && highlighted"
                        class="site-search__preview"
                        aria-hidden="true"
                    >
                        <span class="site-search__crumb">{{ highlighted.context }}</span>
                        <strong>{{ highlighted.title }}</strong>
                        <p v-if="highlighted.description">{{ highlighted.description }}</p>
                        <template v-if="highlighted.command">
                            <code v-for="line in highlighted.command.usage" :key="line" class="site-search__usage"
                                >/{{ line }}</code
                            >
                            <p v-if="highlighted.command.level" class="site-search__meta">
                                Permission level: {{ highlighted.command.level }}
                            </p>
                        </template>
                        <code v-if="highlighted.setting" class="site-search__usage is-plain"
                            >"{{ highlighted.setting.key }}"</code
                        >
                        <ul v-if="highlighted.outline?.length" class="site-search__outline">
                            <li v-for="item in highlighted.outline.slice(0, 8)" :key="item">{{ item }}</li>
                        </ul>
                    </aside>
                </div>

                <div class="site-search__foot">
                    <span class="site-search__scopes">
                        <button
                            v-for="scope in SCOPES"
                            :key="scope.prefix"
                            type="button"
                            @click="useScope(scope.prefix)"
                        >
                            <b>{{ scope.prefix }}</b> {{ scope.label }}
                        </button>
                    </span>
                    <span v-if="props.variant === 'bar'" class="site-search__keys">
                        <kbd>↑↓</kbd> move <kbd>↵</kbd> open <kbd>⌘↵</kbd> new tab
                    </span>
                </div>
            </div>
        </Teleport>
    </div>
</template>
