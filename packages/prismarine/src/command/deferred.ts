/**
 * Async work a synchronous command body starts.
 *
 * Brigadier's dispatcher is synchronous and a command body returns a result code, so a body that
 * has to await something (a kick, a world load, a message delivery) parks the promise here.
 * {@link collectAsyncCommands} runs one dispatch and hands back everything it parked, and the
 * command manager awaits that before the dispatch counts as finished.
 *
 * Work parked once no dispatch is collecting, such as feedback a body sends after an `await`, has
 * nobody left to await it, so {@link deferCommandWork} leaves it running rather than queueing it
 * where no dispatch would take it. {@link requireCommandDispatch} is for code that must never be
 * in that position.
 */
import { PrismarineCommandErrors } from '@jsprismarine/errors/prismarine/command';

/** What a parked piece of work settles with: a feedback line, or nothing. */
// biome-ignore lint/suspicious/noConfusingVoidType: undefined would reject an async body that returns nothing, which most of these bodies do
export type CommandFeedback = string | void;

const running: Promise<CommandFeedback>[] = [];

/** How many {@link collectAsyncCommands} calls are open, one per dispatch nested in another. */
let collecting = 0;

/**
 * Parks work a command body started, so the dispatch that ran the body awaits it.
 *
 * When no dispatch is collecting, the work runs on unawaited. Every collection sets aside what was
 * queued before it and restores it afterwards, so work queued outside one would stay queued for
 * the life of the server.
 *
 * @param work - The promise the body started.
 */
export const deferCommandWork = (work: Promise<CommandFeedback>): void => {
    if (collecting > 0) running.push(work);
};

/**
 * Refuses to go on unless a dispatch is collecting the work this call is about to park.
 *
 * A host verb runs synchronously inside a command body, so a dispatch always collects what it
 * parks. A test that calls a verb directly has none, and the verb's work would fail later as an
 * unhandled rejection credited to another test, or never surface at all.
 *
 * @throws {PrismarineCommandErrors.CommandWorkOutsideDispatch} When no dispatch is collecting.
 */
export const requireCommandDispatch = (): void => {
    if (collecting === 0) throw new PrismarineCommandErrors.CommandWorkOutsideDispatch();
};

/**
 * Runs `execute` as one dispatch and returns what it returned, beside the work it parked.
 *
 * A dispatch can run inside another (a function line inside a command body), so the work parked
 * before this call is set aside and restored afterwards, and each caller gets only its own.
 *
 * @param execute - The dispatch, or a host verb a caller that is no command runs.
 * @returns What `execute` returned, and the promises it parked, in the order they were parked.
 * @throws Whatever `execute` throws, after detaching the work it had parked so far.
 */
export const collectCommandWork = <T>(
    execute: () => T
): { readonly value: T; readonly started: Promise<CommandFeedback>[] } => {
    const outer = running.splice(0);
    collecting++;
    try {
        const value = execute();
        return { value, started: running.splice(0) };
    } catch (error: unknown) {
        for (const pending of running.splice(0)) void pending.catch(() => {});
        throw error;
    } finally {
        collecting--;
        running.push(...outer);
    }
};

/**
 * Runs one synchronous dispatch and returns the work its bodies parked; see
 * {@link collectCommandWork}.
 *
 * @param execute - The dispatch.
 * @returns The promises the dispatch parked, in the order the bodies parked them.
 * @throws Whatever `execute` throws, after detaching the work it had parked so far.
 */
export const collectAsyncCommands = (execute: () => void): Promise<CommandFeedback>[] =>
    collectCommandWork(execute).started;
