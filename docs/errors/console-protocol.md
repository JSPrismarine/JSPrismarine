---
title: '@jsprismarine/console-protocol errors'
description: The code, message and meaning of every error @jsprismarine/console-protocol throws.
group: Documents
category: Errors
---

# @jsprismarine/console-protocol errors

These are the errors `@jsprismarine/console-protocol` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.console-protocol -->
## `CONSOLE_PROTOCOL_NO_IPC_CHANNEL`

`childProcessLink needs an IPC channel; start the process with child_process.fork or a stdio entry of "ipc".`

Thrown as `ConsoleProtocolErrors.NoIpcChannel`, which extends `Error`.

The console link was started in a process with no IPC channel to its parent. Start the server
with `child_process.fork`, or give `spawn` an `ipc` stdio entry.
<!-- /fact -->
