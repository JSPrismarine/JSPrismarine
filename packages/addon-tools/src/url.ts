import { AddonToolsErrors } from '@jsprismarine/errors/addon-tools';

/**
 * A file's URL under a base URL. The file joins the end of the base's path with one slash, so a
 * query or fragment the base has stays after it. It drops the path's trailing slashes by scanning
 * from the end rather than matching `/\/+$/`, whose backtracking is quadratic in a path full of
 * slashes.
 *
 * @throws {TypeError} `InvalidBaseUrl` when the base does not parse as a URL.
 */
export const fileUrl = (baseUrl: string, file: string): string => {
    if (!URL.canParse(baseUrl)) throw new AddonToolsErrors.InvalidBaseUrl({ url: baseUrl });
    const url = new URL(baseUrl);
    const { pathname } = url;
    let end = pathname.length;
    while (end > 0 && pathname[end - 1] === '/') end -= 1;
    url.pathname = `${pathname.slice(0, end)}/${file}`;
    return url.href;
};
