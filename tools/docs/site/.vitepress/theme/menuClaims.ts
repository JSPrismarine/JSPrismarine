import type { MegaMenu } from './types.ts';

/** A menu link as a route: `/guide/running#worlds` is `/guide/running`. */
const linkRoute = (link: string) => link.replace(/#.*$/, '');

/**
 * The menu that claims a page (see {@link MegaMenu.claimsPages}): one that links the page, or whose
 * featured link is a folder that holds it. The bar, the breadcrumb, the search and the link preview
 * cards all ask it first, so they agree on where a page belongs.
 * @param route - The page's route from the site root, without the deploy base: `/addons/tps-bar`.
 */
export function claimingMenu<Menu extends MegaMenu>(route: string, menus: readonly Menu[]): Menu | undefined {
    return menus.find(({ claimsPages, featured, sections }) => {
        if (!claimsPages) return false;
        const folder = featured && linkRoute(featured.link);
        if (folder?.endsWith('/') && route.startsWith(folder)) return true;
        return sections.some(({ items }) => items.some(({ link }) => linkRoute(link) === route));
    });
}

/** A menu's own overview page: its featured link when that is a folder, such as the marketplace at `/addons/`. */
export function menuOverview(menu: MegaMenu | undefined): string | undefined {
    const link = menu?.featured && linkRoute(menu.featured.link);
    return link?.endsWith('/') ? link : undefined;
}
