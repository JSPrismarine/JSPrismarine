import type { CommandInfo } from '@jsprismarine/console-protocol';

/** The command a line is calling, and which of its arguments the cursor is on. */
export interface UsageMatch {
    command: CommandInfo;
    /**
     * The argument at the end of the line, counted from 0 after the command's name, or -1 while
     * the name itself is being typed. The card follows what is typed last, not the cursor.
     */
    argument: number;
}

/** Commands by name and alias, lowercased, as {@link usageFor} looks them up. */
export function commandIndex(commands: readonly CommandInfo[]): ReadonlyMap<string, CommandInfo> {
    const index = new Map<string, CommandInfo>();
    for (const command of commands) {
        for (const name of [command.name, ...command.aliases]) index.set(name.toLowerCase(), command);
    }
    return index;
}

/**
 * Finds the command a console line calls and the argument at its end. A first word that names no
 * command matches nothing. A line may start with `/`, as in `/tp`, which the console sends to
 * the server when the word names a command; any other `/` line is the console's own search, so
 * it matches nothing either.
 */
export function usageFor(line: string, index: ReadonlyMap<string, CommandInfo>): UsageMatch | undefined {
    const trimmed = line.trimStart().replace(/^\//, '');
    if (trimmed === '') return undefined;
    const words = trimmed.split(/\s+/).filter((word) => word !== '');
    const command = index.get((words[0] ?? '').toLowerCase());
    if (command === undefined) return undefined;
    const startsNext = /\s$/.test(trimmed);
    return { command, argument: words.length - (startsNext ? 1 : 2) };
}

/**
 * The forms worth showing for `match`: those that take the argument being typed. A form that
 * ends before it, such as a bare `teleport` once a target is being typed, is no longer what the
 * line can become. When no form reaches that far every form is kept, so the card never empties.
 */
export function formsFor({ command, argument }: UsageMatch): readonly string[] {
    const reaching = command.usage.filter((form) => form.split(' ').length > argument + 1);
    return reaching.length > 0 ? reaching : command.usage;
}

/**
 * The words of a usage form, such as `teleport`, `<targets>` and `[<yaw>`, with the argument at
 * `argument` marked. The command's name is word 0, so argument `n` is word `n + 1`.
 */
export function usageWords(form: string, argument: number): { text: string; current: boolean }[] {
    return form.split(' ').map((text, index) => ({ text, current: argument >= 0 && index === argument + 1 }));
}
