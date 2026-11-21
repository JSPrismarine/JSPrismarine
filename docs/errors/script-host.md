---
title: '@jsprismarine/script-host errors'
description: The code, message and meaning of every error @jsprismarine/script-host throws.
group: Documents
category: Errors
---

# @jsprismarine/script-host errors

These are the errors `@jsprismarine/script-host` throws. [The error reference](README.md) explains how to read an entry.

<!-- fact:errors.page.script-host -->
## Groups

Catch one of these classes to handle every error that extends it.

| Class                     | What its errors mean                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DebuggerConnectionError` | Why a debugger connection was refused, with Bedrock Dedicated Server's message for it.                                                                                |
| `DebuggerFramingError`    | Why bytes from a debugger connection are not a frame.                                                                                                                 |
| `DebuggerTransportError`  | Why the debugger transport refused to listen, or a connection failed.                                                                                                 |
| `ScriptError`             | A script threw, and nothing in the script caught it. `scriptName`, `scriptMessage` and `scriptStack` hold the error's name, message and stack as the engine saw them. |
| `ScriptOutOfMemoryError`  | A script went over the engine's memory limit, and the error reached the host.                                                                                         |
| `ScriptTerminatedError`   | A script ran out of its step budget. The engine stopped it with an error no script can catch, at the same step on every run.                                          |

## `SCRIPT_HOST_API_ERROR`

`{message}`

Thrown as `ScriptHostErrors.ApiError`, which extends `Error`.

An implementation of a Script API member threw one of the API's own error classes, such as
`LocationInUnloadedChunkError`. The binding throws it in the script as that class, so it
reaches Node.js only when code outside a member call throws it.

## `SCRIPT_HOST_ARGUMENT_CONVERSION_FAILED`

`Native type conversion failed. Function argument [{index}] expected type: {expected}`

Thrown as `ScriptHostErrors.ArgumentConversionFailed`, which extends `TypeError`.

A script passed an argument the Script API cannot convert to the type it expects, such as a
vector with a part that is not a finite number. The script sees Bedrock Dedicated Server's
`TypeError`.

## `SCRIPT_HOST_ARGUMENT_NOT_OF_TYPE`

`The {argument} is not a {type}`

Thrown as `ScriptHostErrors.ArgumentNotOfType`, which extends `TypeError`.

An argument the binding checked against its Script API type reached the implementation as
another type. This is a bug in the script host; report it with the stack trace.

## `SCRIPT_HOST_ARGUMENT_VARIANT_CONVERSION_FAILED`

`Native variant type conversion failed. Function argument [{argument}] expected type: {type}`

Thrown as `ScriptHostErrors.ArgumentVariantConversionFailed`, which extends `TypeError`.

A script passed `@minecraft/server-admin`'s `transferPlayer` an options object that is
neither a `TransferPlayerIpPortOptions`, a hostname with a port from 0 to 65535, nor a
`TransferPlayerNetherNetOptions` with a NetherNet id. The script sees Bedrock Dedicated
Server's `TypeError`.

## `SCRIPT_HOST_CONNECT_FAILED`

`{reason}`

Thrown as `ScriptHostErrors.ConnectFailed`, which extends `DebuggerTransportError`.

The connection to a listening debugger extension failed, usually because nothing listens on
that host and port. The message is the operating system's. Start the extension in `listen`
mode first.

## `SCRIPT_HOST_CONNECTION_WORKER_ON_MAIN_THREAD`

`The debugger connection worker runs on a worker thread`

Thrown as `ScriptHostErrors.ConnectionWorkerOnMainThread`, which extends `Error`.

The debugger connection worker's module was run on the main thread. It only runs as the
worker `DebuggerThread` starts.

## `SCRIPT_HOST_DEBUG_SESSION_ALREADY_ATTACHED`

`The session is already attached to an engine`

Thrown as `ScriptHostErrors.DebugSessionAlreadyAttached`, which extends `Error`.

Code attached a debugger session that is already attached to an engine. Make a new session
for each connection.

## `SCRIPT_HOST_DEBUG_SESSION_DETACHED`

`The session has detached`

Thrown as `ScriptHostErrors.DebugSessionDetached`, which extends `Error`.

The debugger session was used after it detached from its engine.

## `SCRIPT_HOST_DEBUGGER_ALREADY_ATTACHED`

`A debugger is already attached to this engine`

Thrown as `ScriptHostErrors.DebuggerAlreadyAttached`, which extends `Error`.

Code attached a second debugger to an engine that already has one. Detach the first with
`EngineDebugger.detach` before attaching another.

## `SCRIPT_HOST_DEBUGGER_CLOSED_CONNECTION`

`The debugger closed the connection`

Thrown as `ScriptHostErrors.DebuggerClosedConnection`, which extends `DebuggerConnectionError`.

The debugger extension closed the connection before it answered the handshake. Connect
again.

## `SCRIPT_HOST_DEBUGGER_DETACHED`

`The debugger has detached`

Thrown as `ScriptHostErrors.DebuggerDetached`, which extends `Error`.

The engine's debugger was used after it detached.

## `SCRIPT_HOST_DEBUGGER_PASSCODE_MISMATCH`

`Debugger connection failed, passcode mismatch.`

Thrown as `ScriptHostErrors.DebuggerPasscodeMismatch`, which extends `DebuggerConnectionError`.

The debugger extension sent a passcode other than the server's `script-debugger-passcode`.
Set the same passcode in the extension's `launch.json`.

## `SCRIPT_HOST_DEBUGGER_PLUGIN_NOT_FOUND`

`Debugger connection failed, no plugin found with targetModuleUUID [{uuid}] (see launch.json).`

Thrown as `ScriptHostErrors.DebuggerPluginNotFound`, which extends `DebuggerConnectionError`.

The `targetModuleUuid` in the extension's `launch.json` names no script module of a pack the
world runs. Set it to the `uuid` of the pack's `script` module.

## `SCRIPT_HOST_DEBUGGER_PROTOCOL_VERSION_MISMATCH`

`Debugger connection failed, protocol version mismatch.`

Thrown as `ScriptHostErrors.DebuggerProtocolVersionMismatch`, which extends `DebuggerConnectionError`.

The debugger extension speaks another debugger protocol version than this server. Update the
Minecraft Bedrock Debugger extension.

## `SCRIPT_HOST_DEBUGGER_THREAD_EXITED`

`The debugger thread exited with code {code}`

Thrown as `ScriptHostErrors.DebuggerThreadExited`, which extends `Error`.

The debugger's connection thread exited, so the listener or connection it held is gone.

## `SCRIPT_HOST_DEBUGGER_THREAD_REQUEST_FAILED`

`{reason}`

Thrown as `ScriptHostErrors.DebuggerThreadRequestFailed`, which extends `DebuggerTransportError`.

The debugger's connection thread could not listen or connect. The message is the reason the
thread gave.

## `SCRIPT_HOST_DEBUGGER_THREAD_STOPPED`

`The debugger thread stopped`

Thrown as `ScriptHostErrors.DebuggerThreadStopped`, which extends `DebuggerTransportError`.

The debugger's connection thread was stopped while a request to it was pending.

## `SCRIPT_HOST_DEBUGGER_THREAD_THREW`

`{value}`

Thrown as `ScriptHostErrors.DebuggerThreadThrew`, which extends `Error`.

The debugger's connection thread threw something that is not an error. The message is that
value as a string.

## `SCRIPT_HOST_DEFERRED_PROMISE_INCOMPLETE`

`The deferred promise is incomplete`

Thrown as `ScriptHostErrors.DeferredPromiseIncomplete`, which extends `TypeError`.

The promise the host made in the engine for a GameTest lacks its promise or a settle
function. This is a bug in the script host; report it with the stack trace.

## `SCRIPT_HOST_DEFERRED_PROMISE_NOT_ALIST`

`The deferred promise is not a list`

Thrown as `ScriptHostErrors.DeferredPromiseNotAList`, which extends `TypeError`.

The promise the host made in the engine for a GameTest is not the list of a promise and its
two settle functions. This is a bug in the script host; report it with the stack trace.

## `SCRIPT_HOST_DEPENDENCY_HAS_NO_SHAPE`

`{module} {version}, a dependency of the bound modules, has no generated shape`

Thrown as `ScriptHostErrors.DependencyHasNoShape`, which extends `Error`.

A bound Script API module depends on a module version the generated shapes do not have.
Regenerate the shapes with `pnpm --filter

