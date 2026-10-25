/**
 * Everything the TUI gate reads, passed in so the decision is a pure function of its inputs.
 */
export interface TuiGateInput {
    /** Whether `--no-tui` was on the command line. */
    noTui: boolean;
    /** The process environment; `CI` and `JSP_NO_TUI` disable the TUI when set. */
    env: Readonly<Record<string, string | undefined>>;
    stdinIsTTY: boolean | undefined;
    stdoutIsTTY: boolean | undefined;
    /** The `TERM` variable; `dumb` disables the TUI. */
    term: string | undefined;
    /** Resolves `true` when `node:ffi` loads, which the terminal renderer needs. */
    ffiAvailable: () => Promise<boolean>;
}

/**
 * Which console the entry point runs. `reason` is set only when the fallback would surprise
 * the user and is one sentence fit for printing before the server starts.
 */
export interface ModeDecision {
    mode: 'tui' | 'plain';
    reason?: string;
}

/** Loads `node:ffi` once and reports whether this Node build offers it. */
export const probeFfi = async (): Promise<boolean> => {
    try {
        // A string variable rather than a literal so neither TypeScript nor the bundler needs
        // type declarations for a module that only exists on Node 26.4 and later.
        const specifier = 'node:ffi';
        await import(/* @vite-ignore */ specifier);
        return true;
    } catch {
        return false;
    }
};

/**
 * Decides between the terminal UI and the plain line console.
 *
 * The TUI needs stdin and stdout to be TTYs, a `TERM` other than `dumb`, no `CI` or
 * `JSP_NO_TUI` in the environment, no `--no-tui`, and a Node that can load `node:ffi`. The
 * cheap checks run first; the FFI probe runs only when they all pass. A missing `node:ffi`
 * is the one fallback the user did not ask for, so it is the only one that carries a reason.
 */
export const decideMode = async (input: TuiGateInput): Promise<ModeDecision> => {
    const { noTui, env, stdinIsTTY, stdoutIsTTY, term } = input;
    if (
        noTui ||
        !stdinIsTTY ||
        !stdoutIsTTY ||
        term === 'dumb' ||
        env.CI !== undefined ||
        env.JSP_NO_TUI !== undefined
    ) {
        return { mode: 'plain' };
    }

    if (!(await input.ffiAvailable())) {
        return {
            mode: 'plain',
            reason: `This Node (${process.version}) cannot load node:ffi, so the server runs with the line console instead of the terminal UI.`
        };
    }

    return { mode: 'tui' };
};
