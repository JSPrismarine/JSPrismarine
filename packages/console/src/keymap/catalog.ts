/**
 * Groups the help overlay lists commands under, in display order.
 */
export const COMMAND_GROUPS = ['Input', 'Log', 'View', 'Server'] as const;

/** One of `COMMAND_GROUPS`. */
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/**
 * The keyboard convention the console binds and spells keys for: `mac` uses Command for app
 * shortcuts and writes modifiers as symbols (`⌘K`), `pc` uses Ctrl and writes `Ctrl+K`.
 */
export type KeyPlatform = 'mac' | 'pc';

/** Every `KeyPlatform`. */
export const KEY_PLATFORMS = ['mac', 'pc'] as const satisfies readonly KeyPlatform[];

/** The key convention for the operating system the console runs on. */
export const keyPlatformFor = (platform: NodeJS.Platform = process.platform): KeyPlatform =>
    platform === 'darwin' ? 'mac' : 'pc';

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
    /** Whether the chord also runs while the input line has focus; see `CatalogBinding.global`. */
    global?: true;
}

/**
 * A binding as the catalog declares it. `mod` stands for the platform's command key: Command on
 * macOS, where Ctrl is bound as well, and Ctrl elsewhere. `platform` limits a binding to one
 * platform, such as Cmd+C for copy on macOS and Ctrl+Shift+C elsewhere.
 */
export interface CatalogBinding extends KeyBinding {
    mod?: boolean;
    platform?: KeyPlatform;
    /**
     * Whether the binding also runs while the input line has focus. Set it only on chords the line
     * editor does not use, such as PgUp or Ctrl+L. Command chords are global without it, since a
     * Cmd chord cannot be typed.
     */
    global?: true;
}

/**
 * What the console knows about one command: how the help overlay labels it and which keys run it.
 */
export interface CommandSpec {
    id: string;
    title: string;
    group: CommandGroup;
    bindings: readonly CatalogBinding[];
    /** Shown in the key column when the command has no binding of its own: `binding`, then `suffix`. */
    hint?: { binding: KeyBinding; suffix: string };
    /**
     * Whether every binding also runs while the input line has focus. Only chords that cannot be
     * typed, such as Cmd+C, may set it.
     */
    global?: true;
}

/** A command catalog, in the order the help overlay lists commands within a group. */
export type CommandCatalog = readonly CommandSpec[];

const plain = (name: string): CatalogBinding => ({ name });
const ctrl = (name: string): CatalogBinding => ({ name, ctrl: true });
/** A binding the line editor leaves alone, so it runs while the input line has focus too. */
const anywhere = (binding: CatalogBinding): CatalogBinding => ({ ...binding, global: true });
const mod = (name: string): CatalogBinding => ({ name, mod: true });
const modShift = (name: string): CatalogBinding => ({ name, mod: true, shift: true });
const plainShift = (name: string): CatalogBinding => ({ name, shift: true });
const macOnly = (binding: KeyBinding): CatalogBinding => ({ ...binding, platform: 'mac' });
const pcOnly = (binding: KeyBinding): CatalogBinding => ({ ...binding, platform: 'pc' });

/**
 * Every console command with its default bindings from the UX design's shortcut table. This is
 * the only key table: the app resolves a key here before the input bar sees it when the log pane
 * has focus.
 *
 * Enter, history, Tab, and bare Ctrl+C are line editing and are decoded by the input bar, so they
 * are not listed. `server.stop` has no chord of its own; two Ctrl+C presses on an empty line reach
 * it through the input bar. `server.restart` needs a terminal that speaks the kitty keyboard
 * protocol: a legacy terminal sends the same byte for Ctrl+Shift+R as for Ctrl+R.
 *
 * App shortcuts use `mod`, so a Mac reads and presses Cmd. Most macOS terminals keep Cmd chords
 * such as Cmd+K and Cmd+F for themselves, so the Ctrl form stays bound there too. Keys that are
 * terminal conventions on every platform (Ctrl+R, Ctrl+U, Ctrl+D, Ctrl+L, Ctrl+C) stay Ctrl, and
 * so does Ctrl+W, since Cmd+W closes the terminal's tab.
 */