## `SCRIPT_HOST_DISPLAY_OPTIONS_NOT_AN_OBJECT`

`The display options are not an object`

Thrown as `ScriptHostErrors.DisplayOptionsNotAnObject`, which extends `TypeError`.

The display options a script passed to `Scoreboard.setObjectiveAtDisplaySlot` are not an
object, although the binding checked them. This is a bug in the script host.

## `SCRIPT_HOST_ENGINE_DESTROYED`

`The script engine has been destroyed`

Thrown as `ScriptHostErrors.EngineDestroyed`, which extends `Error`.

Code used a script engine after destroying it. This is a bug in the server; report it with
the stack trace.

## `SCRIPT_HOST_ENGINE_DESTROYED_DURING_HOST_CALL`

`A script engine cannot be destroyed while it calls the host`

Thrown as `ScriptHostErrors.EngineDestroyedDuringHostCall`, which extends `Error`.

A host function destroyed the engine that called it. Destroy the engine after the call into
it returns. This is a bug in the server; report it with the stack trace.

## `SCRIPT_HOST_ENGINE_GLOBAL_MISSING`

`{name} is missing`

Thrown as `ScriptHostErrors.EngineGlobalMissing`, which extends `TypeError`.

A global the host reads in the engine, such as `Object.keys`, is gone, so a script replaced
or deleted it.

