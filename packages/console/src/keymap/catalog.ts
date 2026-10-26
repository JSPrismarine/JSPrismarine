/**
 * Groups the help overlay lists commands under, in display order.
 */
export const COMMAND_GROUPS = ['Input', 'Log', 'View', 'Server'] as const;

/** One of `COMMAND_GROUPS`. */
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/**
 * A key chord as OpenTUI's parser reports it: the key `name` plus the modifiers that must be
 * held. A modifier left out must not be held.
 */
export interface KeyBinding {
    /** Key name from OpenTUI's parser, such as `pageup`, `home`, a letter, or `?`. */
    name: string;
    ctrl?: boolean;
    shift?: boolean;
    meta?: boolean;
    /** OS Super key, such as Command on macOS. */
    super?: boolean;
    /** The chord only fires while the input line is empty; otherwise it edits the line. */
    emptyLineOnly?: boolean;
}

/**
 * What the console knows about one command: how the help overlay labels it and which keys run it.
 */
export interface CommandSpec {
    id: string;
    title: string;
    group: CommandGroup;
    bindings: readonly KeyBinding[];
    /** Shown in the key column when the command has no binding of its own. */
    hint?: string;
}

/** A command catalog, in the order the help overlay lists commands within a group. */
export type CommandCatalog = readonly CommandSpec[];

const plain = (name: string): KeyBinding => ({ name });
const superKey = (name: string): KeyBinding => ({ name, super: true });
const ctrlShift = (name: string): KeyBinding => ({ name, ctrl: true, shift: true });
const empty = (name: string, shift = false): KeyBinding => ({ name, shift, emptyLineOnly: true });

/**
 * Every console command with its default bindings from the UX design's shortcut table. This is
 * the only key table: the app resolves a key here before the input bar sees it.
 *
 * Enter, history, Tab, and bare Ctrl+C are line editing and are decoded by the input bar, so they
 * are not listed. `server.stop` has no chord of its own; two Ctrl+C presses on an empty line reach
 * it through the input bar. `server.restart` needs a terminal that speaks the kitty keyboard
 * protocol: a legacy terminal sends the same byte for Ctrl+Shift+R as for Ctrl+R.
 */
export const COMMAND_CATALOG = [
    { id: 'input.historySearch', title: 'Search history', group: 'Input', bindings: [] },
    { id: 'log.pageUp', title: 'Page up', group: 'Log', bindings: [plain('pageup')] },
    { id: 'log.pageDown', title: 'Page down', group: 'Log', bindings: [plain('pagedown')] },
    {
        id: 'log.copySelection',
        title: 'Copy selection',
        group: 'Log',
        bindings: [ctrlShift('c'), superKey('c')]
    },
    { id: 'log.top', title: 'Jump to top', group: 'Log', bindings: [empty('home')] },
    { id: 'log.bottom', title: 'Jump to bottom', group: 'Log', bindings: [empty('end')] },
    { id: 'log.search', title: 'Search', group: 'Log', bindings: [] },
    { id: 'log.searchNext', title: 'Next match', group: 'Log', bindings: [] },
    { id: 'log.searchPrev', title: 'Previous match', group: 'Log', bindings: [] },
    { id: 'log.nextError', title: 'Next error', group: 'Log', bindings: [] },
    { id: 'log.nextWarning', title: 'Next warning', group: 'Log', bindings: [] },
    { id: 'log.toggleWrap', title: 'Toggle wrap', group: 'Log', bindings: [] },
    { id: 'log.clearView', title: 'Clear view', group: 'Log', bindings: [] },
    { id: 'log.filter', title: 'Filter', group: 'Log', bindings: [] },
    { id: 'view.toggleSidePane', title: 'Toggle side pane', group: 'View', bindings: [] },
    { id: 'view.help', title: 'Help', group: 'View', bindings: [] },
    { id: 'view.palette', title: 'Command palette', group: 'View', bindings: [] },
    { id: 'server.restart', title: 'Restart server', group: 'Server', bindings: [] },
    { id: 'server.stop', title: 'Stop server', group: 'Server', bindings: [], hint: 'Ctrl+C twice' }
] as const satisfies CommandCatalog;

/** Id of a command in `COMMAND_CATALOG`. */
export type CommandId = (typeof COMMAND_CATALOG)[number]['id'];

/** The parts of a key event `resolveCommand` reads; a subset of OpenTUI's `ParsedKey`. */
export interface CommandKey {
    name: string;
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
    /** OS Super key, such as Command on macOS. */
    super?: boolean;
}

/** Input bar state that gates the empty-line bindings. */
export interface ResolveContext {
    inputEmpty: boolean;
}

const KEY_LABELS: Readonly<Record<string, string>> = {
    pageup: 'PgUp',
    pagedown: 'PgDn',
    home: 'Home',
    end: 'End'
};

/**
 * Spells a binding the way the UX table does: `PgUp`, `Ctrl+U`, `N`, `?`. A shifted letter on
 * its own is just the capital; with Ctrl it reads `Ctrl+Shift+R`, since `Ctrl+R` is a
 * different chord.
 */
export function formatBinding(binding: KeyBinding): string {
    const isLetter = /^[a-z]$/.test(binding.name);
    const base =
        KEY_LABELS[binding.name] ??
        (isLetter && (binding.ctrl || binding.shift || binding.super) ? binding.name.toUpperCase() : binding.name);
    const parts: string[] = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.meta) parts.push('Alt');
    if (binding.super) parts.push('Super');
    if (binding.shift && (!isLetter || binding.ctrl)) parts.push('Shift');
    parts.push(base);
    return parts.join('+');
}

const matches = (binding: KeyBinding, key: CommandKey): boolean =>
    binding.name === key.name &&
    (binding.ctrl ?? false) === key.ctrl &&
    (binding.shift ?? false) === key.shift &&
    (binding.meta ?? false) === key.meta &&
    (binding.super ?? false) === (key.super ?? false);

/**
 * Returns the command the key runs, or `undefined` when no binding matches. Bindings marked
 * `emptyLineOnly` are skipped while the input line has text so the key edits the line instead.
 */
export function resolveCommand(key: CommandKey, context: ResolveContext): CommandId | undefined {
    for (const command of COMMAND_CATALOG) {
        for (const binding of command.bindings) {
            if (binding.emptyLineOnly && !context.inputEmpty) continue;
            if (matches(binding, key)) return command.id;
        }
    }
    return undefined;
}
