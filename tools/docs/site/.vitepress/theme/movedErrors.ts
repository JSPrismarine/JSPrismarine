/** The file under the site's root where the build writes {@link MovedErrors}. */
export const MOVED_ERRORS_FILE = 'moved-errors.json';

/**
 * For each domain whose errors moved to a page per catalog module, the module of each error, by the
 * error's anchor: `{ prismarine: { 'prismarine-player-not-found': 'server' } }`.
 */
export type MovedErrors = Record<string, Record<string, string>>;

/**
 * Where an old link to a domain's page, such as `/errors/prismarine#prismarine-player-not-found`, now
 * points: the module's page with the same anchor. Undefined for any other address.
 */
export function movedErrorTarget(moved: MovedErrors, pathname: string, hash: string) {
    const domain = /^\/errors\/([^/]+)$/.exec(pathname)?.[1];
    const module = domain ? moved[domain]?.[decodeURIComponent(hash.slice(1))] : undefined;
    return module ? `/errors/${domain}/${module}${hash}` : undefined;
}
