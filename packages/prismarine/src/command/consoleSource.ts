import type { CommandSource } from '@jsprismarine/commands';

/**
 * The command sources the command manager built for a line the server console typed. A command
 * only the console may run requires its source to be one of these, which no player, no function
 * and no script's command has, whatever its permission level, and which a source `/execute`
 * derives is not either.
 */
const consoleSources = new WeakSet<CommandSource>();

/** Records a source as the console's. */
export const markConsoleSource = (source: CommandSource): CommandSource => {
    consoleSources.add(source);
    return source;
};

/** Whether a source is one the console typed a line with. */
export const isConsoleSource = (source: CommandSource): boolean => consoleSources.has(source);
