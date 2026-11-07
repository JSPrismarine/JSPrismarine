import type { DefaultTheme } from 'vitepress';

/** A linked page shown in a navigation menu. */
export interface MenuItem {
    description?: string;
    link: string;
    text: string;
}

/** A page promoted above the sections, with an optional command to copy. */
export interface MenuFeatured extends MenuItem {
    command?: string;
    description: string;
}

/** A group of links under one heading. */
export interface MenuSection {
    items: MenuItem[];
    text: string;
}

/** A top-level navigation entry that is either a direct link or a panel of sections. */
export interface MegaMenu {
    description: string;
    featured?: MenuFeatured;
    link?: string;
    sections: MenuSection[];
    text: string;
}

/** VitePress theme settings with the mega menu data. */
export type ThemeConfigWithMegaMenus = DefaultTheme.Config & { megaMenus: MegaMenu[] };
