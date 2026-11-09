<script setup lang="ts">
import { createFocusTrap, type FocusTrap } from 'focus-trap';
import { useData, withBase } from 'vitepress';
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

import SiteSearch from './SiteSearch.vue';
import { menu, useSiteMenu } from './state.ts';

/**
 * The site menu below 768px. The header itself becomes the menu: it turns ink, the Menu button
 * becomes Close in the same place, and the sections continue down the screen with the search on top.
 * Focus stays inside the header buttons and the menu while it is open.
 */
const { menus, currentMenu, isCurrent } = useSiteMenu();
const { isDark, theme } = useData();

const uid = useId();
const buttons = ref<HTMLElement | null>(null);
const sheet = ref<HTMLElement | null>(null);
const menuButton = ref<HTMLButtonElement | null>(null);
const search = ref<InstanceType<typeof SiteSearch> | null>(null);
const expanded = ref(new Set<string>());
let trap: FocusTrap | undefined;

function toggleSection(name: string) {
    const next = new Set(expanded.value);
    if (!next.delete(name)) next.add(name);
    expanded.value = next;
}

/** Whether the sheet was opened from the search button, which puts the keyboard on the field. */
const startedWithSearch = ref(false);

function openSheet(withSearch = false) {
    if (!menu.sheet) expanded.value = new Set(currentMenu.value ? [currentMenu.value] : []);
    menu.section = null;
    menu.searching = false;
    startedWithSearch.value = withSearch;
    menu.sheet = true;
    if (withSearch) void nextTick(() => search.value?.focusInput());
}

function closeSheet() {
    menu.sheet = false;
    menu.query = '';
}

function onSearchClose(restoreFocus: boolean) {
    if (menu.query) menu.query = '';
    else {
        closeSheet();
        if (restoreFocus) void nextTick(() => menuButton.value?.focus());
    }
}

watch(
    () => menu.sheet,
    async (open) => {
        document.documentElement.classList.toggle('site-menu-open', open);
        if (open) {
            await nextTick();
            if (!buttons.value || !sheet.value) return;
            trap = createFocusTrap([buttons.value, sheet.value], {
                escapeDeactivates: true,
                allowOutsideClick: true,
                initialFocus: () => (startedWithSearch.value ? false : (menuButton.value ?? false)),
                onDeactivate: () => {
                    if (menu.sheet) closeSheet();
                },
                returnFocusOnDeactivate: true
            });
            trap.activate();
        } else {
            trap?.deactivate();
            trap = undefined;
        }
    }
);

onBeforeUnmount(() => {
    trap?.deactivate();
    document.documentElement.classList.remove('site-menu-open');
});

const socials = () => theme.value.socialLinks ?? [];
</script>

<template>
    <div ref="buttons" class="site-phone">
        <button class="site-phone__icon" type="button" aria-label="Search the docs" @click="openSheet(true)">
            <span class="site-nav__magnifier" aria-hidden="true"></span>
        </button>
        <button
            ref="menuButton"
            class="site-phone__menu"
            type="button"
            :aria-expanded="menu.sheet"
            :aria-controls="`${uid}-sheet`"
            @click="menu.sheet ? closeSheet() : openSheet()"
        >
            <span v-if="menu.sheet" aria-hidden="true">✕</span>
            <span v-else class="site-phone__burger" aria-hidden="true"><i></i><i></i><i></i></span>
            {{ menu.sheet ? 'Close' : 'Menu' }}
        </button>

        <Teleport to="body">
            <div v-if="menu.sheet" :id="`${uid}-sheet`" ref="sheet" class="site-sheet" role="region" aria-label="Menu">
                <SiteSearch ref="search" variant="sheet" @close="onSearchClose" />

                <nav v-if="!menu.query" class="site-sheet__sections" aria-label="Main">
                    <template v-for="(entry, index) in menus" :key="entry.text">
                        <a v-if="entry.link" class="site-sheet__section" :href="withBase(entry.link)">{{
                            entry.text
                        }}</a>
                        <section v-else class="site-sheet__group">
                            <button
                                class="site-sheet__section"
                                type="button"
                                :aria-expanded="expanded.has(entry.text)"
                                :aria-controls="`${uid}-section-${index}`"
                                @click="toggleSection(entry.text)"
                            >
                                {{ entry.text }}
                                <span class="site-nav__chevron" aria-hidden="true"></span>
                            </button>
                            <div
                                v-show="expanded.has(entry.text)"
                                :id="`${uid}-section-${index}`"
                                class="site-sheet__links"
                            >
                                <a
                                    v-if="entry.featured"
                                    class="site-sheet__featured"
                                    :href="withBase(entry.featured.link)"
                                >
                                    <strong>{{ entry.featured.text }}</strong>
                                    <span>{{ entry.featured.description }}</span>
                                </a>
                                <template v-for="group in entry.sections" :key="group.text">
                                    <h2 class="site-panel__heading">{{ group.text }}</h2>
                                    <a
                                        v-for="item in group.items"
                                        :key="item.link"
                                        class="site-panel__link"
                                        :class="{ 'is-current': isCurrent(item.link) }"
                                        :aria-current="isCurrent(item.link) ? 'page' : undefined"
                                        :href="withBase(item.link)"
                                    >
                                        <span class="site-panel__link-title">{{ item.text }}</span>
                                        <span class="site-panel__link-text">{{
                                            isCurrent(item.link) ? 'You are here' : item.description
                                        }}</span>
                                    </a>
                                </template>
                            </div>
                        </section>
                    </template>
                </nav>

                <div class="site-sheet__foot">
                    <button type="button" @click="isDark = !isDark">
                        {{ isDark ? 'Light mode' : 'Dark mode' }}
                    </button>
                    <a v-for="social in socials()" :key="social.link" :href="social.link" rel="noopener">{{
                        social.icon === 'github' ? 'GitHub' : social.icon === 'discord' ? 'Discord' : social.icon
                    }}</a>
                </div>
            </div>
        </Teleport>
    </div>
</template>
