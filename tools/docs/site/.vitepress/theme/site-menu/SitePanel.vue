<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, onMounted, ref, shallowRef } from 'vue';

import type { MegaMenu } from '../types.ts';
import { type SearchEngine, loadSearch } from './search.ts';
import { normalizeRoute, useSiteMenu } from './state.ts';

/**
 * One section's panel under the bar: its featured page, its groups of links and a preview of the
 * link under the pointer or the focus, read from the search index.
 */
const props = defineProps<{ section: MegaMenu }>();

const { isCurrent } = useSiteMenu();
const engine = shallowRef<SearchEngine | null>(null);
const previewed = ref<string | null>(null);

onMounted(async () => {
    try {
        engine.value = await loadSearch();
    } catch {
        // Without the index the panel still works; it just shows no preview.
    }
});

const links = computed(() => props.section.sections.flatMap((group) => group.items));
const preview = computed(() => {
    const link = previewed.value ?? props.section.featured?.link ?? links.value[0]?.link;
    if (!link) return undefined;
    const route = normalizeRoute(withBase(link));
    const page = engine.value?.pages.get(route);
    const anchor = link.includes('#') ? link.slice(link.indexOf('#') + 1) : undefined;
    const heading = anchor ? page?.headings.find((entry) => entry.anchor === anchor) : undefined;
    if (!page) return undefined;
    return {
        crumb: heading ? `${page.section} / ${page.title}` : page.section,
        title: heading?.text ?? page.title,
        description: heading?.excerpt ?? page.description,
        outline: heading ? [] : page.headings.map(({ text }) => text).slice(0, 7)
    };
});
</script>

<template>
    <div class="site-panel__inner">
        <a
            v-if="section.featured"
            class="site-panel__featured"
            :href="withBase(section.featured.link)"
            @pointerenter="previewed = section.featured.link"
            @focus="previewed = section.featured.link"
        >
            <span class="site-panel__featured-title">{{ section.featured.text }}</span>
            <span class="site-panel__featured-text">{{ section.featured.description }}</span>
            <code v-if="section.featured.command" class="site-panel__command">{{ section.featured.command }}</code>
        </a>

        <div class="site-panel__groups">
            <section v-for="group in section.sections" :key="group.text" class="site-panel__group">
                <h2 class="site-panel__heading">{{ group.text }}</h2>
                <a
                    v-for="item in group.items"
                    :key="item.link"
                    class="site-panel__link"
                    :class="{ 'is-current': isCurrent(item.link) }"
                    :aria-current="isCurrent(item.link) ? 'page' : undefined"
                    :href="withBase(item.link)"
                    @pointerenter="previewed = item.link"
                    @focus="previewed = item.link"
                >
                    <span class="site-panel__link-title">{{ item.text }}</span>
                    <span v-if="item.description" class="site-panel__link-text">{{ item.description }}</span>
                </a>
            </section>
        </div>

        <aside v-if="preview" class="site-panel__preview" aria-hidden="true">
            <span class="site-panel__crumb">{{ preview.crumb }}</span>
            <strong>{{ preview.title }}</strong>
            <p v-if="preview.description">{{ preview.description }}</p>
            <ul v-if="preview.outline.length">
                <li v-for="item in preview.outline" :key="item">{{ item }}</li>
            </ul>
        </aside>
    </div>
</template>
