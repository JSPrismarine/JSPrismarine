/** The page anchor for a release on the releases page, such as `v0-20-0` for 0.20.0. */
export function releaseAnchor(version: string) {
    return `v${version.replaceAll('.', '-')}`;
}
