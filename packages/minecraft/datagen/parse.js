/**
 * Reads Mojang's `enums.html` into plain data.
 *
 * The file is machine generated and rigidly regular, so it is read with expressions rather
 * than a parser dependency. That is a deliberate trade: an HTML parser would be more
 * forgiving of a layout change, and being forgiving is the wrong behaviour here. A layout
 * change means the input is no longer what this was written against, and the only safe
 * answer is to stop - so {@link parseEnums} throws rather than returning a plausible subset,
 * and the caller checks the counts on top of that.
 *
 * Two layouts exist and both are supported, because the releases this project needs span the
 * change. Protocol 748 uses the older one.
 */

/**
 * Newer layout: the enum's name, then a nested table holding one row per member.
 *
 * The members have to be claimed by this expression rather than left to the member one,
 * because a member row ends in `</td></tr>` too. Reaching for the enclosing `</table>` is what
 * distinguishes the enum's cell from the first member inside it - stopping at the first
 * `</td></tr>`, as a cell-shaped expression does, yields an enum of exactly one member.
 */
const NESTED_ROW = /<tr>\s*<td>([A-Za-z][^<]*)<\/td>\s*<td>\s*(<table[\s\S]*?<\/table>)\s*<\/td>\s*<\/tr>/g;

/** Newer layout: each member is a row of that nested table - name, value, then a description. */
const NESTED_MEMBER = /<tr>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/g;

/** Older layout: the enum's name, then all of its members in one cell. */
const INLINE_ROW = /<tr>\s*<td>([A-Za-z][^<]*)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;

/** Older layout: `Name = Value` separated by line breaks, all in one cell. */
const INLINE_MEMBER = /([\w.:\-]+)\s*=\s*([^<]+)/g;

/**
 * Which of the two layouts the document is written in.
 *
 * A cell that opens with a table is the newer one and nothing else produces that shape. The
 * choice is made per document rather than per row: the releases this project spans use one
 * layout throughout - 748 is inline for all 137 of its enums, 2168 nested for all 196 - and
 * deciding once means a mixed document fails the counts below instead of being half read.
 */
const isNested = (html) => /<td>\s*<table/.test(html);

/**
 * A member's value, or `null` when it is not a number.
 *
 * Decimal in some releases and hex in others - `None` is `65535` in one branch and `0xffff`
 * in another - so both are read explicitly. Anything else is an alias to another member
 * (`WorldDefault = Survival`), which is skipped rather than guessed at: resolving it would
 * mean interpreting the enum, and this only reads it.
 */
const toValue = (raw) => {
    const literal = raw.trim().split(/\s/)[0];

    if (/^-?0[Xx][\da-fA-F]+$/.test(literal)) return Number.parseInt(literal, 16);
    if (/^-?\d+$/.test(literal)) return Number.parseInt(literal, 10);

    return null;
};

/**
 * Every enum in the document.
 * @param {string} html - the contents of `enums.html`.
 * @returns {Map<string, Array<{name: string, value: number}>>} enums by their Mojang name.
 * @throws when the document yields nothing, which means the shape changed again.
 */
export const parseEnums = (html) => {
    const enums = new Map();
    const nested = isNested(html);
    const [ROW, MEMBER] = nested ? [NESTED_ROW, NESTED_MEMBER] : [INLINE_ROW, INLINE_MEMBER];

    for (const [, name, payload] of html.matchAll(ROW)) {
        const members = [];

        for (const [, member, raw] of payload.matchAll(MEMBER)) {
            const value = toValue(raw);
            if (value !== null) members.push({ name: member.trim(), value });
        }

        if (members.length > 0) enums.set(name.trim(), members);
    }

    if (enums.size === 0) {
        throw new Error('No enums found in enums.html: the document shape has changed and the parser has not.');
    }

    return enums;
};

export default parseEnums;
