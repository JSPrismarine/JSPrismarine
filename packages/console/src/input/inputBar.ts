import type { KeyEvent } from '@opentui/core';
import { BoxRenderable, CliRenderEvents, InputRenderable, TextRenderable } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { CompletionState, formatCompletionStrip } from './completion';
import type { CommandHistory } from './history';
import type { InterruptKind } from './keys';
import { keyToAction } from './keys';

/** Candidates for the text before the cursor, as returned by `onComplete`. */
export interface CompletionResult {
    /** Replacement texts; one candidate is applied at once, several open the strip. */
    completions: readonly string[];
    /** The text ending at the cursor that each candidate replaces. */
    replace: string;
}

/** Callbacks and history for the input bar. */
export interface InputBarProps {
    /** Text drawn before the line; defaults to `> `. */
    prompt?: string;
    history: CommandHistory;
    /** Called with the trimmed line after Enter; the line is already in the history. */
    onSubmit(line: string): void;
    /** Asked for candidates on Tab. `cursor` is the offset of the cursor in `line`. */
    onComplete(line: string, cursor: number): Promise<CompletionResult>;
    /** Called for Ctrl+C: `clear` with text, then `stop` and `force` on an empty line. */
    onInterrupt(kind: InterruptKind): void;
    /** Whether the server is already stopping; an empty-line Ctrl+C then forces at once. Defaults to false. */
    serverStopping?(): boolean;
    /** Receives a short status hint, or undefined when the hint no longer applies. */
    onHint?(text: string | undefined): void;
    /** Clock for the Ctrl+C window, in milliseconds; defaults to `Date.now`. */
    now?(): number;
}

/** A focused single-line command editor with history, completion, and the Ctrl+C rule. */
export interface InputBar {
    /** The box to mount: the completion strip, when open, above the prompt row. */
    renderable: BoxRenderable;
    /** Gives the line keyboard focus. */
    focus(): void;
    /**
     * Grays the prompt and refuses Enter and Tab, for example while the server is down.
     *
     * @param hint - Placeholder shown while disabled; defaults to a server-down message.
     */
    setDisabled(disabled: boolean, hint?: string): void;
    /** Replaces the line and moves the cursor to its end. */
    setValue(value: string): void;
    /** The current line. */
    getValue(): string;
    /** Destroys the renderables. The bar must not be used afterwards. */
    dispose(): void;
}

const DEFAULT_PROMPT = '> ';
const PLACEHOLDER = 'type a command, ? for help';
const DISABLED_HINT = 'server is not running';
const STOP_HINT = 'press Ctrl+C again to stop the server';

/** Milliseconds within which repeated empty-line Ctrl+C presses escalate. */
export const INTERRUPT_WINDOW_MS = 2000;

/**
 * Builds the command input bar. The prompt takes the theme's `prompt` color, the line its `text`
 * color, and the placeholder, the completion strip, and the disabled prompt its `textMuted` color.
 *
 * Keys reach the bar only while its line is focused and after the app has had its turn: a key
 * the command catalog binds never arrives here. `keyToAction` decides what each remaining key
 * means; this function applies the action to the line, the history, and the completion strip
 * and calls the matching prop. Keys decoded as `edit` fall through to the line editor.
 *
 * Completion is asynchronous. The newest Tab wins, and any key that edits or moves the line
 * cancels the pending request, so a late result never overwrites what was typed after Tab.
 * One candidate replaces the text at once; several open a one-row strip above the prompt
 * with the first candidate applied, and Tab and Shift+Tab cycle through them. Any other key
 * closes the strip and keeps the applied candidate. The strip is re-laid out on resize.
 */
