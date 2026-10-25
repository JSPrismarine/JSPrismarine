/**
 * Terminal columns a string takes, counting one per code point. Every component that measures,
 * pads, or cuts text uses this so an astral-plane character never shifts an ellipsis by one.
 */
export function columns(text: string): number {
    let count = 0;
    for (const _ of text) count += 1;
    return count;
}

/** The code points of `text` from `start` up to `end`, joined back into a string. */
export function sliceColumns(text: string, start: number, end?: number): string {
    return [...text].slice(start, end).join('');
}
