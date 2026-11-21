import { type Router, withBase } from 'vitepress';
import { MOVED_ERRORS_FILE, type MovedErrors, movedErrorTarget } from './movedErrors';

/**
 * Sends an old link to a split domain's error to the module page that holds it now. Released
 * packages and old logs link to `errors/<domain>#<code>`, and the server never sees the anchor, so
 * only the page can forward it.
 */
export async function forwardMovedError(router: Router) {
    const pathname = location.pathname.slice(withBase('/').length - 1);
    if (!location.hash || !/^\/errors\/[^/]+$/.test(pathname)) return;
    const response = await fetch(withBase(`/${MOVED_ERRORS_FILE}`));
    if (!response.ok) return;
    // The build writes this file from the error catalog, in the shape `MovedErrors` describes.
    const target = movedErrorTarget((await response.json()) as MovedErrors, pathname, location.hash);
    if (target) await router.go(withBase(target), { replace: true });
}