export const COMMAND_CATALOG = [
    { id: 'input.historySearch', title: 'Search history', group: 'Input', bindings: [anywhere(ctrl('r'))] },
    {
        id: 'input.paste',
        title: 'Paste',
        group: 'Input',
        bindings: [macOnly({ name: 'v', super: true }), pcOnly({ name: 'v', ctrl: true, shift: true })],
        global: true
    },
    { id: 'log.pageUp', title: 'Page up', group: 'Log', bindings: [anywhere(plain('pageup')), ctrl('u')] },
    { id: 'log.pageDown', title: 'Page down', group: 'Log', bindings: [anywhere(plain('pagedown')), ctrl('d')] },
    {
        id: 'log.copySelection',
        title: 'Copy selection',
        group: 'Log',
        bindings: [macOnly({ name: 'c', super: true }), pcOnly({ name: 'c', ctrl: true, shift: true })],
        global: true
    },
    { id: 'log.top', title: 'Jump to top', group: 'Log', bindings: [plain('home'), plain('g')] },
    { id: 'log.bottom', title: 'Jump to bottom', group: 'Log', bindings: [plain('end'), plainShift('g')] },
    { id: 'log.search', title: 'Search', group: 'Log', bindings: [plain('/')] },
    { id: 'log.searchNext', title: 'Next match', group: 'Log', bindings: [plain('n')] },
    { id: 'log.searchPrev', title: 'Previous match', group: 'Log', bindings: [plainShift('n')] },
    { id: 'log.nextError', title: 'Next error', group: 'Log', bindings: [ctrl('e')] },
    { id: 'log.nextWarning', title: 'Next warning', group: 'Log', bindings: [ctrl('w')] },
    { id: 'log.toggleWrap', title: 'Toggle wrap', group: 'Log', bindings: [plain('w')] },
    { id: 'log.clearView', title: 'Clear view', group: 'Log', bindings: [anywhere(ctrl('l'))] },
    { id: 'log.filter', title: 'Filter', group: 'Log', bindings: [mod('f')] },
    { id: 'view.toggleSidePane', title: 'Server details', group: 'View', bindings: [mod('b')] },
    { id: 'view.tpsGraph', title: 'TPS graph', group: 'View', bindings: [plain('t')] },
    { id: 'view.help', title: 'Help', group: 'View', bindings: [plain('?')] },
    // Global so it opens from the command line too, where it takes Ctrl+K from line editing.
    { id: 'view.palette', title: 'Command palette', group: 'View', bindings: [mod('k')], global: true },
    { id: 'view.toggleFocus', title: 'Switch typing and scrolling', group: 'Input', bindings: [plain('escape')] },
    { id: 'server.restart', title: 'Restart server', group: 'Server', bindings: [anywhere(modShift('r'))] },
    {
        id: 'server.stop',
        title: 'Stop server',
        group: 'Server',
        bindings: [],
        hint: { binding: { name: 'c', ctrl: true }, suffix: ' twice' }
    }
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

/** Whether the input line has keyboard focus. */
export interface ResolveContext {
    inputFocused: boolean;
}

const KEY_LABELS: Readonly<Record<string, string>> = {
    pageup: 'PgUp',
    pagedown: 'PgDn',
    home: 'Home',
    end: 'End',
    escape: 'Esc'
};

/**
 * The chords a binding stands for on `platform`, most preferred first: none when it belongs to the
 * other platform, Cmd then Ctrl for `mod` on macOS, and Ctrl for `mod` elsewhere.
 */
export function concreteBindings(binding: CatalogBinding, platform: KeyPlatform): KeyBinding[] {
    const { mod: isMod, platform: only, ...chord } = binding;
    if (only !== undefined && only !== platform) return [];
    if (!isMod) return [chord];
    return platform === 'mac'
        ? [
              { ...chord, super: true },
              { ...chord, ctrl: true }
          ]
        : [{ ...chord, ctrl: true }];
}

/** The chords that run `command` on `platform`, most preferred first. */
export const bindingsFor = (command: CommandSpec, platform: KeyPlatform): KeyBinding[] =>
    command.bindings.flatMap((binding) => concreteBindings(binding, platform));

/**
 * Spells a binding the way the UX table does: `PgUp`, `Ctrl+U`, `N`, `?`. A shifted letter on
 * its own is just the capital; with Ctrl it reads `Ctrl+Shift+R`, since `Ctrl+R` is a
 * different chord. On `mac` modifiers are the symbols on the keys, in Apple's order: `⌃R`,
 * `⇧⌘R`, `⌘K`.
 */
export function formatBinding(binding: KeyBinding, platform: KeyPlatform = 'pc'): string {
    const isLetter = /^[a-z]$/.test(binding.name);
    const base =
        KEY_LABELS[binding.name] ??
        (isLetter && (binding.ctrl || binding.shift || binding.super || binding.meta)
            ? binding.name.toUpperCase()
            : binding.name);
    const showShift = binding.shift === true && (!isLetter || binding.ctrl === true || binding.super === true);
    if (platform === 'mac') {
        const symbols =
            (binding.ctrl ? '⌃' : '') + (binding.meta ? '⌥' : '') + (showShift ? '⇧' : '') + (binding.super ? '⌘' : '');
        // A named key reads better apart from its modifiers: `⌃ Home` rather than `⌃Home`.
        return symbols === '' ? base : `${symbols}${base.length > 1 ? ' ' : ''}${base}`;
    }
    const parts: string[] = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.meta) parts.push('Alt');
    if (binding.super) parts.push('Super');
    if (showShift) parts.push('Shift');
    parts.push(base);
    return parts.join('+');
}

/** Spells the keys that run `command` on `platform`, preferred first, or its hint when it has none. */
export function commandKeys(command: CommandSpec, platform: KeyPlatform): string[] {
    const bindings = bindingsFor(command, platform).map((binding) => formatBinding(binding, platform));
    if (bindings.length > 0 || command.hint === undefined) return bindings;
    return [`${formatBinding(command.hint.binding, platform)}${command.hint.suffix}`];
}

const matches = (binding: KeyBinding, key: CommandKey): boolean =>
    binding.name === key.name &&
    (binding.ctrl ?? false) === key.ctrl &&
    (binding.shift ?? false) === key.shift &&
    (binding.meta ?? false) === key.meta &&
    (binding.super ?? false) === (key.super ?? false);

/** Whether a chord runs while the input line has focus: it is marked global, or it holds Command. */
const runsWhileTyping = (command: CommandSpec, binding: KeyBinding): boolean =>
    'global' in command || binding.global === true || binding.super === true;

/**
 * Returns the command the key runs, or `undefined` when no binding matches. Input focus leaves
 * every key available for editing, including unmodified shortcuts, so only global chords resolve
 * then. A chord from either platform resolves, so a Mac keyboard on a remote Linux
 * console still gets Cmd+K, and a PC keyboard on a Mac still gets Ctrl+Shift+C.
 */
export function resolveCommand(key: CommandKey, context: ResolveContext): CommandId | undefined {
    for (const command of COMMAND_CATALOG) {
        for (const platform of KEY_PLATFORMS) {
            for (const binding of bindingsFor(command, platform)) {
                if (context.inputFocused && !runsWhileTyping(command, binding)) continue;
                if (matches(binding, key)) return command.id;
            }
        }
    }
    return undefined;
}
