import type CommandContext from './context/CommandContext';

/**
 * Told the outcome of every context the dispatcher executes.
 *
 * Upstream's `ResultConsumer` is `onCommandComplete(context, success, result)` with an `int`
 * result, and the dispatcher calls it once per executed context: with the command's own return
 * value when it returned, and with 0 when it threw or when no command was found. This is the
 * seam `execute store result` reads, so `result` is always a number.
 */
export default interface ResultConsumer<S> {
    onCommandComplete(context: CommandContext<S>, success: boolean, result: number): void;
}
