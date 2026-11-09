<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { computed } from 'vue';

import { normalizeRoute, useSiteMenu } from './state.ts';

/**
 * Where the reader is: the page's section and the page, above the page title. The section is the
 * menu that lists the page, else the docs section its folder belongs to.
 */
const { page, theme } = useData();
const { currentMenu, current } = useSiteMenu();

/** The sidebar group a page sits in, for pages no menu lists, with its overview link. */
const sidebarSection = computed(() => {
    const sidebar: Record<string, { text?: string; link?: string }[]> = theme.value.sidebar ?? {};
    const key = Object.keys(sidebar).find((prefix) => current.value.startsWith(prefix));
    const group = key ? sidebar[key]?.[0] : undefined;
    return group?.text ? { text: group.text, link: key } : undefined;
});

const crumbs = computed(() => {
    const section = currentMenu.value ? { text: currentMenu.value, link: undefined } : sidebarSection.value;
    const overview = sidebarSection.value?.link;
    const isOverview = overview !== undefined && normalizeRoute(withBase(overview)) === current.value;
    return { section, overview: isOverview ? undefined : overview, title: page.value.title };
});
</script>

<template>
    <nav v-if="crumbs.section && crumbs.title" class="site-crumb" aria-label="Breadcrumb">
        <ol>
            <li>
                <a v-if="crumbs.overview" :href="withBase(crumbs.overview)">{{ crumbs.section.text }}</a>
                <span v-else>{{ crumbs.section.text }}</span>
            </li>
            <li aria-current="page">{{ crumbs.title }}</li>
        </ol>
    </nav>
</template>