export function createInputBar(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>, props: InputBarProps): InputBar {
    const { renderer, theme } = ctx;
    const { history } = props;
    const now = props.now ?? Date.now;
    const completion = new CompletionState();

    let completionPrefix = '';
    let completionSuffix = '';
    let completionRequest = 0;
    let disabled = false;
    let disposed = false;
    let interruptPresses = 0;
    let lastInterruptAt = 0;
    let hintShown = false;

    const strip = new TextRenderable(renderer, { height: 1, fg: theme.textMuted, visible: false });
    const promptText = new TextRenderable(renderer, { content: props.prompt ?? DEFAULT_PROMPT, fg: theme.prompt });
    const input = new InputRenderable(renderer, {
        flexGrow: 1,
        placeholder: PLACEHOLDER,
        placeholderColor: theme.textMuted,
        textColor: theme.text,
        focusedTextColor: theme.text,
        cursorColor: theme.text,
        onKeyDown: handleKey
    });
    const row = new BoxRenderable(renderer, { flexDirection: 'row', height: 1, width: '100%' });
    row.add(promptText);
    row.add(input);
    const root = new BoxRenderable(renderer, { flexDirection: 'column', width: '100%' });
    root.add(strip);
    root.add(row);

    function showHint(text: string | undefined): void {
        if (text === undefined && !hintShown) return;
        hintShown = text !== undefined;
        props.onHint?.(text);
    }

    function countedInterruptPresses(): number {
        return now() - lastInterruptAt > INTERRUPT_WINDOW_MS ? 0 : interruptPresses;
    }

    function recordInterruptPress(): void {
        interruptPresses = countedInterruptPresses() + 1;
        lastInterruptAt = now();
    }

    function setLine(value: string, cursor = value.length): void {
        input.value = value;
        input.cursorOffset = cursor;
    }

    function closeCompletion(): void {
        completion.close();
        strip.visible = false;
    }

    function layoutStrip(): void {
        if (!completion.isOpen) return;
        strip.content = formatCompletionStrip(completion.candidates, completion.selectedIndex, renderer.terminalWidth);
        strip.visible = true;
    }

    function applySelectedCandidate(): void {
        const candidate = completion.selected;
        if (candidate === undefined) return;
        setLine(completionPrefix + candidate + completionSuffix, completionPrefix.length + candidate.length);
        layoutStrip();
    }

    function applyCompletion(result: CompletionResult, line: string, cursor: number): void {
        const { completions, replace } = result;
        if (completions.length === 0) return;
        completionPrefix = line.slice(0, Math.max(0, cursor - replace.length));
        completionSuffix = line.slice(cursor);
        const only = completions.length === 1 ? completions[0] : undefined;
        if (only !== undefined) {
            setLine(completionPrefix + only + completionSuffix, completionPrefix.length + only.length);
            return;
        }
        completion.open(completions, replace);
        applySelectedCandidate();
    }

    function requestCompletion(): void {
        const line = input.value;
        const cursor = input.cursorOffset;
        const request = ++completionRequest;
        props.onComplete(line, cursor).then(
            (result) => {
                if (disposed || request !== completionRequest) return;
                applyCompletion(result, line, cursor);
            },
            (error: unknown) => {
                if (disposed || request !== completionRequest) return;
                showHint(`completion failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        );
    }

    function clearLine(): void {
        setLine('');
        history.reset();
        closeCompletion();
    }

    function handleKey(key: KeyEvent): void {
        const action = keyToAction(key, {
            value: input.value,
            completing: completion.isOpen,
            disabled,
            serverStopping: props.serverStopping?.() ?? false,
            interruptPresses: countedInterruptPresses()
        });

        if (action.type !== 'hint' && action.type !== 'interrupt') {
            interruptPresses = 0;
            showHint(undefined);
        }
        // Only Tab keeps a request alive; anything else changes the line the answer was asked for.
        if (action.type !== 'complete' && action.type !== 'cycle') completionRequest += 1;

        switch (action.type) {
            case 'edit':
                closeCompletion();
                return;
            case 'ignore':
                key.preventDefault();
                return;
            case 'submit': {
                key.preventDefault();
                const line = input.value.trim();
                closeCompletion();
                history.push(line);
                setLine('');
                props.onSubmit(line);
                return;
            }
            case 'history': {
                key.preventDefault();
                closeCompletion();
                const entry = action.direction === 'previous' ? history.previous(input.value) : history.next();
                if (entry !== undefined) setLine(entry);
                return;
            }
            case 'complete':
                key.preventDefault();
                requestCompletion();
                return;
            case 'cycle':
                key.preventDefault();
                completion.cycle(action.direction);
                applySelectedCandidate();
                return;
            case 'close':
                key.preventDefault();
                closeCompletion();
                return;
            case 'hint':
                key.preventDefault();
                recordInterruptPress();
                showHint(STOP_HINT);
                return;
            case 'interrupt':
                key.preventDefault();
                if (action.kind === 'clear') {
                    interruptPresses = 0;
                    clearLine();
                } else {
                    recordInterruptPress();
                }
                showHint(undefined);
                props.onInterrupt(action.kind);
                return;
        }
    }

    renderer.on(CliRenderEvents.RESIZE, layoutStrip);

    return {
        renderable: root,
        focus: () => input.focus(),
        setDisabled: (flag, hint) => {
            disabled = flag;
            promptText.fg = flag ? theme.textMuted : theme.prompt;
            input.placeholder = flag ? (hint ?? DISABLED_HINT) : PLACEHOLDER;
            if (flag) closeCompletion();
        },
        setValue: (value) => {
            closeCompletion();
            setLine(value);
        },
        getValue: () => input.value,
        dispose: () => {
            disposed = true;
            renderer.off(CliRenderEvents.RESIZE, layoutStrip);
            root.destroyRecursively();
        }
    };
}
