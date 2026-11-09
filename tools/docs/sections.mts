/** A directory under `docs/` that the site publishes at the path of the same name. */
export interface DocSection {
    dir: string;
    /** Page file names, without extension, that sort ahead of the alphabetical rest. */
    first?: string[];
    title: string;
}

/** Contributor-only directories under `docs/` (such as `design`) are left out on purpose. */
export const sections = [
    { dir: 'guide', title: 'Guides', first: ['running'] },
    { dir: 'brand', title: 'Brand' },
    { dir: 'data-driven', title: 'Data-driven engine' },
    { dir: 'adr', title: 'Decisions' },
    { dir: 'plans', title: 'Plans' },
    { dir: 'research', title: 'Research' }
] satisfies DocSection[];

/** Reads a page's title from its first heading, falling back to its file name. */
export function pageTitle(markdown: string, fallback: string) {
    return /^# (.+)$/m.exec(markdown)?.[1].trim() ?? fallback;
}
