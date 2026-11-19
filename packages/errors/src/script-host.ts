import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/** Why the script host's native library cannot be loaded, with what to do about it in the message. */
export abstract class NativeLibraryError extends JSPrismarineError {
    public override name = 'NativeLibraryError';
}

/**
 * A script threw, and nothing in the script caught it. `scriptName`, `scriptMessage` and
 * `scriptStack` hold the error's name, message and stack as the engine saw them.
 */
export abstract class ScriptError extends JSPrismarineError {
    public override name = 'ScriptError';

    /** The name of the error the script threw, empty when it threw a value that is not an error. */
    public get scriptName(): string {
        return String(this.params.scriptName);
    }

    /** The message of the error the script threw, or the thrown value as a string. */
    public get scriptMessage(): string {
        return String(this.params.scriptMessage);
    }

    /** The script's stack where it threw, empty when the engine recorded none. */
    public get scriptStack(): string {
        return String(this.params.scriptStack);
    }
}

/**
 * A script ran out of its step budget. The engine stopped it with an error no script can catch,
 * at the same step on every run.
 */
export abstract class ScriptTerminatedError extends ScriptError {
    public override name = 'ScriptTerminatedError';
}

/** A script went over the engine's memory limit, and the error reached the host. */
export abstract class ScriptOutOfMemoryError extends ScriptError {
    public override name = 'ScriptOutOfMemoryError';
}

/** Why a debugger connection was refused, with Bedrock Dedicated Server's message for it. */
export abstract class DebuggerConnectionError extends JSPrismarineError {
    public override name = 'DebuggerConnectionError';
}

/** Why bytes from a debugger connection are not a frame. */
export abstract class DebuggerFramingError extends JSPrismarineError {
    public override name = 'DebuggerFramingError';
}

/** Why the debugger transport refused to listen, or a connection failed. */
export abstract class DebuggerTransportError extends JSPrismarineError {
    public override name = 'DebuggerTransportError';
}

/**
 * The errors `@jsprismarine/script-host` throws in Node.js. Errors a script sees from code that runs
 * inside the engine are the engine's own `TypeError`, `RangeError` and `ReferenceError`, as on
 * Bedrock Dedicated Server, and are not listed here.
 */
