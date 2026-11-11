<script setup lang="ts">
import { withBase } from 'vitepress';
import { tinykeys } from 'tinykeys';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';

import SitePanel from './SitePanel.vue';
import SiteSearch from './SiteSearch.vue';
import { closeAll, isTyping, menu, trackNavigation, useModifierLabel, useSiteMenu } from './state.ts';

/**
 * The site menu on the nav bar, from 768px up: a disclosure navigation (the WAI-ARIA pattern for site
 * menus) whose open button turns into a tab that runs into a full-width panel under the header, and a
 * search that opens in the header itself. Phones get `SitePhoneMenu` instead; both read `megaMenus`.
 */
const { menus, currentMenu } = useSiteMenu();
trackNavigation();
const modifier = useModifierLabel();

const uid = useId();
const root = ref<HTMLElement | null>(null);
/** The section buttons, in header order. */
function triggerButtons() {
    return [...(root.value?.querySelectorAll<HTMLButtonElement>('button[data-section]') ?? [])];
}
const panel = ref<HTMLElement | null>(null);
const searchButton = ref<HTMLButtonElement | null>(null);
const search = ref<InstanceType<typeof SiteSearch> | null>(null);
const openSection = computed(() => menus.value.find((entry) => entry.text === menu.section));
const panelId = `${uid}-panel`;

/** Hover intent: a short wait before opening, a longer grace before closing. */
const OPEN_DELAY = 120;
const CLOSE_DELAY = 250;
let openTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let openedByHoverAt = 0;

function clearTimers() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
}

function open(section: string, viaHover = false) {
    clearTimers();
    menu.searching = false;
    menu.section = section;
    if (viaHover) openedByHoverAt = Date.now();
}

function close(restoreFocusTo?: HTMLElement | null) {
    clearTimers();
    menu.section = null;
    if (restoreFocusTo) void nextTick(() => restoreFocusTo.focus());
}

function onTriggerClick(section: string) {
    // A click that follows the hover which just opened the panel confirms it rather than closing it.
    if (menu.section === section && Date.now() - openedByHoverAt > 400) close();
    else open(section);
}

function onTriggerPointerenter(section: string, event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    clearTimers();
    if (menu.section) open(section, true);
    else openTimer = setTimeout(() => open(section, true), OPEN_DELAY);
}

function onPointerleave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(openTimer);
    closeTimer = setTimeout(() => close(), CLOSE_DELAY);
}

function onPointerenterKeep(event: PointerEvent) {
    if (event.pointerType === 'mouse') clearTimeout(closeTimer);
}

function triggerFor(section: string | null) {
    return triggerButtons().find((button) => button.dataset.section === section) ?? null;
}

function panelLinks() {
    return [...(panel.value?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])];
}

function focusPanelLink(which: 'first' | 'last') {
    void nextTick(() => {
        const links = panelLinks();
        (which === 'first' ? links[0] : links.at(-1))?.focus();
    });
}

