/**
 * Turns the text of a function written in this package into source an engine evaluates to that
 * function.
 *
 * The function's text is whatever the running JavaScript holds, and a transform may have
 * rewritten it. Under `tsx`, which `pnpm dev` and the client e2e server run, esbuild's `keepNames`
 * wraps every named function in a call to a `__name` helper that lives outside the function, and
 * the engine has no such global. The wrapper defines `__name` as a function that returns its
 * target, so the text runs whether or not a transform touched it.
 * @param text - The function's text, as `Function.prototype.toString` gives it.
 * @returns Source that evaluates to the function.
 */
export const engineFunctionSource = (text: string): string =>
    `(() => {\n    const __name = (target) => target;\n    return (${text});\n})()`;
