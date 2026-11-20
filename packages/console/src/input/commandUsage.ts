import type { CommandInfo } from '@jsprismarine/console-protocol';

/** The command a line is calling, and which of its words is being typed. */
export interface UsageMatch {
    command: CommandInfo;
    /**
     * The word at the end of the line, counted from 0 after the command's name, or -1 while the
     * name itself is being typed. The card follows what is typed last, not the cursor. Which
     * argument the word belongs to depends on the form: see {@link formsFor}.
     */
    word: number;
}

/** A usage form and the part of it the word being typed belongs to. */
export interface UsageForm {
    form: string;
    /** Index of that part among the form's parts after the name, or undefined when there is none. */
    part: number | undefined;
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
    return { command, word: words.length - (startsNext ? 1 : 2) };
}

/**
 * The part of a form that typed word `word` belongs to, given how many words each part reads
 * (`rest` takes the rest of the line), or undefined while the name is typed or once the line
 * runs past the form's last part. A `<position>` reads three words, so in `tp @s 0 64` the `64`
 * is still part of it.
 */
export function partAt(partWords: readonly (number | 'rest')[], word: number): number | undefined {
    if (word < 0) return undefined;
    let start = 0;
    for (const [index, words] of partWords.entries()) {
        if (words === 'rest' || word < start + words) return index;
        start += words;
    }
    return undefined;
}

/**
 * The forms worth showing for `match`, each with the part the typed word belongs to: those that
 * take the word being typed. A form that ends before it, such as a bare `teleport` once a target
 * is being typed, is no longer what the line can become. When no form reaches that far every
 * form is kept, so the card never empties. Each part reads the words the server says it does,
 * or one word when it does not say.
 */
export function formsFor({ command, word }: UsageMatch): UsageForm[] {
    const forms = command.usage.map((form, index) => {
        const parts = form.split(' ').length - 1;
        const told = command.usageWords?.[index];
        const partWords = told?.length === parts ? told : Array.from({ length: parts }, () => 1);
        return { form, part: partAt(partWords, word) };
    });
    const reaching = forms.filter(({ part }) => part !== undefined);
    return reaching.length > 0 ? reaching : forms;
}

/**
 * The words of a usage form, such as `teleport`, `<targets>` and `[<yaw>`, with part `part`
 * marked. The command's name is word 0, so part `n` is word `n + 1`.
 */
export function usageWords(form: string, part: number | undefined): { text: string; current: boolean }[] {
    return form.split(' ').map((text, index) => ({ text, current: part !== undefined && index === part + 1 }));
}
