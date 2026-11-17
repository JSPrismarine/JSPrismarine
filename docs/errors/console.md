---
title: '@jsprismarine/console errors'
description: The code, message and meaning of every error @jsprismarine/console throws.
group: Documents
category: Errors
---

# @jsprismarine/console errors

These are the errors `@jsprismarine/console` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.console -->
## `CONSOLE_CONSOLE_CLOSED`

`console closed`

Thrown as `ConsoleErrors.ConsoleClosed`, which extends `Error`.

The console closed while a request waited for its answer.

## `CONSOLE_EDITOR_EXITED_FROM_SIGNAL`

`EDITOR exited from {signal}`

Thrown as `ConsoleErrors.EditorExitedFromSignal`, which extends `Error`.

The editor the console opened was killed by a signal.

## `CONSOLE_EDITOR_EXITED_WITH_CODE`

`EDITOR exited with code {code}`

Thrown as `ConsoleErrors.EditorExitedWithCode`, which extends `Error`.

The editor the console opened exited with an error. Check that `VISUAL` or `EDITOR` names a
working command.

## `CONSOLE_EDITOR_IS_EMPTY`

`EDITOR is empty`

Thrown as `ConsoleErrors.EditorIsEmpty`, which extends `Error`.

`VISUAL` or `EDITOR` is set but empty. Set it to the editor command, such as `code --wait`.

## `CONSOLE_EDITOR_UNMATCHED_QUOTE`

`EDITOR contains an unmatched quote`

Thrown as `ConsoleErrors.EditorUnmatchedQuote`, which extends `Error`.

The `VISUAL` or `EDITOR` environment variable opens a quote it never closes, so the console
cannot split it into a command and its arguments.

## `CONSOLE_HIDDEN_RECORD_INDEX_OUT_OF_SYNC`

`hidden log record index is out of sync`

Thrown as `ConsoleErrors.HiddenRecordIndexOutOfSync`, which extends `Error`.

The console's log history lost track of its hidden records. This is a bug in the console's
log store.

## `CONSOLE_HIDDEN_RECORD_MISSING`

`hidden log record is missing`

Thrown as `ConsoleErrors.HiddenRecordMissing`, which extends `Error`.

The console's log history refers to a hidden record it no longer holds. This is a bug in the
console's log store.

## `CONSOLE_HIDDEN_RECORD_NOT_INDEXED`

`oldest log record is hidden without an index`

Thrown as `ConsoleErrors.HiddenRecordNotIndexed`, which extends `Error`.

The console's log history has a hidden record it never indexed. This is a bug in the
console's log store.

## `CONSOLE_LOG_HISTORY_EMPTY_AT_CAPACITY`

`log history is empty at capacity`

Thrown as `ConsoleErrors.LogHistoryEmptyAtCapacity`, which extends `Error`.

The console's log history reported itself full while holding nothing. This is a bug in the
console's log store.

## `CONSOLE_NO_EDITOR_SET`

`set VISUAL or EDITOR to open source locations`

Thrown as `ConsoleErrors.NoEditorSet`, which extends `Error`.

The console opens a log line's source location in your editor, and neither `VISUAL` nor
`EDITOR` is set. Set one, such as `EDITOR="code --wait"`.

## `CONSOLE_RENDERER_FAILED`

`The console could not start its renderer: {errorText}`

Thrown as `ConsoleErrors.RendererFailed`, which extends `Error`.

The console's terminal interface failed to start, usually because the terminal does not
support it. Run the server with `--headless` for plain log output.

## `CONSOLE_REQUEST_TIMED_OUT`

`no answer from the server after {value} s`

Thrown as `ConsoleErrors.RequestTimedOut`, which extends `Error`.

The server did not answer a console request in time. It may be stuck on a long tick; the
server's log shows what it is doing.

## `CONSOLE_SERVER_IS_NOT_RUNNING`

`server is not running`

Thrown as `ConsoleErrors.ServerIsNotRunning`, which extends `Error`.

The console sent a request while no server process was attached, such as during a restart.

## `CONSOLE_SERVER_LINK_CLOSED`

`server link closed`

Thrown as `ConsoleErrors.ServerLinkClosed`, which extends `Error`.

The link to the server closed while a console request waited for its answer, such as when the
server stopped or restarted.

## `CONSOLE_SOURCE_FILE_NOT_FOUND`

`source file not found: {source}`

Thrown as `ConsoleErrors.SourceFileNotFound`, which extends `Error`.

The source file a log line points at does not exist from the server's working directory.

## `CONSOLE_SOURCE_FILE_NOT_FOUND_IN_WORKSPACE`

`source file not found in workspace: {source}`

Thrown as `ConsoleErrors.SourceFileNotFoundInWorkspace`, which extends `Error`.

The source file a log line points at is not in this checkout, such as a log from another
version.

## `CONSOLE_UNEXPECTED_REPLY`

`expected {type}, got {messageType}`

Thrown as `ConsoleErrors.UnexpectedReply`, which extends `Error`.

The server answered a console request with a different kind of message than it asked for. The
console and the server are from different versions.
<!-- /fact -->