function onTriggerKeydown(section: string, index: number, event: KeyboardEvent) {
    const buttons = triggerButtons();
    const step = (delta: number) => {
        const next = buttons[(index + delta + buttons.length) % buttons.length];
        next?.focus();
        if (menu.section && next?.dataset.section) open(next.dataset.section);
    };
    switch (event.key) {
        case 'ArrowRight':
            event.preventDefault();
            step(1);
            break;
        case 'ArrowLeft':
            event.preventDefault();
            step(-1);
            break;
        case 'ArrowDown':
            event.preventDefault();
            open(section);
            focusPanelLink('first');
            break;
        case 'Escape':
            if (!menu.section) return;
            event.preventDefault();
            close(event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
            break;
        case 'Tab':
            // The panel sits at the end of the page, so Tab from an open trigger goes into it.
            if (menu.section === section && !event.shiftKey) {
                event.preventDefault();
                focusPanelLink('first');
            }
            break;
    }
}

function onPanelKeydown(event: KeyboardEvent) {
    const links = panelLinks();
    const index = links.findIndex((link) => link === document.activeElement);
    const trigger = triggerFor(menu.section);
    switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
            event.preventDefault();
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            links[(index + delta + links.length) % links.length]?.focus();
            break;
        }
        case 'ArrowRight':
        case 'ArrowLeft': {
            // From inside the panel the side arrows move to the neighboring section, as on the triggers.
            event.preventDefault();
            const buttons = triggerButtons();
            const position = trigger ? buttons.indexOf(trigger) : -1;
            const next = buttons[(position + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
            if (next?.dataset.section) open(next.dataset.section);
            focusPanelLink('first');
            break;
        }
        case 'Escape':
            event.preventDefault();
            close(trigger);
            break;
        case 'Tab': {
            // Leaving the panel by Tab continues from its trigger in the header's order.
            const atEnd = !event.shiftKey && index === links.length - 1;
            const atStart = event.shiftKey && index === 0;
            if (!atEnd && !atStart) return;
            event.preventDefault();
            const buttons = triggerButtons();
            const position = trigger ? buttons.indexOf(trigger) : -1;
            close();
            const next = atStart ? trigger : (buttons[position + 1] ?? searchButton.value);
            next?.focus();
            break;
        }
    }
}

/**
 * The keys the open panel advertises, wherever focus is: a panel opened by the pointer leaves focus on
 * the page, and the hints have to hold there too. Keys the trigger or the panel already handle are
 * left to them.
 */
function onOpenKeydown(event: KeyboardEvent) {
    if (!menu.section || isTyping(event)) return;
    const focus = document.activeElement;
    if (panel.value?.contains(focus) || root.value?.contains(focus)) return;
    const buttons = triggerButtons();
    const index = buttons.findIndex((button) => button.dataset.section === menu.section);
    switch (event.key) {
        case 'ArrowRight':
        case 'ArrowLeft': {
            event.preventDefault();
            const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
            if (next?.dataset.section) open(next.dataset.section);
            next?.focus();
            break;
        }
        case 'ArrowDown':
        case 'ArrowUp':
            event.preventDefault();
            focusPanelLink(event.key === 'ArrowDown' ? 'first' : 'last');
            break;
        case 'Escape':
            event.preventDefault();
            close(triggerFor(menu.section));
            break;
    }
}

function onPanelFocusout(event: FocusEvent) {
    const target = event.relatedTarget;
    if (!(target instanceof Node)) return;
    if (panel.value?.contains(target) || root.value?.contains(target)) return;
    close();
}

function openSearch() {
    clearTimers();
    menu.section = null;
    menu.searching = true;
    void nextTick(() => search.value?.focusInput());
}

function closeSearch(restoreFocus: boolean) {
    menu.searching = false;
    menu.query = '';
    if (restoreFocus) void nextTick(() => searchButton.value?.focus());
}

let unbind: (() => void) | undefined;
let onPointerdown: ((event: PointerEvent) => void) | undefined;
let onSlash: ((event: KeyboardEvent) => void) | undefined;

onMounted(() => {
    const wide = window.matchMedia('(min-width: 768px)');
    const start = (event: KeyboardEvent) => {
        if (!wide.matches) return;
        event.preventDefault();
        openSearch();
    };
    unbind = tinykeys(window, { '$mod+KeyK': start });
    // "/" is matched by the character typed, so it works on layouts that need Shift for it.
    onSlash = (event) => {
        if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
        start(event);
    };
    window.addEventListener('keydown', onSlash);
    window.addEventListener('keydown', onOpenKeydown);
    onPointerdown = (event) => {
        if (!menu.section && !menu.searching) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.site-nav, .site-panel, .site-search__results')) return;
        closeAll();
    };
    document.addEventListener('pointerdown', onPointerdown);
});

onBeforeUnmount(() => {
    unbind?.();
    if (onPointerdown) document.removeEventListener('pointerdown', onPointerdown);
    if (onSlash) window.removeEventListener('keydown', onSlash);
    window.removeEventListener('keydown', onOpenKeydown);
    clearTimers();
});
</script>

<template>
    <nav
        ref="root"
        class="site-nav"
        aria-label="Main"
        @pointerleave="onPointerleave"
        @pointerenter="onPointerenterKeep"
    >
        <template v-if="!menu.searching">
            <ul class="site-nav__list">
                <li v-for="(entry, index) in menus" :key="entry.text">
                    <a
                        v-if="entry.link"
                        class="site-nav__trigger"
                        :href="withBase(entry.link)"
                        @pointerenter="menu.section ? close() : undefined"
                        >{{ entry.text }}</a
                    >
                    <button
                        v-else
                        class="site-nav__trigger"
                        :class="{ 'is-open': menu.section === entry.text, 'is-current': currentMenu === entry.text }"
                        type="button"
                        :data-section="entry.text"
                        :aria-expanded="menu.section === entry.text"
                        :aria-controls="panelId"
                        @click="onTriggerClick(entry.text)"
                        @pointerenter="onTriggerPointerenter(entry.text, $event)"
                        @keydown="onTriggerKeydown(entry.text, index, $event)"
                    >
                        {{ entry.text }}
                        <span class="site-nav__chevron" aria-hidden="true"></span>
                    </button>
                </li>
            </ul>
            <button ref="searchButton" class="site-nav__search" type="button" @click="openSearch">
                <span class="site-nav__magnifier" aria-hidden="true"></span>
                <span class="site-nav__search-label">Search</span>
                <kbd aria-hidden="true">{{ modifier }} K</kbd>
            </button>
        </template>
        <SiteSearch v-else ref="search" variant="bar" @close="closeSearch" />

        <Teleport to="body">
            <div
                v-if="openSection"
                :id="panelId"
                ref="panel"
                class="site-panel"
                :aria-label="`${openSection.text} links`"
                role="region"
                @keydown="onPanelKeydown"
                @focusout="onPanelFocusout"
                @pointerenter="onPointerenterKeep"
                @pointerleave="onPointerleave"
            >
                <SitePanel :key="openSection.text" :section="openSection" />
                <div class="site-panel__foot" aria-hidden="true">
                    <span><kbd>←→</kbd> section</span><span><kbd>↑↓</kbd> page</span><span><kbd>↵</kbd> open</span
                    ><span><kbd>/</kbd> search</span><span><kbd>esc</kbd> close</span>
                </div>
            </div>
            <div v-if="menu.section || menu.searching" class="site-backdrop" aria-hidden="true"></div>
        </Teleport>
    </nav>
</template>
