<script setup lang="ts">
import { useData, useRoute, withBase } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ThemeConfigWithMegaMenus } from './types.ts';

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
    return route.path.startsWith(withBase(link));
}

onMounted(() => {
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
    <nav
        v-if="menus.length"
        ref="root"
        class="mega-nav"
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
                <a v-if="activeMenu.featured" class="mega-nav__featured" :href="withBase(activeMenu.featured.link)">
                    <span class="mega-nav__featured-title">{{ activeMenu.featured.text }}</span>
                    <span class="mega-nav__description">{{ activeMenu.featured.description }}</span>
                    <code v-if="activeMenu.featured.command" class="mega-nav__command">{{
                        activeMenu.featured.command
                    }}</code>
                </a>

                <div class="mega-nav__sections">
                    <section v-for="section in activeMenu.sections" :key="section.text" class="mega-nav__section">
                        <h2 class="mega-nav__heading">{{ section.text }}</h2>
                        <a
                            v-for="item in section.items"
                            :key="item.link"
                            class="mega-nav__link"
                            :href="withBase(item.link)"
                        >
                            <span class="mega-nav__link-title">{{ item.text }}</span>
                            <span v-if="item.description" class="mega-nav__description">{{ item.description }}</span>
                        </a>
                    </section>
                </div>
            </section>
        </Transition>
    </nav>
</template>