export const ScriptHostErrors = defineErrors('script-host', {
    /**
     * The Node.js running the server has no `node:ffi`, which the script host loads its native
     * library with. Run a Node.js build with FFI support, and do not pass
     * `--no-experimental-ffi`.
     */
    FfiUnavailable: {
        message:
            'node:ffi is not available in Node.js {version}. Run a Node.js build with FFI support, without --no-experimental-ffi.',
        base: NativeLibraryError
    },
    /**
     * `JSP_SCRIPT_HOST_LIBRARY` names a library file that does not exist. Point it at a build of the
     * library, or unset it to use the one the package installed.
     */
    LibraryOverrideMissing: {
        message: '{libraryEnv} names {override}, which does not exist',
        base: NativeLibraryError
    },
    /**
     * The package has no native library for this platform: its install script has not run, or in a
     * checkout, `build:native` has not. The message says how to get it.
     */
    LibraryNotInstalled: {
        message: '{packageName} has no build for {platform} at {installed}. {advice}',
        base: NativeLibraryError
    },
    /**
     * No prebuilt script host library exists for this platform. Build it from a checkout with
     * `pnpm --filter @jsprismarine/script-host run build:native` and point `JSP_SCRIPT_HOST_LIBRARY`
     * at it.
     */
    NoBuildForPlatform: { message: '{packageName} publishes no build for {platform}.', base: NativeLibraryError },
    /**
     * The library file has no published digest to check against for this platform, and it was not
     * built locally either, so it is refused.
     */
    NoPublishedBuildToCheck: {
        message: '{path} has SHA-256 {digest}, and {packageName} publishes no build for {platform} to check it against',
        base: NativeLibraryError
    },
    /**
     * The library file is not the build the package publishes, so it was altered or comes from
     * another version. Reinstall the package.
     */
    DigestDoesNotMatchPublishedBuild: {
        message: '{path} has SHA-256 {digest}, not the {published} {packageName} publishes for {platform}',
        base: NativeLibraryError
    },
    /**
     * Downloading the script host library failed with that HTTP status. Retry, or point
     * `JSP_SCRIPT_HOST_LIBRARY` at a library you built.
     */
    DownloadFailed: '{url} answered {status}',
    /**
     * The downloaded library does not match the digest the package publishes, so it was corrupted
     * in transit or replaced. Retry the install.
     */
    DownloadDigestMismatch:
        '{file} has SHA-256 {digest} and {byteLength} bytes; the manifest expects {sha256} and {bytes}',
    /**
     * The package's native manifest is malformed, so the package was published broken. Reinstall
     * it, or report it.
     */
    InvalidNativeManifest: 'The native manifest needs `build` and `baseUrl` strings',
    /**
     * The package's native manifest has a malformed platform entry, so the package was published
     * broken. Reinstall it, or report it.
     */
    InvalidNativeManifestEntry: "The native manifest's entry for {key} is malformed",
    /**
     * The native library was built for a different version of this package. Rebuild it with
     * `pnpm --filter @jsprismarine/script-host run build:native`.
     */
    LibraryInterfaceMismatch: {
        message: '{path} has interface version {version}, and this binding speaks {abiVersion}',
        base: NativeLibraryError
    },
    /**
     * The native library could not create a QuickJS runtime, usually because the process is out of
     * memory. Free memory, or run fewer worlds with scripts.
     */
    EngineNotCreated: 'The script engine could not be created',
    /**
     * Code attached a second debugger to an engine that already has one. Detach the first with
     * `EngineDebugger.detach` before attaching another.
     */
    DebuggerAlreadyAttached: 'A debugger is already attached to this engine',
    /**
     * A host function destroyed the engine that called it. Destroy the engine after the call into
     * it returns. This is a bug in the server; report it with the stack trace.
     */
    EngineDestroyedDuringHostCall: 'A script engine cannot be destroyed while it calls the host',
    /**
     * Code used a script engine after destroying it. This is a bug in the server; report it with
     * the stack trace.
     */
    EngineDestroyed: 'The script engine has been destroyed',
    /**
     * The native engine refused a handle or a value the host passed, such as a handle it already
     * freed. This is a bug in the script host; report it with the stack trace.
     */
    EngineRejectedValue: { message: 'The engine rejected a handle or a value', base: RangeError },
    /**
     * The native library asked the host for an operation the host does not know, so the library and
     * the package come from different builds. Rebuild the library with `build:native`.
     */
    UnknownEngineRequest: { message: 'The engine sent an unknown request {op}', base: RangeError },
    /**
     * A script called a host function the engine no longer has. This is a bug in the script host;
     * report it with the stack trace.
     */
    UnknownHostFunction: { message: 'No host function has id {id}', base: ReferenceError },
    /**
     * The native library paused a script for a reason the host does not know, so the library and
     * the package come from different builds. Rebuild the library with `build:native`.
     */
    UnknownPauseReason: { message: 'The engine stopped for an unknown reason {code}', base: RangeError },
    /**
     * A script imported a module that no pack and no Script API module provides. The script sees it
     * as a `ReferenceError`. Check the import's name and the pack's files.
     */
    ModuleNotFound: { message: "Could not find module '{name}'", base: ReferenceError },
    /**
     * A script threw, and nothing in the script caught it. The message is the script's error as
     * it prints: its name, a colon and its message, or the message alone when the script threw a
     * value that is not an error. Fix the script; its stack is on the error as `scriptStack`.
     */
    ScriptThrew: { message: '{error}', base: ScriptError },
    /**
     * A script ran past its step budget, such as in an endless loop, and the engine stopped it.
     * Fix the loop, or raise the watchdog's limits in the server's script settings.
     */
    ScriptTerminated: { message: '{error}', base: ScriptTerminatedError },
    /**
     * A script went over the engine's memory limit. Fix what the script keeps, or raise the memory
     * limit in the server's script settings.
     */
    ScriptOutOfMemory: { message: '{error}', base: ScriptOutOfMemoryError },
    /**
     * A script used a Script API member that the pinned Bedrock Dedicated Server has and
     * JSPrismarine does not implement yet. The script sees an `Error` named `NotImplementedError`,
     * and the content log names the member once per pack. Avoid the member, or implement it in
     * `@jsprismarine/script-host`.
     */
    NotImplemented: '{member} from {module} is not implemented',
    /**
     * An implementation of a Script API member threw one of the API's own error classes, such as
     * `LocationInUnloadedChunkError`. The binding throws it in the script as that class, so it
     * reaches Node.js only when code outside a member call throws it.
     */
    ApiError: '{message}',
    /**
     * A script's `import()` named a native module, one whose name starts with `@`, that the pack's
     * manifest does not declare. The script sees Bedrock Dedicated Server's `ReferenceError`. Add
     * the module to the `dependencies` of the pack's `manifest.json`.
     */
    UnrecognizedModule: {
        message:
            'Module [{name}] is unrecognized. If this is a Native module, did you remember to add it to your manifest.json?',
        base: ReferenceError
    },
    /**
     * A pack already bound one version of a Script API module, and something asked for another. A
     * pack gets one version of each module; make its manifest and its dependencies agree.
     */
    ModuleVersionConflict: '{pack} already has {module} {bound}, not {requested}',
    /**
     * A bound Script API module depends on a module version the generated shapes do not have.
     * Regenerate the shapes with `pnpm --filter @jsprismarine/script-host run generate:shape`.
     */
    DependencyHasNoShape: '{module} {version}, a dependency of the bound modules, has no generated shape',
    /**
     * The engine called a Script API member by an id the binding never gave out. This is a bug in
     * the script host; report it with the stack trace.
     */
    UnknownApiMember: { message: 'No Script API member has id {id}', base: RangeError },
    /**
     * A script called a Script API member that its current privilege forbids, such as a world
     * change in a before event. The script sees Bedrock Dedicated Server's `ReferenceError`. Move
     * the call into `system.run`.
     */
    MemberNotPrivileged: { message: '{member} cannot be used in {privilege}.', base: ReferenceError },
    /**
     * A generated module shape exports an object whose type is not a class of the module. The shape
     * generator wrote a broken file; regenerate the shapes.
     */
    ExportNotOfModuleClass: { message: "{module}'s {name} is not of a class in it", base: TypeError },
    /**
     * A generated module history has a segment naming a version the history does not list. The
     * shape generator wrote a broken file; regenerate the shapes.
     */
    SegmentVersionMissing: {
        message: 'A segment names the version {version}, which the history lacks',
        base: RangeError
    },
    /** Code asked for a Script API module version that its generated history does not have. */
    ModuleVersionMissing: { message: '{module} has no version {version}', base: RangeError },
    /**
     * Two implementations were registered for the same Script API member. Remove one of them.
     */
    ImplementedTwice: '{owner}.{member} from {module} is implemented twice',
    /** Code compared a version string that is not a `major.minor.patch` version. */
    VersionsNotComparable: { message: 'Cannot compare {left} with {right}', base: RangeError },
    /**
     * The host tried to pass a value the engine cannot hold, such as a function or a bigint, into a
     * script. This is a bug in the script host; report it with the stack trace.
     */
    ValueCannotCrossIntoScript: { message: 'A {type} cannot cross into a script', base: TypeError },
    /**
     * A value the engine sent has a tag the host does not know, so the library and the package come
     * from different builds. Rebuild the library with `build:native`.
     */
    UnknownValueTag: { message: 'Unknown value tag {tag}', base: RangeError },
    /** The engine sent another kind of value where the host reads a string. This is a bug in the script host. */
    ExpectedStringValue: { message: 'Expected a string value', base: RangeError },
    /**
     * A value the engine sent ends before its bytes do, so the library and the package come from
     * different builds, or the transfer buffer was overwritten. Rebuild the library with
     * `build:native`.
     */
    ValueRunsPastBytes: { message: 'The value runs past its bytes', base: RangeError },
    /**
     * Something the host made in the engine, or read back from it, is not an object. This is a
     * bug in the script host; report it with the stack trace.
     */
    NotAnObject: { message: '{what} is not an object', base: TypeError },
    /**
     * A function the host evaluated in the engine, or a callback the binding already checked, is
     * not a function. This is a bug in the script host; report it with the stack trace.
     */
    NotAFunction: { message: '{what} is not a function', base: TypeError },
    /**
     * An array or object literal the host evaluated in the engine gave a primitive. This is a bug
     * in the script host; report it with the stack trace.
     */
    LiteralEvaluatedToPrimitive: { message: 'An {kind} literal evaluated to a primitive', base: TypeError },
    /**
     * The display options a script passed to `Scoreboard.setObjectiveAtDisplaySlot` are not an
     * object, although the binding checked them. This is a bug in the script host.
     */
    DisplayOptionsNotAnObject: { message: 'The display options are not an object', base: TypeError },
    /**
     * A global the host reads in the engine, such as `Object.keys`, is gone, so a script replaced
     * or deleted it.
     */
    EngineGlobalMissing: { message: '{name} is missing', base: TypeError },
    /**
     * The promise the host made in the engine for a GameTest is not the list of a promise and its
     * two settle functions. This is a bug in the script host; report it with the stack trace.
     */
    DeferredPromiseNotAList: { message: 'The deferred promise is not a list', base: TypeError },
    /**
     * The promise the host made in the engine for a GameTest lacks its promise or a settle
     * function. This is a bug in the script host; report it with the stack trace.
     */
    DeferredPromiseIncomplete: { message: 'The deferred promise is incomplete', base: TypeError },
    /**
     * A Script API object holds no state of the kind its class keeps, such as an `Entity` with no
     * entity. The host wrote every state, so this is a bug in the script host.
     */
    ObjectCarriesNoState: { message: 'The object carries no {what}', base: TypeError },
    /**
     * An argument the binding checked against its Script API type reached the implementation as
     * another type. This is a bug in the script host; report it with the stack trace.
     */
    ArgumentNotOfType: { message: 'The {argument} is not a {type}', base: TypeError },
    /**
     * A script used an event object after its event finished, when Bedrock Dedicated Server no
     * longer holds its data. The script sees a `ReferenceError`. Read the event's data while its
     * handler runs.
     */
    EventNoLongerValid: { message: 'The event is no longer valid', base: ReferenceError },
    /**
     * A script passed an argument the Script API cannot convert to the type it expects, such as a
     * vector with a part that is not a finite number. The script sees Bedrock Dedicated Server's
     * `TypeError`.
     */
    ArgumentConversionFailed: {
        message: 'Native type conversion failed. Function argument [{index}] expected type: {expected}',
        base: TypeError
    },
    /**
     * A custom component a script registered has a hook that is not a function. The script sees
     * Bedrock Dedicated Server's `TypeError`. Make each hook of the component a function.
     */
    InterfacePropertyConversionFailed: {
        message:
            "Native type conversion failed. Interface property ['{property}'] expected type: {expected} (failed parsing interface to Function argument [1]).",
        base: TypeError
    },
    /**
     * A script passed or set an object that lacks a property the Script API's interface needs, such
     * as an `RGB` color without `blue`. The script sees Bedrock Dedicated Server's `TypeError`,
     * which names the argument, or `Function return value` for a value a script set on a property.
     * Pass an object with every property the interface lists.
     */
    InterfacePropertyMissing: {
        message:
            "Native setter cannot be assigned null or undefined. Interface property ['{property}'] expected type: {expected} (failed parsing interface to {target}).",
        base: TypeError
    },
    /**
     * A script passed or set an object whose number property is `NaN` or an infinity, such as a
     * debug shape's `bound` with an `x` of `NaN`. The script sees Bedrock Dedicated Server's
     * `TypeError`, which names the argument, or `Function return value` for a value a script set on
     * a property. Give every number property a finite value.
     */
    InterfacePropertyNotFinite: {
        message:
            "{value} value is not supported. Interface property ['{property}'] expected type: {expected} (failed parsing interface to {target}).",
        base: TypeError
    },
    /**
     * A script passed a value no dynamic property can hold, such as an object that is not a vector.
     * The script sees Bedrock Dedicated Server's `TypeError`.
     */
    VariantConversionFailed: { message: 'Native variant type conversion failed.', base: TypeError },
    /**
     * A script passed a form text that is neither a string nor a `RawMessage`. The script sees
     * Bedrock Dedicated Server's `TypeError`.
     */
    TextConversionFailed: {
        message:
            'Native variant type conversion failed. Function argument [{argument}] expected type: string | RawMessage',
        base: TypeError
    },
    /**
     * A script read a vector dynamic property with a part a float cannot hold. Bedrock Dedicated
     * Server stores such a part as infinity and refuses to read it back, and the script sees its
     * `TypeError`.
     */
    InfinityNotSupported: { message: 'Infinity value is not supported.', base: TypeError },
    /**
     * A script passed `@minecraft/server-admin`'s `transferPlayer` an options object that is
     * neither a `TransferPlayerIpPortOptions`, a hostname with a port from 0 to 65535, nor a
     * `TransferPlayerNetherNetOptions` with a NetherNet id. The script sees Bedrock Dedicated
     * Server's `TypeError`.
     */
    ArgumentVariantConversionFailed: {
        message: 'Native variant type conversion failed. Function argument [{argument}] expected type: {type}',
        base: TypeError
    },
    /**
     * A script closed the forms of a player who has left. The script sees Bedrock Dedicated
     * Server's `Error`.
     */
    InvalidPlayerHandle: 'Invalid Player handle.',
    /**
     * A script used a GameTest `Test` after its test was cleaned up. The script sees Bedrock
     * Dedicated Server's `ReferenceError`.
     */
    TestNoLongerBound: {
        message: 'Native function [Test::{member}] object bound to prototype does not exist.',
        base: ReferenceError
    },
    /**
     * A form builder method the host does not write into form JSON was called. This is a bug in the
     * script host; report it with the stack trace.
     */
    NotAFormBuilderMember: { message: '{member} is not a member of a {kind} form builder', base: RangeError },
    /**
     * The form kit the host evaluates in the engine has no function of that name. This is a bug in
     * the script host; report it with the stack trace.
     */
    FormKitFunctionMissing: { message: 'The form kit has no {name}', base: ReferenceError },
    /**
     * A pack's `manifest.json`, or another JSON file the script host reads from a pack, holds JSON
     * that is not an object. Fix the file.
     */
    PackFileNotAnObject: '{path} is not an object',
    /**
     * A pack's `manifest.json` lacks its header's `name`, `uuid` or `version`. Fix the manifest.
     */
    ManifestHeaderIncomplete: '{path} has no header name, uuid and version',
    /**
     * A pack's `manifest.json` has a `script` module without a `uuid` or an `entry`. Fix the
     * manifest.
     */
    ScriptModuleWithoutUuid: '{path} has a script module without a uuid',
    /**
     * The host scheduled a script task with a delay that is not a finite number. The Script API's
     * argument check refuses those first, as Bedrock Dedicated Server does, so this is a bug in the
     * script host.
     */
    TaskDelayNotFinite: { message: 'A task delay must be a finite number, not {delay}', base: RangeError },
    /**
     * Code attached a debugger session that is already attached to an engine. Make a new session
     * for each connection.
     */
    DebugSessionAlreadyAttached: 'The session is already attached to an engine',
    /**
     * The debugger extension sent a command JSPrismarine does not answer. The session answers the
     * extension with this message, and the extension shows it. Use a command Bedrock Dedicated
     * Server's debugger supports.
     */
    UnhandledDebuggerCommand: "JSPrismarine does not handle the debugger command '{command}'",
    /** The debugger extension asked for the stack or the variables while no script was stopped. */
    NoScriptStopped: 'No script is stopped',
    /**
     * The debugger extension asked for variables by a reference from an earlier stop, which ended
     * when the script resumed.
     */
    UnknownVariablesReference: 'No variables have reference {id}',
    /** The debugger extension asked to evaluate an expression while the script runs. Pause it first. */
    EvaluateWhileRunning: 'A running script cannot evaluate',
    /** The debugger session was used after it detached from its engine. */
    DebugSessionDetached: 'The session has detached',
    /** The engine's debugger was used after it detached. */
    DebuggerDetached: 'The debugger has detached',
    /**
     * The debugger connection worker's module was run on the main thread. It only runs as the
     * worker `DebuggerThread` starts.
     */
    ConnectionWorkerOnMainThread: 'The debugger connection worker runs on a worker thread',
    /** The debugger extension sent a message that is not an object with a `type`. */
    InvalidDebuggerMessage: { message: 'A debugger message is an object with a type', base: TypeError },
    /**
     * The debugger's connection thread threw something that is not an error. The message is that
     * value as a string.
     */
    DebuggerThreadThrew: '{value}',
    /** The debugger's connection thread exited, so the listener or connection it held is gone. */
    DebuggerThreadExited: 'The debugger thread exited with code {code}',
    /**
     * The debugger extension closed the connection before it answered the handshake. Connect
     * again.
     */
    DebuggerClosedConnection: { message: 'The debugger closed the connection', base: DebuggerConnectionError },
    /**
     * The debugger extension speaks another debugger protocol version than this server. Update the
     * Minecraft Bedrock Debugger extension.
     */
    DebuggerProtocolVersionMismatch: {
        message: 'Debugger connection failed, protocol version mismatch.',
        base: DebuggerConnectionError
    },
    /**
     * The debugger extension sent a passcode other than the server's `script-debugger-passcode`.
     * Set the same passcode in the extension's `launch.json`.
     */
    DebuggerPasscodeMismatch: {
        message: 'Debugger connection failed, passcode mismatch.',
        base: DebuggerConnectionError
    },
    /**
     * The `targetModuleUuid` in the extension's `launch.json` names no script module of a pack the
     * world runs. Set it to the `uuid` of the pack's `script` module.
     */
    DebuggerPluginNotFound: {
        message: 'Debugger connection failed, no plugin found with targetModuleUUID [{uuid}] (see launch.json).',
        base: DebuggerConnectionError
    },
    /**
     * The host was asked to send the debugger extension a message larger than a frame can state.
     * This is a bug in the debugger; report it with the stack trace.
     */
    FrameTooLong: { message: 'A {length}-byte message does not fit a frame', base: DebuggerFramingError },
    /**
     * Bytes from the debugger connection do not start with a frame header, so the peer is not the
     * Minecraft Bedrock Debugger extension. The connection is closed.
     */
    InvalidFrameHeader: {
        message: 'A frame header is 8 hexadecimal digits and a newline, not {header}',
        base: DebuggerFramingError
    },
    /**
     * The debugger peer announced a message over the size the host reads, so the connection is
     * closed before the body is buffered.
     */
    ReceivedFrameTooLong: {
        message: 'A {length}-byte frame is over the {limit}-byte limit',
        base: DebuggerFramingError
    },
    /** The debugger peer sent a frame whose body is not JSON. The connection is closed. */
    FrameBodyNotJson: { message: "A frame's body is not JSON: {reason}", base: DebuggerFramingError },
    /**
     * Reading a frame from the debugger connection failed for a reason other than the frame's
     * bytes. The message is that failure's own. The connection is closed.
     */
    FrameNotRead: { message: '{reason}', base: DebuggerFramingError },
    /**
     * Bedrock Dedicated Server's refusal to listen for the debugger on an address other machines can
     * reach without a passcode. Set `script-debugger-passcode`, or listen on a loopback address.
     */
    ListenerNeedsPasscode: {
        message: 'Refusing to start script debugger listener on non-loopback address [{address}] without a passcode.',
        base: DebuggerTransportError
    },
    /**
     * The debugger listener could not listen, usually because another process holds the port. The
     * message is the operating system's.
     */
    ListenFailed: { message: '{reason}', base: DebuggerTransportError },
    /** The debugger listener is bound to something other than a TCP address. */
    ListenerHasNoAddress: { message: 'The listener has no TCP address', base: DebuggerTransportError },
    /** The debugger listener closed before an extension connected. */
    ListenerClosed: { message: 'The debugger listener closed', base: DebuggerTransportError },
    /**
     * The connection to a listening debugger extension failed, usually because nothing listens on
     * that host and port. The message is the operating system's. Start the extension in `listen`
     * mode first.
     */
    ConnectFailed: { message: '{reason}', base: DebuggerTransportError },
    /** The debugger's connection thread was stopped while a request to it was pending. */
    DebuggerThreadStopped: { message: 'The debugger thread stopped', base: DebuggerTransportError },
    /**
     * The debugger's connection thread could not listen or connect. The message is the reason the
     * thread gave.
     */
    DebuggerThreadRequestFailed: { message: '{reason}', base: DebuggerTransportError }
});
