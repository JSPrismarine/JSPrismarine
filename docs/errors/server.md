---
title: '@jsprismarine/server errors'
description: The code, message and meaning of every error @jsprismarine/server throws.
group: Documents
category: Errors
---

# @jsprismarine/server errors

These are the errors `@jsprismarine/server` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.server -->
## `SERVER_BDS_ARCHIVE_HAS_NO_BEHAVIOR_PACKS`

`the Bedrock Dedicated Server zip at {url} holds no behavior_packs/`

Thrown as `ServerErrors.BdsArchiveHasNoBehaviorPacks`, which extends `Error`.

The Bedrock Dedicated Server download has no `behavior_packs` folder, so it is not the
archive the server expects. The pinned download may have moved.

## `SERVER_BEHAVIOR_PACK_DOWNLOAD_FAILED`

`Could not fetch the vanilla Bedrock behavior pack from {url}: {value}. The server needs it to define blocks and entities. Check the network and retry, or set {bdsOverride} to a local Bedrock Dedicated Server behavior_packs folder.`

Thrown as `ServerErrors.BehaviorPackDownloadFailed`, which extends `Error`.

The packaged server could not download the vanilla behavior pack it needs on first start. The
message names the address and how to supply the pack yourself.

## `SERVER_COMMAND_LINE_REJECTED`

`{reason}`

Thrown as `ServerErrors.CommandLineRejected`, which extends `Error`.

The command-line parser refused the arguments; the message is its own.

## `SERVER_DATA_BUNDLE_ENTRY_TRUNCATED`

`data bundle entry is truncated: {path}`

Thrown as `ServerErrors.DataBundleEntryTruncated`, which extends `Error`.

The data bundle inside the packaged server is shorter than its index says, so the executable
is damaged. Download it again.

## `SERVER_DATA_BUNDLE_INDEX_NOT_LIST`

`data bundle index is not a list`

Thrown as `ServerErrors.DataBundleIndexNotList`, which extends `Error`.

The data bundle inside the packaged server has a malformed index, so the executable is
damaged. Download it again.

## `SERVER_DATA_BUNDLE_INDEX_TRUNCATED`

`data bundle index is truncated`

Thrown as `ServerErrors.DataBundleIndexTruncated`, which extends `Error`.

The data bundle inside the packaged server is cut short, so the executable is damaged.
Download it again.

## `SERVER_DATA_BUNDLE_PATH_ESCAPES`

`data bundle path escapes the extraction root: {path}`

Thrown as `ServerErrors.DataBundlePathEscapes`, which extends `Error`.

The data bundle inside the packaged server names a file outside the folder it extracts to, so
it is refused. Download the executable again from the release page.

## `SERVER_DATA_BUNDLE_TRUNCATED`

`data bundle is truncated`

Thrown as `ServerErrors.DataBundleTruncated`, which extends `Error`.

The data bundle inside the packaged server is cut short, so the executable is damaged.
Download it again.

## `SERVER_DOWNLOAD_DIGEST_MISMATCH`

`the download's sha256 {digest} does not match the pinned {sha256}`

Thrown as `ServerErrors.DownloadDigestMismatch`, which extends `Error`.

A pinned download's contents differ from the digest the server pins, so it was corrupted in
transit or the file changed upstream. Retry; if it repeats, the pin needs updating.

## `SERVER_DOWNLOAD_FAILED`

`the download failed with HTTP {status} {statusText}`

Thrown as `ServerErrors.DownloadFailed`, which extends `Error`.

A pinned download failed with that HTTP status. Check the network and retry.

## `SERVER_INSPECTOR_HAS_NO_URL`

`Node inspector did not provide a WebSocket URL`

Thrown as `ServerErrors.InspectorHasNoUrl`, which extends `Error`.

Node's inspector opened without a WebSocket address, so DevTools cannot attach.

## `SERVER_INSPECTOR_UNAVAILABLE`

`DevTools needs the Node inspector, which this build does not include`

Thrown as `ServerErrors.InspectorUnavailable`, which extends `Error`.

This build of Node or of the packaged server has no inspector, so `--devtools` cannot attach.
Run from source for DevTools.

## `SERVER_INVALID_COMMAND_LINE_ARGUMENTS`

`Invalid command-line arguments`

Thrown as `ServerErrors.InvalidCommandLineArguments`, which extends `Error`.

The server's command line could not be read. Run it with `--help` for the options.

## `SERVER_INVALID_DATA_BUNDLE_INDEX_ENTRY`

`data bundle index entry is malformed`

Thrown as `ServerErrors.InvalidDataBundleIndexEntry`, which extends `Error`.

The data bundle inside the packaged server has a malformed index, so the executable is
damaged. Download it again.

## `SERVER_INVALID_PORT`

`--port must be a whole number between 1 and 65535`

Thrown as `ServerErrors.InvalidPort`, which extends `Error`.

`--port` is not a valid UDP port.

## `SERVER_INVALID_RELAY_TARGET`

`DevTools relay targets must be Node inspector sockets on 127.0.0.1`

Thrown as `ServerErrors.InvalidRelayTarget`, which extends `Error`.

The DevTools relay forwards only to a Node inspector on this machine, and was pointed
elsewhere.

## `SERVER_RELAY_HAS_NO_ADDRESS`

`DevTools relay did not provide a TCP address`

Thrown as `ServerErrors.RelayHasNoAddress`, which extends `Error`.

The DevTools relay's socket started without a TCP address. This is a bug in the relay.

## `SERVER_RELAY_NOT_STARTED`

`DevTools relay has not started`

Thrown as `ServerErrors.RelayNotStarted`, which extends `Error`.

The DevTools relay's address was read before it started listening.

## `SERVER_UNEXPECTED_ARGUMENT`

`Unexpected argument "{argument}"`

Thrown as `ServerErrors.UnexpectedArgument`, which extends `Error`.

The server's command line has an argument it does not take. Run it with `--help` for the
options.

## `SERVER_UNMASKED_WEBSOCKET_FRAME`

`Client WebSocket frames must be masked`

Thrown as `ServerErrors.UnmaskedWebsocketFrame`, which extends `Error`.

A DevTools client sent an unmasked WebSocket frame, which the WebSocket protocol forbids from
a client.

## `SERVER_UNSUPPORTED_WEBSOCKET_EXTENSION`

`Unsupported WebSocket extension`

Thrown as `ServerErrors.UnsupportedWebsocketExtension`, which extends `Error`.

A DevTools client sent a WebSocket frame using an extension the relay does not support.

## `SERVER_WATCH_WITHOUT_CONSOLE`

`--watch needs a console; drop --headless or --watch`

Thrown as `ServerErrors.WatchWithoutConsole`, which extends `Error`.

`--watch` restarts the server from its console, which `--headless` turns off.

## `SERVER_WEBSOCKET_FRAME_TOO_LARGE`

`WebSocket frame is too large`

Thrown as `ServerErrors.WebsocketFrameTooLarge`, which extends `Error`.

A DevTools client sent a WebSocket frame larger than the relay accepts.
<!-- /fact -->
