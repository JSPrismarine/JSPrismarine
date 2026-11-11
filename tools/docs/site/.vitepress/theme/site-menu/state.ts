import { useData, useRoute, withBase } from 'vitepress';
import { computed, onMounted, reactive, ref, watch } from 'vue';

import type { MegaMenu, ThemeConfigWithMegaMenus } from '../types.ts';
import type { SearchResult } from './search.ts';

/**
 * The site menu's one state, shared by the bar, its panel, the search and the phone menu, so opening
 * one closes the others and every part agrees on what is open.
 */
export const menu = reactive({
    /** The section whose panel is open on the bar, by menu name. */
    section: null as string | null,
    /** Whether the search has taken over the bar. The phone menu's search lives inside its sheet. */
    searching: false,
    /** Whether the phone menu is open. */
    sheet: false,
    query: ''
});

export function closeAll() {
    menu.section = null;
    menu.searching = false;
    menu.sheet = false;
    menu.query = '';
}

/** A site path without the deploy base, `.html`, a trailing `index` or a hash: `/guide/running`. */
export function normalizeRoute(path: string) {
    const base = withBase('/');
    const withoutBase = path.startsWith(base) ? `/${path.slice(base.length)}` : path;
    return (
        withoutBase
            .replace(/#.*$/, '')
            .replace(/\.html$/, '')
            .replace(/\/index$/, '/') || '/'
    );
}

const RECENT_KEY = 'jsprismarine:recent-pages';
const RECENT_COUNT = 5;

/** The pages last visited on this device, newest first. Empty when storage is unavailable. */
export function readRecent(): { url: string; title: string }[] {
    try {
        const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
        return Array.isArray(stored)
            ? stored.filter(
                  (entry): entry is { url: string; title: string } =>
                      typeof entry?.url === 'string' && typeof entry?.title === 'string'
              )
            : [];
    } catch {
        return [];
    }
}

function rememberPage(url: string, title: string) {
    try {
        const next = [{ url, title }, ...readRecent().filter((entry) => entry.url !== url)].slice(0, RECENT_COUNT);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        // Private windows and blocked storage simply keep no history.
    }
}

/** The page's repository source, which the site config stores in front matter. */
interface EditSource {
    kind: 'file' | 'folder';
    url: string;
}

/** Route awareness and the actions, for any part of the menu. */
export function useSiteMenu() {
    const { theme, page, frontmatter, isDark, title } = useData<ThemeConfigWithMegaMenus>();
    const route = useRoute();
    const menus = computed(() => theme.value.megaMenus ?? []);
    const current = computed(() => normalizeRoute(route.path));

    /** Whether a link points into the page being read, section links included. */
    const isOnCurrent = (link: string) => normalizeRoute(withBase(link)) === current.value;

    /** Every page a menu links, its featured link first. */
    const menuLinks = (entry: MegaMenu) => [
        entry.featured?.link,
        ...entry.sections.flatMap((section) => section.items.map(({ link }) => link))
    ];

    /**
     * The menu entry that marks the page being read: the link to the page itself, or, when the menus
     * link only to its sections, the first of those.
     */
    const currentLink = computed(() => {
        const links = menus.value.flatMap((entry) =>
            entry.sections.flatMap(({ items }) => items.map(({ link }) => link))
        );
        return links.find((link) => !link.includes('#') && isOnCurrent(link)) ?? links.find(isOnCurrent);
    });
    /** Whether a menu entry marks the page being read. */
    const isCurrent = (link: string) => link === currentLink.value;

    /** Whether a menu lists the page being read. */
    const holdsCurrent = (entry: MegaMenu) => menuLinks(entry).some((link) => link !== undefined && isOnCurrent(link));

    /** Whether a menu lists pages under the folder whose index page is being read. */
    const holdsSection = (entry: MegaMenu) =>
        current.value !== '/' &&
        current.value.endsWith('/') &&
        menuLinks(entry).some((link) => link !== undefined && normalizeRoute(withBase(link)).startsWith(current.value));

    /**
     * The menu that holds the page being read; a page in two menus belongs to the first. A section's
     * index page belongs to the first menu that lists pages in its folder, so it counts as current
     * even when no menu links it.
     */
    const currentMenu = computed(
        () =>
            (
                menus.value.find((entry) => !entry.link && holdsCurrent(entry)) ??
                menus.value.find((entry) => !entry.link && holdsSection(entry))
            )?.text
    );

    const repository = computed(
        () => theme.value.socialLinks?.find((social) => social.icon === 'github')?.link ?? 'https://github.com'
    );

    /** What `>` offers. Each runs in place. */
    const actions = computed((): SearchResult[] => {
        const edit: EditSource | undefined = frontmatter.value.editSource;
        const pageUrl = () => window.location.href.replace(/#.*$/, '');
        const list: SearchResult[] = [
            {
                id: 'action:theme',
                kind: 'action',
                title: isDark.value ? 'Switch to light mode' : 'Switch to dark mode',
                context: 'Appearance',
                run: () => {
                    isDark.value = !isDark.value;
                }
            },
            {
                id: 'action:copy-link',
                kind: 'action',
                title: 'Copy a link to this page',
                context: page.value.title || title.value,
                run: () => navigator.clipboard?.writeText(pageUrl())
            }
        ];
        if (edit)
            list.push({
                id: 'action:edit',
                kind: 'action',
                title: edit.kind === 'file' ? 'Edit this page on GitHub' : 'View this page’s source on GitHub',
                context: 'GitHub',
                href: edit.url
            });
        list.push(
            {
                id: 'action:report',
                kind: 'action',
                title: 'Report a problem with this page',
                context: 'GitHub issues',
                href: `${repository.value}/issues/new?title=${encodeURIComponent(`Docs: ${page.value.title}`)}`
            },
            {
                id: 'action:download',
                kind: 'action',
                title: 'Download the server',
                context: 'GitHub releases',
                href: `${repository.value}/releases?q=jsprismarine%40&expanded=true`
            }
        );
        return list;
    });

    return { menus, current, isCurrent, holdsCurrent, currentMenu, actions, repository };
}

let tracking = false;

/** Closes the menu on every navigation and records the page in the recent list. Runs once per app. */
export function trackNavigation() {
    if (tracking) return;
    tracking = true;
    const route = useRoute();
    const { page } = useData();
    watch(
        () => route.path,
        () => {
            closeAll();
            if (typeof window === 'undefined') return;
            if (page.value.title && !page.value.isNotFound) rememberPage(normalizeRoute(route.path), page.value.title);
        },
        { immediate: true }
    );
}

/**
 * The label for the shortcut modifier: ⌘ on Apple platforms, Ctrl elsewhere, as tinykeys' `$mod` reads
 * it. The server render shows ⌘ until the page mounts and can see the platform.
 */
export function useModifierLabel() {
    const label = ref('⌘');
    onMounted(() => {
        if (!/Mac|iPhone|iPad|iPod/.test(navigator.platform)) label.value = 'Ctrl';
    });
    return label;
}

/** Whether a key event comes from a field the reader is typing into, where shortcuts stay out of the way. */
export function isTyping(event: KeyboardEvent) {
    const target = event.target;
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    );
}
