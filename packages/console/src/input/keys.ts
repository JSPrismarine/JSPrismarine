import type { CycleDirection } from './completion';

/** What a Ctrl+C press asks the application to do. */
export type InterruptKind = 'clear' | 'stop' | 'force';

/** View actions bound to single keys while the input line is empty. */
export type ToggleAction = 'help' | 'wrap' | 'top' | 'bottom' | 'search';

/** The parts of a key event the decoder reads; a subset of OpenTUI's `KeyEvent`. */
export interface InputKey {
    /** Key name as OpenTUI parses it, such as `return`, `up`, `tab`, or a letter. */
    name: string;
    /** Raw character sequence; used for printable hotkeys such as `?` and `G`. */
    sequence: string;
    ctrl: boolean;
    shift: boolean;
    meta: boolean;
}

/** Input bar state the decoder needs to turn a key into an action. */
export interface KeyState {
    /** Current line text. */
    value: string;
    /** Whether the completion strip is open. */
    completing: boolean;
    /** Whether the bar refuses commands, for example while the server is down. */
    disabled: boolean;
    /** Empty-line Ctrl+C presses already counted inside the two second window. */
    interruptPresses: number;
}

/** What the input bar does in response to a key. */
export type InputAction =
    | { type: 'submit' }
    | { type: 'history'; direction: 'previous' | 'next' }
    | { type: 'complete' }
    | { type: 'cycle'; direction: CycleDirection }
    | { type: 'close' }
    | { type: 'interrupt'; kind: InterruptKind }
    | { type: 'hint' }
    | { type: 'toggle'; action: ToggleAction }
    | { type: 'ignore' }
    | { type: 'edit' };

const ENTER_KEYS = new Set(['return', 'kpenter', 'linefeed']);

const TOGGLE_KEYS: Readonly<Record<string, ToggleAction>> = {
    '?': 'help',
    w: 'wrap',
    g: 'top',
    G: 'bottom',
    '/': 'search'
};

const hasModifier = (key: InputKey): boolean => key.ctrl || key.shift || key.meta;

/**
 * Decodes one key press into an input bar action.
 *
 * Ctrl+C clears a line with text. On an empty line the first press asks for a hint, the
 * second press within the window stops the server, and any later press forces it. Enter
 * submits a non-blank line unless the bar is disabled. Tab requests completion or cycles the
 * open strip, Shift+Tab cycles backward, and Escape closes the strip. On an empty line the
 * characters `?`, `w`, `g`, `G`, and `/` become view toggles. Everything else is `edit`, which
 * the caller hands to the text editor.
 */
export function keyToAction(key: InputKey, state: KeyState): InputAction {
    if (key.ctrl && key.name === 'c') {
        if (state.value.length > 0) return { type: 'interrupt', kind: 'clear' };
        if (state.interruptPresses === 0) return { type: 'hint' };
        return { type: 'interrupt', kind: state.interruptPresses === 1 ? 'stop' : 'force' };
    }

    if (ENTER_KEYS.has(key.name) && !hasModifier(key)) {
        return state.disabled || state.value.trim().length === 0 ? { type: 'ignore' } : { type: 'submit' };
    }

    if (key.name === 'tab' && !key.ctrl && !key.meta) {
        if (state.completing) return { type: 'cycle', direction: key.shift ? -1 : 1 };
        return state.disabled ? { type: 'ignore' } : { type: 'complete' };
    }

    if (key.name === 'escape' && !hasModifier(key)) {
        return state.completing ? { type: 'close' } : { type: 'ignore' };
    }

    if ((key.name === 'up' || key.name === 'down') && !hasModifier(key)) {
        return { type: 'history', direction: key.name === 'up' ? 'previous' : 'next' };
    }

    if (state.value.length === 0 && !key.ctrl && !key.meta) {
        const toggle = TOGGLE_KEYS[key.sequence];
        if (toggle) return { type: 'toggle', action: toggle };
    }

    return { type: 'edit' };
}
