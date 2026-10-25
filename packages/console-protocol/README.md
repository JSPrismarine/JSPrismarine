# @jsprismarine/console-protocol

[![Join the Discord Server](https://img.shields.io/discord/704967868885762108?color=%237289DA&label=Discord)](https://discord.gg/6w8JWhy)
[![npm](https://img.shields.io/npm/dt/@jsprismarine/console-protocol)](https://www.npmjs.com/package/@jsprismarine/console-protocol)

Message types and links between the JSPrismarine server and its console.

The server process and the console process talk over a Node IPC channel. This package defines the messages each side sends (`ServerMessage`, `ConsoleMessage`), the host-only `SupervisorEvent` union, type guards that validate incoming JSON, and the `MessageLink` interface with three adapters: `childProcessLink()` for the server side, `subprocessLink(child)` for the host side, and `memoryLinkPair()` for tests.
