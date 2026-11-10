/**
 * Async work a synchronous command body starts.
 *
 * Brigadier's dispatcher is synchronous and a command body returns a result code, so a body that
 * has to await something (a kick, a world load, a message delivery) parks the promise here.
 * {@link collectAsyncCommands} runs one dispatch and hands back everything it parked, and the
 * command manager awaits that before the dispatch counts as finished.
 */

/** What a parked piece of work settles with: a feedback line, or nothing. */
// biome-ignore lint/suspicious/noConfusingVoidType: undefined would reject an async body that returns nothing, which most of these bodies do
export type CommandFeedback = string | void;

const running: Promise<CommandFeedback>[] = [];

/**
 * Parks work a command body started, so the dispatch that ran the body awaits it.
 *
 * @param work - The promise the body started.
 */
export const deferCommandWork = (work: Promise<CommandFeedback>): void => {
    running.push(work);
};

/**
 * Runs one synchronous dispatch and returns the work its bodies parked.
 *
 * A dispatch can run inside another (a function line inside a command body), so the work parked
 * before this call is set aside and restored afterwards, and each caller gets only its own.
 *
 * @param execute - The dispatch.
 * @returns The promises the dispatch parked, in the order the bodies parked them.
 * @throws Whatever `execute` throws, after detaching the work it had parked so far.
 */
export const collectAsyncCommands = (execute: () => void): Promise<CommandFeedback>[] => {
    const outer = running.splice(0);
    try {
        execute();
        return running.splice(0);
    } catch (error: unknown) {
        for (const pending of running.splice(0)) void pending.catch(() => {});
        throw error;
    } finally {
        running.push(...outer);
    }
};