## `SCRIPT_HOST_ENGINE_NOT_CREATED`

`The script engine could not be created`

Thrown as `ScriptHostErrors.EngineNotCreated`, which extends `Error`.

The native library could not create a QuickJS runtime, usually because the process is out of
memory. Free memory, or run fewer worlds with scripts.

## `SCRIPT_HOST_ENGINE_REJECTED_VALUE`

`The engine rejected a handle or a value`

Thrown as `ScriptHostErrors.EngineRejectedValue`, which extends `RangeError`.

The native engine refused a handle or a value the host passed, such as a handle it already
freed. This is a bug in the script host; report it with the stack trace.

## `SCRIPT_HOST_EVALUATE_WHILE_RUNNING`

`A running script cannot evaluate`

Thrown as `ScriptHostErrors.EvaluateWhileRunning`, which extends `Error`.

The debugger extension asked to evaluate an expression while the script runs. Pause it first.

## `SCRIPT_HOST_EVENT_NO_LONGER_VALID`

`The event is no longer valid`

Thrown as `ScriptHostErrors.EventNoLongerValid`, which extends `ReferenceError`.

A script used an event object after its event finished, when Bedrock Dedicated Server no
longer holds its data. The script sees a `ReferenceError`. Read the event's data while its
handler runs.

## `SCRIPT_HOST_EXPECTED_STRING_VALUE`

`Expected a string value`

Thrown as `ScriptHostErrors.ExpectedStringValue`, which extends `RangeError`.

The engine sent another kind of value where the host reads a string. This is a bug in the script host.

## `SCRIPT_HOST_EXPORT_NOT_OF_MODULE_CLASS`

`{module}'s {name} is not of a class in it`

Thrown as `ScriptHostErrors.ExportNotOfModuleClass`, which extends `TypeError`.

A generated module shape exports an object whose type is not a class of the module. The shape
generator wrote a broken file; regenerate the shapes.

## `SCRIPT_HOST_FFI_UNAVAILABLE`

`node:ffi is not available in Node.js {version}. Run a Node.js build with FFI support, without --no-experimental-ffi.`

Thrown as `ScriptHostErrors.FfiUnavailable`, which extends `NativeLibraryError`.

The Node.js running the server has no `node:ffi`, which the script host loads its native
library with. Run a Node.js build with FFI support, and do not pass
`--no-experimental-ffi`.

## `SCRIPT_HOST_FORM_KIT_FUNCTION_MISSING`

`The form kit has no {name}`

Thrown as `ScriptHostErrors.FormKitFunctionMissing`, which extends `ReferenceError`.

