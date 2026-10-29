/**
 * The command line `run.ts` is driven by.
 *
 * `run.ts` is a script: importing it boots a server. The argument handling lives here so it can
 * be tested without one, which matters because getting it wrong is silent — every documented
 * invocation goes through `pnpm run`, and `pnpm` punctuates its forwarded arguments.
 */

/** The capture passes, in the order a full run performs them. */
export const PASSES = ['dump', 'refworld', 'packets', 'palette'] as const;

/** One capture pass. */
export type Pass = (typeof PASSES)[number];

/**
 * Strips the separator `pnpm run` leaves in front of a script's own arguments.
 *
 * `pnpm run dump:bedrock -- --pass dump` hands the script `--`, `--pass`, `dump`. Node's
 * `parseArgs` reads that leading `--` as the end of the options and then rejects `--pass` as a
 * positional, so every documented `-- --pass …` and `-- --protocol …` invocation failed before
 * it reached a server, including the one `.github/workflows/capture.yml` runs. The separator is
 * pnpm's punctuation rather than an argument, so one leading occurrence is dropped.
 */
export const dumpArgs = (argv: readonly string[]): string[] => [...(argv[0] === '--' ? argv.slice(1) : argv)];

/**
 * Resolves `--pass`, which may be repeated or comma-separated, into the passes to run.
 *
 * @param requested Raw `--pass` values, or undefined when none was given.
 * @returns Every pass in run order when nothing was asked for, otherwise the ones named.
 * @throws Error naming the known passes when a value is not one.
 */
export const selectPasses = (requested: readonly string[] | undefined): Pass[] => {
    if (requested === undefined || requested.length === 0) return [...PASSES];
    return requested
        .flatMap((name) => name.split(','))
        .map((name) => {
            const pass = PASSES.find((known) => known === name);
            if (pass === undefined) throw new Error(`Unknown pass ${name}; expected ${PASSES.join(', ')}`);
            return pass;
        });
};
