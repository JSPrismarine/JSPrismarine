/** How well a query matched a text, and which code points of the text it matched. */
export interface FuzzyMatch {
    /** Higher is better. Only meaningful against other matches of the same query. */
    score: number;
    /** Code point indexes in the text, in order, one per query character. */
    positions: number[];
}

const isWordStart = (points: readonly string[], index: number): boolean => {
    if (index === 0) return true;
    const before = points[index - 1] ?? '';
    const here = points[index] ?? '';
    return /[\s._:/-]/.test(before) || (before === before.toLowerCase() && here !== here.toLowerCase());
};

/**
 * Matches `query` against `text` as a subsequence, ignoring case: every query character must
 * appear in the text, in order, with anything between them. Returns undefined when it does not.
 *
 * Each character takes the earliest place it can, then the score rewards what reads as a good
 * match: characters that follow one another, characters at the start of a word, and a match that
 * starts early. An empty query matches everything with a score of 0.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | undefined {
    const needle = [...query.toLowerCase()].filter((point) => point !== ' ');
    if (needle.length === 0) return { score: 0, positions: [] };
    const points = [...text];
    const lower = points.map((point) => point.toLowerCase());

    const positions: number[] = [];
    let from = 0;
    for (const point of needle) {
        const found = lower.indexOf(point, from);
        if (found === -1) return undefined;
        positions.push(found);
        from = found + 1;
    }

    let score = 0;
    positions.forEach((position, index) => {
        if (index > 0 && position === (positions[index - 1] ?? -2) + 1) score += 3;
        if (isWordStart(points, position)) score += 2;
    });
    // An earlier first match ranks higher, and so does a shorter text for the same characters.
    score -= (positions[0] ?? 0) * 0.5 + points.length * 0.01;
    return { score, positions };
}