The form kit the host evaluates in the engine has no function of that name. This is a bug in
the script host; report it with the stack trace.

## `SCRIPT_HOST_FRAME_BODY_NOT_JSON`

`A frame's body is not JSON: {reason}`

Thrown as `ScriptHostErrors.FrameBodyNotJson`, which extends `DebuggerFramingError`.

The debugger peer sent a frame whose body is not JSON. The connection is closed.

## `SCRIPT_HOST_FRAME_NOT_READ`

`{reason}`

Thrown as `ScriptHostErrors.FrameNotRead`, which extends `DebuggerFramingError`.

Reading a frame from the debugger connection failed for a reason other than the frame's
bytes. The message is that failure's own. The connection is closed.

## `SCRIPT_HOST_FRAME_TOO_LONG`

`A {length}-byte message does not fit a frame`

Thrown as `ScriptHostErrors.FrameTooLong`, which extends `DebuggerFramingError`.

The host was asked to send the debugger extension a message larger than a frame can state.
This is a bug in the debugger; report it with the stack trace.

## `SCRIPT_HOST_IMPLEMENTED_TWICE`

`{owner}.{member} from {module} is implemented twice`

Thrown as `ScriptHostErrors.ImplementedTwice`, which extends `Error`.

Two implementations were registered for the same Script API member. Remove one of them.

## `SCRIPT_HOST_INFINITY_NOT_SUPPORTED`

`Infinity value is not supported.`

Thrown as `ScriptHostErrors.InfinityNotSupported`, which extends `TypeError`.

A script read a vector dynamic property with a part a float cannot hold. Bedrock Dedicated
Server stores such a part as infinity and refuses to read it back, and the script sees its
`TypeError`.

## `SCRIPT_HOST_INTERFACE_PROPERTY_CONVERSION_FAILED`

`Native type conversion failed. Interface property ['{property}'] expected type: {expected} (failed parsing interface to Function argument [1]).`

Thrown as `ScriptHostErrors.InterfacePropertyConversionFailed`, which extends `TypeError`.

A custom component a script registered has a hook that is not a function. The script sees
Bedrock Dedicated Server's `TypeError`. Make each hook of the component a function.

## `SCRIPT_HOST_INTERFACE_PROPERTY_MISSING`

`Native setter cannot be assigned null or undefined. Interface property ['{property}'] expected type: {expected} (failed parsing interface to {target}).`

Thrown as `ScriptHostErrors.InterfacePropertyMissing`, which extends `TypeError`.

A script passed or set an object that lacks a property the Script API's interface needs, such
as an `RGB` color without `blue`. The script sees Bedrock Dedicated Server's `TypeError`,
which names the argument, or `Function return value` for a value a script set on a property.
Pass an object with every property the interface lists.

## `SCRIPT_HOST_INTERFACE_PROPERTY_NOT_FINITE`

`{value} value is not supported. Interface property ['{property}'] expected type: {expected} (failed parsing interface to {target}).`

Thrown as `ScriptHostErrors.InterfacePropertyNotFinite`, which extends `TypeError`.

A script passed or set an object whose number property is `NaN` or an infinity, such as a
debug shape's `bound` with an `x` of `NaN`. The script sees Bedrock Dedicated Server's
`TypeError`, which names the argument, or `Function return value` for a value a script set on
a property. Give every number property a finite value.

## `SCRIPT_HOST_INVALID_DEBUGGER_MESSAGE`

`A debugger message is an object with a type`

Thrown as `ScriptHostErrors.InvalidDebuggerMessage`, which extends `TypeError`.

The debugger extension sent a message that is not an object with a `type`.

## `SCRIPT_HOST_INVALID_FRAME_HEADER`

`A frame header is 8 hexadecimal digits and a newline, not {header}`

Thrown as `ScriptHostErrors.InvalidFrameHeader`, which extends `DebuggerFramingError`.

Bytes from the debugger connection do not start with a frame header, so the peer is not the
Minecraft Bedrock Debugger extension. The connection is closed.

## `SCRIPT_HOST_INVALID_PLAYER_HANDLE`

`Invalid Player handle.`

Thrown as `ScriptHostErrors.InvalidPlayerHandle`, which extends `Error`.

