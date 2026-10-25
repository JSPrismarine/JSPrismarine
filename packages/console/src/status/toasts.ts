import { BoxRenderable, TextRenderable } from '@opentui/core';

import { ToastQueue } from './toastQueue';
import type { StatusColors } from './segments';
import type { StatusContext } from './statusBar';
import type { ToastInput } from './toastQueue';

/**
 * Clock and timer functions the toast stack schedules expiry with. Defaults to the globals;
 * tests pass a manual clock. `Handle` is whatever `setTimeout` returns.
 */
export interface ToastTimers<Handle = unknown> {
    now(): number;
    setTimeout(callback: () => void, delayMs: number): Handle;
    clearTimeout(handle: Handle): void;
}

/**
 * Colors, limits, and timers of a toast stack.
 */
export interface ToastStackProps {
    colors: StatusColors;
    /** Toasts shown at once; defaults to 3. Overflow drops the oldest non-sticky toast. */
    maxVisible?: number;
    /** Lifetime of a toast that sets neither `sticky` nor `ttlMs`; defaults to 4000. */
    defaultTtlMs?: number;
    timers?: ToastTimers;
}

/**
 * A column of bordered toasts pinned to the top right of its parent. Non-sticky toasts leave on
 * their own; sticky ones wait for `dismiss` or `clear`.
 */
export interface ToastStack {
    /** Absolutely positioned; add it to the pane the toasts should float over. */
    renderable: BoxRenderable;
    /** Shows a toast and returns its id for `dismiss`. */
    push(toast: ToastInput): string;
    dismiss(id: string): void;
    /** Removes every toast, sticky ones included. */
    clear(): void;
    /** Cancels the expiry timer and destroys the renderables. */
    dispose(): void;
}

const defaultTimers: ToastTimers<ReturnType<typeof setTimeout>> = {
    now: () => Date.now(),
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: (handle) => clearTimeout(handle)
};

/**
 * Creates the toast stack. One timer is armed for the earliest expiry and re-armed after each
 * change, so pushing many toasts never schedules more than one callback.
 */
export function createToastStack(ctx: StatusContext, props: ToastStackProps): ToastStack {
    const { renderer } = ctx;
    const { colors } = props;
    const timers: ToastTimers = props.timers ?? defaultTimers;
    const queue = new ToastQueue({ maxVisible: props.maxVisible ?? 3, defaultTtlMs: props.defaultTtlMs ?? 4000 });
    let timer: unknown;

    const renderable = new BoxRenderable(renderer, {
        id: 'toast-stack',
        position: 'absolute',
        top: 0,
        right: 0,
        zIndex: 10,
        flexDirection: 'column',
        alignItems: 'flex-end'
    });

    const render = () => {
        for (const child of renderable.getChildren()) {
            renderable.remove(child);
            child.destroyRecursively();
        }
        for (const toast of queue.toasts) {
            const box = new BoxRenderable(renderer, {
                id: toast.id,
                border: true,
                borderStyle: 'rounded',
                borderColor: colors[toast.tone],
                backgroundColor: colors.background,
                paddingLeft: 1,
                paddingRight: 1
            });
            box.add(new TextRenderable(renderer, { id: `${toast.id}-text`, content: toast.text, fg: colors.text }));
            renderable.add(box);
        }
    };

    const arm = () => {
        if (timer !== undefined) {
            timers.clearTimeout(timer);
            timer = undefined;
        }
        const next = queue.nextExpiry();
        if (next === undefined) return;
        timer = timers.setTimeout(
            () => {
                timer = undefined;
                queue.expire(timers.now());
                render();
                arm();
            },
            Math.max(0, next - timers.now())
        );
    };

    return {
        renderable,
        push(toast) {
            const id = queue.push(toast, timers.now());
            render();
            arm();
            return id;
        },
        dismiss(id) {
            if (!queue.dismiss(id)) return;
            render();
            arm();
        },
        clear() {
            queue.clear();
            render();
            arm();
        },
        dispose() {
            queue.clear();
            arm();
            renderable.destroyRecursively();
        }
    };
}
