import type { ConsoleFrontend } from './frontends';
import type { Supervisor } from './Supervisor';

/** Options for {@link handleFatalErrors}. */
export interface FatalErrorOptions {
    /** Its `forceStop` kills the child so the host never leaves an orphan behind. */
    supervisor: Pick<Supervisor, 'forceStop'>;
    /** Closed before the error is printed, so the message lands on a restored terminal. */
    ui: Pick<ConsoleFrontend, 'close'>;
    /** Defaults to `process.exit`. */
    exit?: (code: number) => void;
    /** Defaults to `process.stderr.write`. */
    stderr?: (text: string) => void;
}

/** Something that raises the fatal error events, normally `process`. */
export interface FatalErrorSource {
    on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
    on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
    off(event: 'uncaughtException', listener: (error: Error) => void): unknown;
    off(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
}

const describeError = (error: unknown): string =>
    error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);

/**
 * Gives the host a fatal path of its own. Without one an uncaught exception took Node's
 * default exit and left the child to notice the IPC disconnect and shut down on its own, with
 * no SIGTERM or SIGKILL behind it; a child stuck in shutdown became an orphan. The handler
 * kills the child first, which is synchronous and so survives whatever happens next, then
 * closes the frontend on a best-effort basis, prints the error, and exits 1. A second fatal
 * error while that runs is ignored.
 *
 * @returns A function that removes the handlers again.
 */
export const handleFatalErrors = (options: FatalErrorOptions, source: FatalErrorSource = process): (() => void) => {
    const exit = options.exit ?? ((code: number) => process.exit(code));
    const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
    let handled = false;

    const onFatal = (error: unknown): void => {
        if (handled) return;
        handled = true;
        options.supervisor.forceStop();
        void options.ui
            .close()
            .catch(() => {})
            .then(() => {
                stderr(`${describeError(error)}\n`);
                exit(1);
            });
    };

    source.on('uncaughtException', onFatal);
    source.on('unhandledRejection', onFatal);
    return () => {
        source.off('uncaughtException', onFatal);
        source.off('unhandledRejection', onFatal);
    };
};