A script closed the forms of a player who has left. The script sees Bedrock Dedicated
Server's `Error`.

## `SCRIPT_HOST_JSP_MEMBER_UNAVAILABLE`

`{member} of @jsprismarine/server is not available on this server`

Thrown as `ScriptHostErrors.JspMemberUnavailable`, which extends `Error`.

A pack called a member of `@jsprismarine/server` this server does not provide, which it should have checked for with `in`.

## `SCRIPT_HOST_JSP_MODULE_ARGUMENT`

`{member} takes {expected} as its {argument}`

Thrown as `ScriptHostErrors.JspModuleArgument`, which extends `TypeError`.

A pack called a member of `@jsprismarine/server` or `@jsprismarine/placeholders` with an
argument of the wrong type, such as an object that is not a player where the member takes a
`Player`, or a boss bar color the module does not name. The script sees a `TypeError`. Pass
what the modules' declarations in `@jsprismarine/script-types` name.

## `SCRIPT_HOST_LIBRARY_INTERFACE_MISMATCH`

`{path} has interface version {version}, and this binding speaks {abiVersion}`

Thrown as `ScriptHostErrors.LibraryInterfaceMismatch`, which extends `NativeLibraryError`.

The native library was built for a different version of this package. Rebuild it with
`pnpm --filter

## `SCRIPT_HOST_LISTEN_FAILED`

`{reason}`

Thrown as `ScriptHostErrors.ListenFailed`, which extends `DebuggerTransportError`.

The debugger listener could not listen, usually because another process holds the port. The
message is the operating system's.

## `SCRIPT_HOST_LISTENER_CLOSED`

`The debugger listener closed`

Thrown as `ScriptHostErrors.ListenerClosed`, which extends `DebuggerTransportError`.

The debugger listener closed before an extension connected.

## `SCRIPT_HOST_LISTENER_HAS_NO_ADDRESS`

`The listener has no TCP address`

Thrown as `ScriptHostErrors.ListenerHasNoAddress`, which extends `DebuggerTransportError`.

The debugger listener is bound to something other than a TCP address.

## `SCRIPT_HOST_LISTENER_NEEDS_PASSCODE`

`Refusing to start script debugger listener on non-loopback address [{address}] without a passcode.`

Thrown as `ScriptHostErrors.ListenerNeedsPasscode`, which extends `DebuggerTransportError`.

Bedrock Dedicated Server's refusal to listen for the debugger on an address other machines can
reach without a passcode. Set `script-debugger-passcode`, or listen on a loopback address.

## `SCRIPT_HOST_LITERAL_EVALUATED_TO_PRIMITIVE`

`An {kind} literal evaluated to a primitive`

Thrown as `ScriptHostErrors.LiteralEvaluatedToPrimitive`, which extends `TypeError`.

An array or object literal the host evaluated in the engine gave a primitive. This is a bug
in the script host; report it with the stack trace.

## `SCRIPT_HOST_MANIFEST_HEADER_INCOMPLETE`

`{path} has no header name, uuid and version`

Thrown as `ScriptHostErrors.ManifestHeaderIncomplete`, which extends `Error`.

A pack's `manifest.json` lacks its header's `name`, `uuid` or `version`. Fix the manifest.

## `SCRIPT_HOST_MEMBER_NOT_PRIVILEGED`

`{member} cannot be used in {privilege}.`

Thrown as `ScriptHostErrors.MemberNotPrivileged`, which extends `ReferenceError`.

A script called a Script API member that its current privilege forbids, such as a world
change in a before event. The script sees Bedrock Dedicated Server's `ReferenceError`. Move
the call into `system.run`.

## `SCRIPT_HOST_MODULE_NOT_FOUND`

`Could not find module '{name}'`

Thrown as `ScriptHostErrors.ModuleNotFound`, which extends `ReferenceError`.

A script imported a module that no pack and no Script API module provides. The script sees it
as a `ReferenceError`. Check the import's name and the pack's files.

## `SCRIPT_HOST_MODULE_VERSION_CONFLICT`

`{pack} already has {module} {bound}, not {requested}`

Thrown as `ScriptHostErrors.ModuleVersionConflict`, which extends `Error`.

A pack already bound one version of a Script API module, and something asked for another. A
pack gets one version of each module; make its manifest and its dependencies agree.

## `SCRIPT_HOST_MODULE_VERSION_MISSING`

`{module} has no version {version}`

Thrown as `ScriptHostErrors.ModuleVersionMissing`, which extends `RangeError`.

Code asked for a Script API module version that its generated history does not have.

## `SCRIPT_HOST_NO_SCRIPT_STOPPED`

`No script is stopped`

Thrown as `ScriptHostErrors.NoScriptStopped`, which extends `Error`.

The debugger extension asked for the stack or the variables while no script was stopped.

## `SCRIPT_HOST_NOT_AFORM_BUILDER_MEMBER`

`{member} is not a member of a {kind} form builder`

Thrown as `ScriptHostErrors.NotAFormBuilderMember`, which extends `RangeError`.

A form builder method the host does not write into form JSON was called. This is a bug in the
script host; report it with the stack trace.

## `SCRIPT_HOST_NOT_AFUNCTION`

`{what} is not a function`

Thrown as `ScriptHostErrors.NotAFunction`, which extends `TypeError`.

A function the host evaluated in the engine, or a callback the binding already checked, is
not a function. This is a bug in the script host; report it with the stack trace.

## `SCRIPT_HOST_NOT_AN_OBJECT`

`{what} is not an object`

Thrown as `ScriptHostErrors.NotAnObject`, which extends `TypeError`.

Something the host made in the engine, or read back from it, is not an object. This is a
bug in the script host; report it with the stack trace.

## `SCRIPT_HOST_NOT_IMPLEMENTED`

`{member} from {module} is not implemented`

Thrown as `ScriptHostErrors.NotImplemented`, which extends `Error`.

A script used a Script API member that the pinned Bedrock Dedicated Server has and
JSPrismarine does not implement yet. The script sees an `Error` named `NotImplementedError`,
and the content log names the member once per pack. Avoid the member, or implement it in
`@jsprismarine/script-host`.

## `SCRIPT_HOST_OBJECT_CARRIES_NO_STATE`

`The object carries no {what}`

Thrown as `ScriptHostErrors.ObjectCarriesNoState`, which extends `TypeError`.

A Script API object holds no state of the kind its class keeps, such as an `Entity` with no
entity. The host wrote every state, so this is a bug in the script host.

## `SCRIPT_HOST_PACK_FILE_NOT_AN_OBJECT`

`{path} is not an object`

Thrown as `ScriptHostErrors.PackFileNotAnObject`, which extends `Error`.

A pack's `manifest.json`, or another JSON file the script host reads from a pack, holds JSON
that is not an object. Fix the file.

## `SCRIPT_HOST_PLACEHOLDER_NAME`

`{what} {name} is not a placeholder name: use lowercase letters, digits and underscores, starting with a letter`

Thrown as `ScriptHostErrors.PlaceholderName`, which extends `TypeError`.

A pack registered a placeholder namespace or key that is not a name: lowercase letters,
digits and underscores, starting with a letter, so that `{namespace:key}` in a text is
unmistakably a token. The script sees a `TypeError`. Rename the namespace or the key.

## `SCRIPT_HOST_PLACEHOLDER_NAMESPACE_TAKEN`

`The placeholder namespace {namespace} is registered already`

Thrown as `ScriptHostErrors.PlaceholderNamespaceTaken`, which extends `Error`.

A pack registered a placeholder namespace that another registration holds, its own or another
pack's. The script sees an `Error`. Unregister the first registration, or pick another name;
`placeholders.namespaces` lists the names in use.

## `SCRIPT_HOST_PLACEHOLDER_NO_KEYS`

`The placeholder namespace {namespace} lists no keys`

Thrown as `ScriptHostErrors.PlaceholderNoKeys`, which extends `TypeError`.

A pack registered a placeholder namespace with no keys, so no token could ever reach its
resolver. The script sees a `TypeError`. List every key the resolver answers in `keys`.

## `SCRIPT_HOST_RECEIVED_FRAME_TOO_LONG`

`A {length}-byte frame is over the {limit}-byte limit`

Thrown as `ScriptHostErrors.ReceivedFrameTooLong`, which extends `DebuggerFramingError`.

The debugger peer announced a message over the size the host reads, so the connection is
closed before the body is buffered.

## `SCRIPT_HOST_SCRIPT_MODULE_WITHOUT_UUID`

`{path} has a script module without a uuid`

Thrown as `ScriptHostErrors.ScriptModuleWithoutUuid`, which extends `Error`.

A pack's `manifest.json` has a `script` module without a `uuid` or an `entry`. Fix the
manifest.

## `SCRIPT_HOST_SCRIPT_OUT_OF_MEMORY`

`{error}`

Thrown as `ScriptHostErrors.ScriptOutOfMemory`, which extends `ScriptOutOfMemoryError`.

A script went over the engine's memory limit. Fix what the script keeps, or raise the memory
limit in the server's script settings.

## `SCRIPT_HOST_SCRIPT_TERMINATED`

`{error}`

Thrown as `ScriptHostErrors.ScriptTerminated`, which extends `ScriptTerminatedError`.

A script ran past its step budget, such as in an endless loop, and the engine stopped it.
Fix the loop, or raise the watchdog's limits in the server's script settings.

## `SCRIPT_HOST_SCRIPT_THREW`

`{error}`

Thrown as `ScriptHostErrors.ScriptThrew`, which extends `ScriptError`.

A script threw, and nothing in the script caught it. The message is the script's error as
it prints: its name, a colon and its message, or the message alone when the script threw a
value that is not an error. Fix the script; its stack is on the error as `scriptStack`.

## `SCRIPT_HOST_SEGMENT_VERSION_MISSING`

`A segment names the version {version}, which the history lacks`

Thrown as `ScriptHostErrors.SegmentVersionMissing`, which extends `RangeError`.

A generated module history has a segment naming a version the history does not list. The
shape generator wrote a broken file; regenerate the shapes.

## `SCRIPT_HOST_TASK_DELAY_NOT_FINITE`

`A task delay must be a finite number, not {delay}`

Thrown as `ScriptHostErrors.TaskDelayNotFinite`, which extends `RangeError`.

The host scheduled a script task with a delay that is not a finite number. The Script API's
argument check refuses those first, as Bedrock Dedicated Server does, so this is a bug in the
script host.

## `SCRIPT_HOST_TEMPLATE_CONDITION`

`The condition {condition} {problem}`

Thrown as `ScriptHostErrors.TemplateCondition`, which extends `TypeError`.

An `if` node's condition did not parse, or is longer or nests parentheses deeper than the
renderer allows: comparisons with `==`, `!=`, `<`, `<=`, `>`, `>=`, `contains` and
`startsWith` between placeholders and literals, joined by `&&` and `||`, with parentheses.
The script sees a `TypeError`. Fix the condition where the message says.

## `SCRIPT_HOST_TEMPLATE_INVALID`

`The template node at {where} {problem}`

Thrown as `ScriptHostErrors.TemplateInvalid`, which extends `TypeError`.

A pack passed `render` of `@jsprismarine/placeholders` a template with a node the renderer
does not know, a node whose property is of the wrong type or value, or a tree nested too
deep. `where` is the path to the node in the template. The script sees a `TypeError`. Give
each node the shape the module's `TemplateNode` type declares.

## `SCRIPT_HOST_TEST_NO_LONGER_BOUND`

`Native function [Test::{member}] object bound to prototype does not exist.`

Thrown as `ScriptHostErrors.TestNoLongerBound`, which extends `ReferenceError`.

A script used a GameTest `Test` after its test was cleaned up. The script sees Bedrock
Dedicated Server's `ReferenceError`.

## `SCRIPT_HOST_TEXT_CONVERSION_FAILED`

`Native variant type conversion failed. Function argument [{argument}] expected type: string | RawMessage`

Thrown as `ScriptHostErrors.TextConversionFailed`, which extends `TypeError`.

A script passed a form text that is neither a string nor a `RawMessage`. The script sees
Bedrock Dedicated Server's `TypeError`.

## `SCRIPT_HOST_UNHANDLED_DEBUGGER_COMMAND`

`JSPrismarine does not handle the debugger command '{command}'`

Thrown as `ScriptHostErrors.UnhandledDebuggerCommand`, which extends `Error`.

The debugger extension sent a command JSPrismarine does not answer. The session answers the
extension with this message, and the extension shows it. Use a command Bedrock Dedicated
Server's debugger supports.

## `SCRIPT_HOST_UNKNOWN_API_MEMBER`

`No Script API member has id {id}`

Thrown as `ScriptHostErrors.UnknownApiMember`, which extends `RangeError`.

The engine called a Script API member by an id the binding never gave out. This is a bug in
the script host; report it with the stack trace.

## `SCRIPT_HOST_UNKNOWN_ENGINE_REQUEST`

`The engine sent an unknown request {op}`

Thrown as `ScriptHostErrors.UnknownEngineRequest`, which extends `RangeError`.

The native library asked the host for an operation the host does not know, so the library and
the package come from different builds. Rebuild the library with `build:native`.

## `SCRIPT_HOST_UNKNOWN_HOST_FUNCTION`

`No host function has id {id}`

Thrown as `ScriptHostErrors.UnknownHostFunction`, which extends `ReferenceError`.

A script called a host function the engine no longer has. This is a bug in the script host;
report it with the stack trace.

## `SCRIPT_HOST_UNKNOWN_PAUSE_REASON`

`The engine stopped for an unknown reason {code}`

Thrown as `ScriptHostErrors.UnknownPauseReason`, which extends `RangeError`.

The native library paused a script for a reason the host does not know, so the library and
the package come from different builds. Rebuild the library with `build:native`.

## `SCRIPT_HOST_UNKNOWN_VALUE_TAG`

`Unknown value tag {tag}`

Thrown as `ScriptHostErrors.UnknownValueTag`, which extends `RangeError`.

A value the engine sent has a tag the host does not know, so the library and the package come
from different builds. Rebuild the library with `build:native`.

## `SCRIPT_HOST_UNKNOWN_VARIABLES_REFERENCE`

`No variables have reference {id}`

Thrown as `ScriptHostErrors.UnknownVariablesReference`, which extends `Error`.

The debugger extension asked for variables by a reference from an earlier stop, which ended
when the script resumed.

## `SCRIPT_HOST_UNRECOGNIZED_MODULE`

`Module [{name}] is unrecognized. If this is a Native module, did you remember to add it to your manifest.json?`

Thrown as `ScriptHostErrors.UnrecognizedModule`, which extends `ReferenceError`.

A script's `import()` named a native module, one whose name starts with `@`, that the pack's
manifest does not declare. The script sees Bedrock Dedicated Server's `ReferenceError`. Add
the module to the `dependencies` of the pack's `manifest.json`.

## `SCRIPT_HOST_VALUE_CANNOT_CROSS_INTO_SCRIPT`

`A {type} cannot cross into a script`

Thrown as `ScriptHostErrors.ValueCannotCrossIntoScript`, which extends `TypeError`.

The host tried to pass a value the engine cannot hold, such as a function or a bigint, into a
script. This is a bug in the script host; report it with the stack trace.

## `SCRIPT_HOST_VALUE_RUNS_PAST_BYTES`

`The value runs past its bytes`

Thrown as `ScriptHostErrors.ValueRunsPastBytes`, which extends `RangeError`.

A value the engine sent ends before its bytes do, so the library and the package come from
different builds, or the transfer buffer was overwritten. Rebuild the library with
`build:native`.

## `SCRIPT_HOST_VARIANT_CONVERSION_FAILED`

`Native variant type conversion failed.`

Thrown as `ScriptHostErrors.VariantConversionFailed`, which extends `TypeError`.

A script passed a value no dynamic property can hold, such as an object that is not a vector.
The script sees Bedrock Dedicated Server's `TypeError`.

## `SCRIPT_HOST_VERSIONS_NOT_COMPARABLE`

`Cannot compare {left} with {right}`

Thrown as `ScriptHostErrors.VersionsNotComparable`, which extends `RangeError`.

Code compared a version string that is not a `major.minor.patch` version.
<!-- /fact -->
