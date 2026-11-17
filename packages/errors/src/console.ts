import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/console` throws. */
export const ConsoleErrors = defineErrors('console', {
    /**
     * The console's terminal interface failed to start, usually because the terminal does not
     * support it. Run the server with `--headless` for plain log output.
     */
    RendererFailed: 'The console could not start its renderer: {errorText}',
    /**
     * The `VISUAL` or `EDITOR` environment variable opens a quote it never closes, so the console
     * cannot split it into a command and its arguments.
     */
    EditorUnmatchedQuote: 'EDITOR contains an unmatched quote',
    /**
     * `VISUAL` or `EDITOR` is set but empty. Set it to the editor command, such as `code --wait`.
     */
    EditorIsEmpty: 'EDITOR is empty',
    /**
     * The server answered a console request with a different kind of message than it asked for. The
     * console and the server are from different versions.
     */
    UnexpectedReply: 'expected {type}, got {messageType}',
    /**
     * The console's log history lost track of its hidden records. This is a bug in the console's
     * log store.
     */
    HiddenRecordIndexOutOfSync: 'hidden log record index is out of sync',
    /**
     * The console's log history refers to a hidden record it no longer holds. This is a bug in the
     * console's log store.
     */
    HiddenRecordMissing: 'hidden log record is missing',
    /**
     * The console's log history reported itself full while holding nothing. This is a bug in the
     * console's log store.
     */
    LogHistoryEmptyAtCapacity: 'log history is empty at capacity',
    /**
     * The server did not answer a console request in time. It may be stuck on a long tick; the
     * server's log shows what it is doing.
     */
    RequestTimedOut: 'no answer from the server after {value} s',
    /**
     * The console's log history has a hidden record it never indexed. This is a bug in the
     * console's log store.
     */
    HiddenRecordNotIndexed: 'oldest log record is hidden without an index',
    /**
     * The console sent a request while no server process was attached, such as during a restart.
     */
    ServerIsNotRunning: 'server is not running',
    /**
     * The console opens a log line's source location in your editor, and neither `VISUAL` nor
     * `EDITOR` is set. Set one, such as `EDITOR="code --wait"`.
     */
    NoEditorSet: 'set VISUAL or EDITOR to open source locations',
    /** The source file a log line points at does not exist from the server's working directory. */
    SourceFileNotFound: 'source file not found: {source}',
    /**
     * The source file a log line points at is not in this checkout, such as a log from another
     * version.
     */
    SourceFileNotFoundInWorkspace: 'source file not found in workspace: {source}',
    /** The editor the console opened was killed by a signal. */
    EditorExitedFromSignal: 'EDITOR exited from {signal}',
    /**
     * The editor the console opened exited with an error. Check that `VISUAL` or `EDITOR` names a
     * working command.
     */
    EditorExitedWithCode: 'EDITOR exited with code {code}',
    /**
     * The link to the server closed while a console request waited for its answer, such as when the
     * server stopped or restarted.
     */
    ServerLinkClosed: 'server link closed',
    /** The console closed while a request waited for its answer. */
    ConsoleClosed: 'console closed'
});
