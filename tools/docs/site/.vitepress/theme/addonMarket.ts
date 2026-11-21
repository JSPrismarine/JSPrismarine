/**
 * What the addon marketplace's components show, as the docs build writes it beside the pages it
 * stages: one {@link MarketAddon} per listed addon, JSPrismarine's and other people's.
 */

/** Who deprecated an addon, and why. */
export interface MarketDeprecation {
    /** `author` from the addon's own listing, `maintainer` from `listings.json`, `snapshot` from the refresh. */
    readonly by: 'author' | 'maintainer' | 'snapshot';
    readonly reason: string;
    /** The replacement's install id, when the author named one. */
    readonly replacedBy?: string;
    /** The replacement's page, when the marketplace lists it. */
    readonly replacedByPath?: string;
    /** The replacement's title, when the marketplace lists it. */
    readonly replacedByTitle?: string;
}

/** One version, newest first in {@link MarketAddon.versions}. */
export interface MarketVersion {
    readonly version: string;
    /** The day its pack reached the release, `YYYY-MM-DD`, when known. */
    readonly published?: string;
    /** Set on a version of JSPrismarine's own addon that `addons/` holds and no release has published yet. */
    readonly unreleased?: true;
}

/** One addon card and page. */
export interface MarketAddon {
    /** What `addon install` takes: `tps-bar`, or `owner/repo/name` for another repository's addon. */
    readonly id: string;
    readonly name: string;
    /** The repository that publishes it, `owner/repo`. */
    readonly repository: string;
    /** Whether it is one of JSPrismarine's own addons, from `addons/` in its repository. */
    readonly firstParty: boolean;
    /** The addon's page on the site, such as `/addons/tps-bar`. */
    readonly path: string;
    readonly title: string;
    readonly description: string;
    /** The newest version. */
    readonly version: string;
    /** The oldest JSPrismarine version the newest version runs on. */
    readonly minServer: string;
    /** Whether {@link minServer} is newer than the current release, so no released server runs it yet. */
    readonly needsNewerServer: boolean;
    readonly license: string;
    readonly tags: readonly string[];
    readonly authors: readonly string[];
    /** The icon's URL on the site, from the pack's `pack_icon.png`. */
    readonly icon?: string;
    readonly deprecated?: MarketDeprecation;
    /** The newest version's pack SHA-256. */
    readonly sha256: string;
    /** Every published version, newest first. */
    readonly versions: readonly MarketVersion[];
    /** Where its source lives on GitHub. */
    readonly sourceUrl: string;
    /** Where to report a problem with it. */
    readonly issuesUrl: string;
}

/** An addon's page: its card's fields, with its screenshots and README. */
export interface MarketAddonPage extends MarketAddon {
    /** The screenshots the README does not show itself, with their URLs on the site. */
    readonly screenshots: readonly { readonly src: string; readonly alt: string }[];
    /** The README rendered to HTML with raw HTML off, its first heading dropped; empty when it could not be read. */
    readonly readmeHtml: string;
}

/** The marketplace index. */
export interface Market {
    readonly addons: readonly MarketAddon[];
    /** The tags addons may list, in order. */
    readonly tags: readonly string[];
    /** The repositories the addons come from, JSPrismarine's included. */
    readonly repositories: number;
}

/** A `YYYY-MM-DD` day as the pages print it, such as `Nov 20, 2026`. */
export const formatDay = (day: string): string =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    });

/** A tag as a filter names it: `performance` is `Performance`. */
export const tagLabel = (tag: string): string => `${tag.slice(0, 1).toUpperCase()}${tag.slice(1)}`;

/**
 * When a version was released, as the addon page shows it: its day, or that it is not released
 * yet, or that its day is unknown for a published version whose release date the snapshot lacks.
 */
export const releaseLabel = (version: MarketVersion | undefined): string => {
    if (version?.published !== undefined) return formatDay(version.published);
    return version?.unreleased ? 'Not released yet' : 'Date unknown';
};
