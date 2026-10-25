# @jsprismarine/console-protocol

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/console-protocol)](https://www.npmjs.com/package/@jsprismarine/console-protocol)

Message types and links between the JSPrismarine server and its console.

When the server runs under the terminal UI it is a child process, and the two sides talk over Node's IPC channel. This package defines what they say to each other and how a message gets from one side to the other. It depends only on `@jsprismarine/logger` (for `LogLevel`), so neither the server nor the host pulls in a renderer by importing it.

There are three message families. `ServerMessage` is everything the server sends: `hello` on connect, `log` records with a sequence number and `log.dropped` when the server had to shed records, `status` with TPS, player count, memory, and uptime, `lifecycle` state changes, and `command.result` and `complete.result` replies. `ConsoleMessage` is what the console sends back: `command`, `complete`, `subscribe` to set the log level, and `shutdown`. `SupervisorEvent` never crosses the channel; the host raises it for the UI to describe its own state (watching, a changed path, regenerating data, a restart, raw child output).

A `MessageLink<In, Out>` is the channel itself: `send`, `onMessage`, `onClose`, `close`. `send` returns `false` when the channel asks the sender to slow down. Three adapters implement it: `childProcessLink()` on the server side over `process.send`, `subprocessLink(child)` on the host side over the spawned child, and `memoryLinkPair()` for tests. `isServerMessage` and `isConsoleMessage` check that incoming JSON has one of the known shapes before you trust it.

## Exports

| Name | Kind |
| --- | --- |
| `PROTOCOL_VERSION` | constant, currently `1`; every message carries it as `v` |
| `ServerMessage`, `ServerMessageType`, `LogEntry`, `LifecycleState` | types for the server side |
| `ConsoleMessage`, `ConsoleMessageType` | types for the console side |
| `SupervisorEvent`, `SupervisorState` | types for host-local events |
| `isServerMessage`, `isConsoleMessage` | type guards |
| `MessageLink`, `LinkOptions` | the channel interface and adapter options |
| `childProcessLink`, `subprocessLink`, `memoryLinkPair` | adapters |
| `ChildProcessLink`, `ChildProcessLinkOptions`, `IpcProcess` | types for the server-side adapter |
