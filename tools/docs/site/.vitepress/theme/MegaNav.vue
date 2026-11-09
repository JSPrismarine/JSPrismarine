<script setup lang="ts">
import { useData, useRoute, withBase } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import MegaNavPanel from './MegaNavPanel.vue';
import type { MegaMenu, ThemeConfigWithMegaMenus } from './types.ts';

/**
 * The site's one menu. On the nav bar (`screen` off) each menu opens as a dropdown panel; on the
 * small-screen menu (`screen` on) the same menus are sections that expand in place. Both render the
 * same `megaMenus` through {@link MegaNavPanel}, so a menu is written once.
 */
const props = withDefaults(defineProps<{ screen?: boolean }>(), { screen: false });

const root = ref<HTMLElement | null>(null);
const openMenu = ref<string | null>(null);
const { theme } = useData<ThemeConfigWithMegaMenus>();
const route = useRoute();
const menus = computed(() => theme.value.megaMenus ?? []);
const activeMenu = computed(() => menus.value.find((menu) => menu.text === openMenu.value) ?? null);

function triggers() {
    return [...(root.value?.querySelectorAll<HTMLButtonElement>('[data-menu-trigger]') ?? [])];
}

function closeMenu(restoreFocus = false) {
    const previous = openMenu.value;
    openMenu.value = null;
    if (restoreFocus)
        requestAnimationFrame(() =>
            triggers()
                .find((el) => el.dataset.menuTrigger === previous)
                ?.focus()
        );
}

function onTriggerClick(menu: string, event: MouseEvent) {
    // A mouse click follows the hover that already opened the panel, so it must not close it again.
    const fromMouse = event instanceof PointerEvent && event.pointerType === 'mouse';
    openMenu.value = openMenu.value === menu && !fromMouse ? null : menu;
}

function onTriggerPointerenter(menu: string, event: PointerEvent) {
    if (event.pointerType === 'mouse') openMenu.value = menu;
}

function onNavPointerleave(event: PointerEvent) {
    if (event.pointerType === 'mouse') closeMenu();
}

function onNavFocusout(event: FocusEvent) {
    if (event.relatedTarget instanceof Node && !root.value?.contains(event.relatedTarget)) closeMenu();
}

function onPointerDown(event: PointerEvent) {
    if (root.value && event.target instanceof Node && !root.value.contains(event.target)) closeMenu();
}

function onDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !openMenu.value) return;
    event.preventDefault();
    closeMenu(true);
}

function onTriggerKeydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    // Direct links are not buttons, so step through the buttons rather than the menu list.
    const buttons = triggers();
    const index = buttons.findIndex((button) => button === event.currentTarget);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next =
        event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
}

function isCurrent(link: string) {
    return route.path.startsWith(withBase(link.replace(/#.*$/, '')));
}

/** Whether a menu holds the page being read, so the small-screen menu opens on it. */
function holdsCurrent(menu: MegaMenu) {
    const links = [menu.featured?.link, ...menu.sections.flatMap((section) => section.items.map(({ link }) => link))];
    return links.some((link) => link !== undefined && link !== '/' && isCurrent(link));
}

/** The menu that holds the page being read. A page listed in two menus belongs to the first. */
const currentMenu = computed(() => menus.value.find((menu) => !menu.link && holdsCurrent(menu))?.text);

/** The small-screen menu's expanded sections, by menu name. It opens on the current one. */
const expanded = ref(new Set(currentMenu.value ? [currentMenu.value] : []));

function toggleSection(menu: string) {
    const next = new Set(expanded.value);
    if (!next.delete(menu)) next.add(menu);
    expanded.value = next;
}

onMounted(() => {
    // Outside clicks and Escape close a dropdown; the small-screen menu has no dropdowns to close.
    if (props.screen) return;
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onDocumentKeydown);
});

watch(
    () => route.path,
    () => closeMenu()
);
</script>

<template>
    <nav v-if="menus.length && screen" class="mega-nav mega-nav--screen" aria-label="Main navigation">
        <template v-for="(menu, index) in menus" :key="menu.text">
            <a
                v-if="menu.link"
                class="mega-nav__trigger"
                :class="{ 'is-current': isCurrent(menu.link) }"
                :href="withBase(menu.link)"
            >
                {{ menu.text }}
            </a>
            <section v-else class="mega-nav__screen-section">
                <button
                    class="mega-nav__trigger"
                    type="button"
                    :aria-expanded="expanded.has(menu.text)"
                    :aria-controls="`mega-screen-${index}`"
                    @click="toggleSection(menu.text)"
                >
                    {{ menu.text }}
                    <span class="mega-nav__chevron" aria-hidden="true"></span>
                </button>
                <div
                    v-show="expanded.has(menu.text)"
                    :id="`mega-screen-${index}`"
                    class="mega-nav__panel"
                    :aria-label="`${menu.text} links`"
                >
                    <MegaNavPanel :menu="menu" />
                </div>
            </section>
        </template>
    </nav>

    <nav
        v-else-if="menus.length"
        ref="root"
        class="mega-nav mega-nav--bar"
        aria-label="Main navigation"
        @pointerleave="onNavPointerleave"
        @focusout="onNavFocusout"
    >
        <div class="mega-nav__triggers">
            <template v-for="(menu, index) in menus" :key="menu.text">
                <a
                    v-if="menu.link"
                    class="mega-nav__trigger"
                    :class="{ 'is-current': isCurrent(menu.link) }"
                    :href="withBase(menu.link)"
                    @pointerenter="closeMenu()"
                >
                    {{ menu.text }}
                </a>
                <button
                    v-else
                    class="mega-nav__trigger"
                    :class="{ 'is-current': currentMenu === menu.text }"
                    type="button"
                    :data-menu-trigger="menu.text"
                    :aria-expanded="openMenu === menu.text"
                    :aria-controls="`mega-panel-${index}`"
                    @click="onTriggerClick(menu.text, $event)"
                    @pointerenter="onTriggerPointerenter(menu.text, $event)"
                    @keydown="onTriggerKeydown"
                >
                    {{ menu.text }}
                    <span class="mega-nav__chevron" aria-hidden="true"></span>
                </button>
            </template>
        </div>

        <Transition name="mega-panel">
            <section
                v-if="activeMenu"
                :id="`mega-panel-${menus.indexOf(activeMenu)}`"
                class="mega-nav__panel"
                :class="{ 'has-featured': activeMenu.featured }"
                :aria-label="`${activeMenu.text} links`"
            >
                <MegaNavPanel :menu="activeMenu" />
            </section>
        </Transition>
    </nav>
</template>
