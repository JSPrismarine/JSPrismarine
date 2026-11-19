/**
 * Whether a target reads a grammar that changed at a data pack format major.
 *
 * The parsers take the target release's data pack format major, such as 121 for 26.3 and 128 for
 * 26.4, and compare it against a `SINCE_` constant named for the change. An undefined format is
 * the oldest grammar this package reads, which is the default release's.
 *
 * @param format - The target's data pack format major, or undefined for the default grammar.
 * @param since - The format major the changed grammar starts at.
 */
export const readsSince = (format: number | undefined, since: number): boolean =>
    format !== undefined && format >= since;
