import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/server` throws. */
export const ServerErrors = defineErrors('server', {
    /**
     * The Bedrock Dedicated Server download has no `behavior_packs` folder, so it is not the
     * archive the server expects. The pinned download may have moved.
     */
    BdsArchiveHasNoBehaviorPacks: 'the Bedrock Dedicated Server zip at {url} holds no behavior_packs/',
    /**
     * A DevTools client sent an unmasked WebSocket frame, which the WebSocket protocol forbids from
     * a client.
     */
    UnmaskedWebsocketFrame: 'Client WebSocket frames must be masked',
    /**
     * The packaged server could not download the vanilla behavior pack it needs on first start. The
     * message names the address and how to supply the pack yourself.
     */
    BehaviorPackDownloadFailed:
        'Could not fetch the vanilla Bedrock behavior pack from {url}: {value}. The server needs it to define blocks and entities. Check the network and retry, or set {bdsOverride} to a local Bedrock Dedicated Server behavior_packs folder.',
    /**
     * The data bundle inside the packaged server is shorter than its index says, so the executable
     * is damaged. Download it again.
     */
    DataBundleEntryTruncated: 'data bundle entry is truncated: {path}',
    /**
     * The data bundle inside the packaged server has a malformed index, so the executable is
     * damaged. Download it again.
     */
    InvalidDataBundleIndexEntry: 'data bundle index entry is malformed',
    /**
     * The data bundle inside the packaged server has a malformed index, so the executable is
     * damaged. Download it again.
     */
    DataBundleIndexNotList: 'data bundle index is not a list',
    /**
     * The data bundle inside the packaged server is cut short, so the executable is damaged.
     * Download it again.
     */
    DataBundleIndexTruncated: 'data bundle index is truncated',
    /**
     * The data bundle inside the packaged server is cut short, so the executable is damaged.
     * Download it again.
     */
    DataBundleTruncated: 'data bundle is truncated',
    /**
     * The data bundle inside the packaged server names a file outside the folder it extracts to, so
     * it is refused. Download the executable again from the release page.
     */
    DataBundlePathEscapes: 'data bundle path escapes the extraction root: {path}',
    /**
     * This build of Node or of the packaged server has no inspector, so `--devtools` cannot attach.
     * Run from source for DevTools.
     */
    InspectorUnavailable: 'DevTools needs the Node inspector, which this build does not include',
    /** The DevTools relay's socket started without a TCP address. This is a bug in the relay. */
    RelayHasNoAddress: 'DevTools relay did not provide a TCP address',
    /** The DevTools relay's address was read before it started listening. */
    RelayNotStarted: 'DevTools relay has not started',
    /**
     * The DevTools relay forwards only to a Node inspector on this machine, and was pointed
     * elsewhere.
     */
    InvalidRelayTarget: 'DevTools relay targets must be Node inspector sockets on 127.0.0.1',
    /** A pinned download failed with that HTTP status. Check the network and retry. */
    DownloadFailed: 'the download failed with HTTP {status} {statusText}',
    /**
     * A pinned download's contents differ from the digest the server pins, so it was corrupted in
     * transit or the file changed upstream. Retry; if it repeats, the pin needs updating.
     */
    DownloadDigestMismatch: "the download's sha256 {digest} does not match the pinned {sha256}",
    /** Node's inspector opened without a WebSocket address, so DevTools cannot attach. */
    InspectorHasNoUrl: 'Node inspector did not provide a WebSocket URL',
    /** `--port` is not a valid UDP port. */
    InvalidPort: '--port must be a whole number between 1 and 65535',
    /**
     * The server's command line has an argument it does not take. Run it with `--help` for the
     * options.
     */
    UnexpectedArgument: 'Unexpected argument "{argument}"',
    /** A DevTools client sent a WebSocket frame using an extension the relay does not support. */
    UnsupportedWebsocketExtension: 'Unsupported WebSocket extension',
    /** `--watch` restarts the server from its console, which `--headless` turns off. */
    WatchWithoutConsole: '--watch needs a console; drop --headless or --watch',
    /** A DevTools client sent a WebSocket frame larger than the relay accepts. */
    WebsocketFrameTooLarge: 'WebSocket frame is too large',
    /** The server's command line could not be read. Run it with `--help` for the options. */
    InvalidCommandLineArguments: 'Invalid command-line arguments',
    /** The command-line parser refused the arguments; the message is its own. */
    CommandLineRejected: '{reason}'
});
