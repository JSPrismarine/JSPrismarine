import type CommandContext from './context/CommandContext';

/**
 * What a command node runs when the parse reaches it.
 *
 * Upstream's `Command.run` returns an `int`, and so does this: the number is the count
 * `execute store result` captures, 0 meaning the command did nothing.
 * {@link CommandDispatcher.execute} reads the value synchronously, pushes it into its result
 * list and hands it to the {@link ResultConsumer}, so a promise returned here would reach both
 * unresolved. A command with work to await has to finish that work before it returns.
 */
export default interface Command<S> {
    (context: CommandContext<S>): number;
}
