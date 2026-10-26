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
    /** Resolves `true` when the current runtime's FFI module loads. */
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

const ffiSpecifier = process.versions.bun ? 'bun:ffi' : 'node:ffi';
const runtimeDescription = process.versions.bun ? `Bun (${process.versions.bun})` : `Node (${process.version})`;

/** Loads the current runtime's FFI module once and reports whether it is available. */
export const probeFfi = async (): Promise<boolean> => {
    try {
        // A variable keeps TypeScript and the bundler from resolving runtime-specific built-ins.
        await import(/* @vite-ignore */ ffiSpecifier);
        return true;
    } catch {
        return false;
    }
};

/**
 * Decides between the terminal UI and the plain line console.
 *
 * The TUI needs stdin and stdout to be TTYs, a `TERM` other than `dumb`, no `CI` or
 * `JSP_NO_TUI` in the environment, no `--no-tui`, and a runtime that can load its FFI module.
 * The cheap checks run first; the FFI probe runs only when they all pass. Missing FFI is the one
 * fallback the user did not ask for, so it is the only one that carries a reason.
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
            reason: `This ${runtimeDescription} cannot load ${ffiSpecifier}, so the server runs with the line console instead of the terminal UI.`
        };
    }

    return { mode: 'tui' };
};
