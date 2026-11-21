---
title: '@jsprismarine/prismarine server errors'
description: The code, message and meaning of every error in the server catalog of @jsprismarine/prismarine.
group: Documents
category: Errors
---

# @jsprismarine/prismarine server errors

These are the errors in the `server` catalog of `@jsprismarine/prismarine`. [The error reference](../README.md) explains how to read an entry, and [the package's page](../prismarine.md) lists its other catalogs and the classes that group its errors.

<!-- fact:errors.page.prismarine.server -->
## `PRISMARINE_ADVERTISED_CODEC_WITHOUT_VERSION`

`The advertised codec names no Minecraft version!`

Thrown as `PrismarineServerErrors.AdvertisedCodecWithoutVersion`, which extends `Error`.

The protocol the server advertises names no Minecraft version. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_BAN_LIST_NOT_LIST`

`{fileName} must hold a list of banned players`

Thrown as `PrismarineServerErrors.BanListNotList`, which extends `Error`.

The ban list file is not a JSON list. Fix it, or delete it to start with no bans.

## `PRISMARINE_BLOCK_HAS_NO_PROPERTIES`

`Block {name} has no property {key} (has: none)`

Thrown as `PrismarineServerErrors.BlockHasNoProperties`, which extends `Error`.

Code read or set a property on a block that has none.

## `PRISMARINE_CONFIG_IS_SINGLE_VALUE`

`Not valid json: the document is a single value, not an object or an array`

Thrown as `PrismarineServerErrors.ConfigIsSingleValue`, which extends `ConfigSyntaxError`.

A config file holds a single value instead of an object or a list. Fix the file.

## `PRISMARINE_CONFIG_NOT_READABLE`

`Cannot read {path}: {detail}`

Thrown as `PrismarineServerErrors.ConfigNotReadable`, which extends `Error`.

The server could not read a config file, and refuses to start rather than overwrite it with
defaults. Fix the file named in the message, or its permissions.

## `PRISMARINE_CONFIG_NOT_VALID_JSON`

`Not valid json: {printParseErrorCode} at offset {offset}`

Thrown as `PrismarineServerErrors.ConfigNotValidJson`, which extends `ConfigSyntaxError`.

A config file is not valid JSON. The server refuses to start rather than overwrite it with
defaults; fix the file at the offset given.

## `PRISMARINE_CONFIG_NOT_WRITABLE`

`Could not write {key} to {path}`

Thrown as `PrismarineServerErrors.ConfigNotWritable`, which extends `Error`.

The server could not save a setting to its config file. The cause says why, such as
permissions or a full disk.

## `PRISMARINE_CONFIGURED_RANDOM_NOT_SAVABLE`

`The configured server random callback has no serializable state`

Thrown as `PrismarineServerErrors.ConfiguredRandomNotSavable`, which extends `Error`.

The random callback the server was configured with cannot save its state, so the session
cannot be recorded for replay. Use the default random source to record replays.

## `PRISMARINE_CONTENT_BUILD_FAILED`

`Failed to build the content registries; the pack stack was not loaded`

Thrown as `PrismarineServerErrors.ContentBuildFailed`, which extends `Error`.

The server could not build its content because the packs did not load. The cause is the
load's error.

## `PRISMARINE_CONTENT_READ_TOO_EARLY`

`the content was read before the pack stack was built`

Thrown as `PrismarineServerErrors.ContentReadTooEarly`, which extends `Error`.

Code read the server's content before its packs were loaded, such as a plugin that runs too
early in startup.

## `PRISMARINE_CONTENT_SETTINGS_READ_BEFORE_BUILD`

`The content settings are read with the content build`

Thrown as `PrismarineServerErrors.ContentSettingsReadBeforeBuild`, which extends `Error`.

Code read the content settings, such as the world pack directories, before the server built
its content, which reads them. This is a bug in the server; report it with the stack trace.

## `PRISMARINE_CONTENT_WORLD_READ_BEFORE_CONTENT`

`the content world was read before the content was built`

Thrown as `PrismarineServerErrors.ContentWorldReadBeforeContent`, which extends `Error`.

Code read the content world before the content was built.

## `PRISMARINE_CONTENT_WORLD_READ_TOO_EARLY`

`the content world was read before the pack stack was built`

Thrown as `PrismarineServerErrors.ContentWorldReadTooEarly`, which extends `Error`.

Code read the content world before the server's packs were loaded, such as a plugin that runs
too early in startup.

## `PRISMARINE_CRAFTING_GRID_SIZE_MISMATCH`

`A {width}x{height} grid needs {value} slots, was given {slotsCount}`

Thrown as `PrismarineServerErrors.CraftingGridSizeMismatch`, which extends `Error`.

A crafting grid was built with the wrong number of slots for its size. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_EXPECTED_COORDINATE`

`Expected a coordinate, got "{original}"`

Thrown as `PrismarineServerErrors.ExpectedCoordinate`, which extends `Error`.

A command was given a coordinate that is not a number, `~` or `^`.

## `PRISMARINE_FAKE_LEVEL_HAS_NO_WORLD`

`the fake level has no {dimensionId} world`

Thrown as `PrismarineServerErrors.FakeLevelHasNoWorld`, which extends `Error`.

A test asked its fake level for a dimension it was not given.

## `PRISMARINE_FAKE_LEVEL_WITHOUT_PROVIDER`

`the fake level was built without a provider`

Thrown as `PrismarineServerErrors.FakeLevelWithoutProvider`, which extends `Error`.

A test's fake level needs a world provider for what the test asked of it.

## `PRISMARINE_FILE_MIGRATIONS_MISDECLARED`

`The migrations of {fileName} must step one version at a time from {oldest} to {current}; step {index} ends at {to}`

Thrown as `PrismarineServerErrors.FileMigrationsMisdeclared`, which extends `Error`.

A file's migration steps do not take it one version at a time from the version a file
without one is to the current one. This is a bug in the server; report it with the stack
trace.

## `PRISMARINE_FILE_VERSION_INVALID`

`{fileName} has {versionKey} {version}, which is not a version from {oldest} to {current}`

Thrown as `PrismarineServerErrors.FileVersionInvalid`, which extends `Error`.

A file the server upgrades on load names a version that is not a whole number, or one older
than any this server knows. Set the version key to a version the server lists, or restore a
backup the server kept beside the file.

## `PRISMARINE_FILE_VERSION_TOO_NEW`

`{fileName} has {versionKey} {version}, and this server reads up to {current}`

Thrown as `PrismarineServerErrors.FileVersionTooNew`, which extends `Error`.

A file the server upgrades on load was written by a newer server, which may have changed its
shape. The server refuses it rather than read it wrong or write it back in an older shape.
Update the server, or restore the backup an upgrade kept beside the file.

## `PRISMARINE_INVALID_BLOCK_PROPERTY_VALUE`

`Property {name}.{key} does not accept {value} (accepts: {values})`

Thrown as `PrismarineServerErrors.InvalidBlockPropertyValue`, which extends `Error`.

Code set a block property to a value outside its allowed set. The message lists the allowed
values.

## `PRISMARINE_INVALID_LOGGED_BLOCK_ENTITY_VALUE`

`A logged block entity field holds {value}`

Thrown as `PrismarineServerErrors.InvalidLoggedBlockEntityValue`, which extends `TypeError`.

A block entity change holds a value that is not plain data. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_INVALID_LOGGED_SLOT`

`A logged slot cannot hold {value}`

Thrown as `PrismarineServerErrors.InvalidLoggedSlot`, which extends `TypeError`.

An inventory change holds a value that is not an item stack. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_INVALID_PERMISSION_EXPIRY`

`Expiry "{expires}" is not an ISO 8601 instant in the future`

Thrown as `PrismarineServerErrors.InvalidPermissionExpiry`, which extends `RangeError`.

An expiry is not an ISO 8601 instant in the future, such as `2030-01-01T00:00:00Z`.

## `PRISMARINE_INVALID_PERMISSION_GROUP_NAME`

`Permission group name "{group}" is empty or has whitespace`

Thrown as `PrismarineServerErrors.InvalidPermissionGroupName`, which extends `RangeError`.

A group's name is empty or has whitespace.

## `PRISMARINE_INVALID_PERMISSION_GROUP_WEIGHT`

`Permission group weight {weight} is not a finite number`

Thrown as `PrismarineServerErrors.InvalidPermissionGroupWeight`, which extends `RangeError`.

A group's weight must be a finite number, since the file holds it as a JSON number.

## `PRISMARINE_INVALID_PERMISSION_NODE`

`Permission node "{node}" is not spelled as scope.name, scope.* or *`

Thrown as `PrismarineServerErrors.InvalidPermissionNode`, which extends `RangeError`.

A permission node is not spelled as `scope.name`, `scope.*` or `*`, with at most one leading
`-`. Dots separate non-empty segments, and `*` can only be the last one.

## `PRISMARINE_INVALID_PERMISSIONS_ENTRY`

`Invalid {permissionFileName} file.`

Thrown as `PrismarineServerErrors.InvalidPermissionsEntry`, which extends `Error`.

`permissions.json` or `ops.json` lists a player entry with the wrong shape. Fix or remove
that entry.

## `PRISMARINE_INVALID_SERVER_REPLAY_RANDOM_STATE`

`Invalid server replay random state`

Thrown as `PrismarineServerErrors.InvalidServerReplayRandomState`, which extends `TypeError`.

A replay's saved server random state does not have the shape the server writes, so the save
or the replay that holds it is damaged.

## `PRISMARINE_JAVA_PORT_NOT_BOUND`

`Java Edition cannot listen on TCP port {port}: {reason}`

Thrown as `PrismarineServerErrors.JavaPortNotBound`, which extends `Error`.

The Java Edition listener could not bind its TCP port, usually because another server, such
as a Java Edition server, holds it. Stop the other server, change `java-port` in
`config.json`, or set `java-enabled` to `false`.

## `PRISMARINE_LISTENERS_FAILED_TO_START`

`{reasons}`

Thrown as `PrismarineServerErrors.ListenersFailedToStart`, which extends `Error`.

One or more network listeners could not start. The message joins each listener's own reason with `; `, and the first failure is the cause.

## `PRISMARINE_MANUAL_TICK_WHILE_LOOPING`

`Cannot advance the ticker by hand while its loop runs`

Thrown as `PrismarineServerErrors.ManualTickWhileLooping`, which extends `Error`.

A test advanced the ticker by hand while its loop was running. Stop the loop first.

## `PRISMARINE_MISSING_EXECUTOR`

`Executer can't be undefined or null`

Thrown as `PrismarineServerErrors.MissingExecutor`, which extends `Error`.

A permission was checked without saying who for. This is a bug in the server; report it with
the stack trace.

## `PRISMARINE_MIXED_CARET_NOTATION`

`invalid input`

Thrown as `PrismarineServerErrors.MixedCaretNotation`, which extends `Error`.

A coordinate mixes `^` with `~` or a number, which commands do not allow.

## `PRISMARINE_NESTED_MANUAL_TICK`

`Cannot advance the ticker while a manual tick is in flight`

Thrown as `PrismarineServerErrors.NestedManualTick`, which extends `Error`.

A tick advanced the ticker from inside itself.

## `PRISMARINE_NETHERNET_FAILED_TO_START`

`NetherNet cannot start: {replace} Set "enable-nethernet": false in config.json to run on RakNet alone.`

Thrown as `PrismarineServerErrors.NethernetFailedToStart`, which extends `Error`.

NetherNet failed to start, usually because the native networking library is missing for this
platform. The message says why; the server runs on RakNet alone with `enable-nethernet` set
to `false`.

## `PRISMARINE_NETHERNET_PORT_NOT_BOUND`

`NetherNet cannot bind UDP port {port}: {reason}`

Thrown as `PrismarineServerErrors.NethernetPortNotBound`, which extends `Error`.

NetherNet could not bind one of its UDP ports, usually because another process holds it. Free
the port, or change `server-udp-ports` in `config.json`.

## `PRISMARINE_NO_CONTAINER_FOR_SLOT`

`No block entity at {x}, {y}, {z} holds slot {slot}`

Thrown as `PrismarineServerErrors.NoContainerForSlot`, which extends `TypeError`.

An inventory change addresses a container that no longer exists. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_NO_ENTITY_RUNTIME`

`no entity runtime was built for {dimension}`

Thrown as `PrismarineServerErrors.NoEntityRuntime`, which extends `Error`.

Code asked for the entities of a dimension the world did not load.

## `PRISMARINE_NO_TRANSPORT_ENABLED`

`No transport is enabled: turn on enable-raknet or enable-nethernet in config.json`

Thrown as `PrismarineServerErrors.NoTransportEnabled`, which extends `Error`.

`config.json` turns off both RakNet and NetherNet, so no player could join. Turn on at least
one.

## `PRISMARINE_OPS_NOT_LIST`

`{opsFileName} must hold a list of operators`

Thrown as `PrismarineServerErrors.OpsNotList`, which extends `Error`.

`ops.json` is not a JSON list. Fix it, or delete it to start with no operators.

## `PRISMARINE_PERMISSION_GROUP_BUILT_IN`

`The permission group "{group}" is built in and cannot be deleted`

Thrown as `PrismarineServerErrors.PermissionGroupBuiltIn`, which extends `Error`.

`default` and `operator` cannot be deleted: every subject holds the first and every operator the second.

## `PRISMARINE_PERMISSION_GROUP_CYCLE`

`Making {parent} a parent of {group} would make {group} its own ancestor`

Thrown as `PrismarineServerErrors.PermissionGroupCycle`, which extends `Error`.

A group cannot inherit from a group that inherits from it. `/perms group <group> parent add` and
the file loader refuse the parent that would close the cycle.

## `PRISMARINE_PERMISSION_GROUP_EXISTS`

`A permission group named "{group}" already exists`

Thrown as `PrismarineServerErrors.PermissionGroupExists`, which extends `Error`.

A command or a script asked to create a permission group that already exists.

## `PRISMARINE_PERMISSION_GROUP_NOT_FOUND`

`No permission group named "{group}"`

Thrown as `PrismarineServerErrors.PermissionGroupNotFound`, which extends `Error`.

A command or a script named a permission group `permissions.json` does not have.

## `PRISMARINE_PERMISSION_GROUP_OWN_PARENT`

`A permission group cannot be its own parent: {group}`

Thrown as `PrismarineServerErrors.PermissionGroupOwnParent`, which extends `Error`.

A group's parent must be another group; a group cannot inherit itself.

## `PRISMARINE_PERMISSIONS_FILE_NOT_LOADED`

`{permissionFileName} is not a version {supported} file, so the edit was not saved`

Thrown as `PrismarineServerErrors.PermissionsFileNotLoaded`, which extends `Error`.

`permissions.json` is no longer a version 2 file while the server runs, so an edit cannot
be saved into it. Restore the file, or run `/perms reload` after fixing it.

## `PRISMARINE_PERMISSIONS_NOT_OBJECT`

`{permissionFileName} must hold an object`

Thrown as `PrismarineServerErrors.PermissionsNotObject`, which extends `Error`.

`permissions.json` is not a JSON object. Fix it, or delete it to have the server write a
fresh one.

## `PRISMARINE_PERMISSIONS_SCHEMA_UNSUPPORTED`

`{permissionFileName} has schemaVersion {schemaVersion}, and this server reads up to {supported}`

Thrown as `PrismarineServerErrors.PermissionsSchemaUnsupported`, which extends `Error`.

`permissions.json` names a `schemaVersion` this server does not read, so it was written by
a newer server. Update the server, or restore the file an older one wrote.

## `PRISMARINE_PLAYER_NOT_FOUND`

`Player "{username}" not found.`

Thrown as `PrismarineServerErrors.PlayerNotFound`, which extends `Error`.

A command or the API named a player who is not online.

## `PRISMARINE_PORT_AND_SERVER_PORT_BOTH_SET`

`{configFilePath} has both port and server-port. port is the old name of server-port: remove it, and keep the port you want in server-port.`

Thrown as `PrismarineServerErrors.PortAndServerPortBothSet`, which extends `Error`.

`config.json` sets both `port` and `server-port`. Remove `port` and keep the value you want
in `server-port`.

## `PRISMARINE_RAKNET_IPV6_PORT_NOT_BOUND`

`RakNet cannot listen for IPv6 clients on UDP port {port}: {reason}`

Thrown as `PrismarineServerErrors.RaknetIpv6PortNotBound`, which extends `Error`.

RakNet could not bind the IPv6 UDP port, usually because another server holds it or the
machine has IPv6 turned off. Free the port, or change `server-portv6` in `config.json`.

## `PRISMARINE_RAKNET_PORT_NOT_BOUND`

`RakNet cannot listen on UDP port {port}: {reason}`

Thrown as `PrismarineServerErrors.RaknetPortNotBound`, which extends `Error`.

RakNet could not bind its UDP port, usually because another server holds it. Stop the other
server, or change `server-port` in `config.json`.

## `PRISMARINE_REPLAY_BEFORE_NETWORKING`

`Cannot replay a packet before networking starts`

Thrown as `PrismarineServerErrors.ReplayBeforeNetworking`, which extends `Error`.

A replay fed a packet before the server's networking started. This is a bug in the server;
report it with the stack trace.

## `PRISMARINE_SELECTOR_MATCHED_NO_ONE`

`no results`

Thrown as `PrismarineServerErrors.SelectorMatchedNoOne`, which extends `Error`.

A target selector sorted with `@r` matched no one.

## `PRISMARINE_SELECTOR_WITHOUT_AT`

`input does not start with "@"`

Thrown as `PrismarineServerErrors.SelectorWithoutAt`, which extends `Error`.

A target selector was parsed from text that does not start with `@`.

## `PRISMARINE_SERVER_IS_NOT_STARTED`

`Server is not started`

Thrown as `PrismarineServerErrors.ServerIsNotStarted`, which extends `Error`.

Code asked for the running server's details before it started.

## `PRISMARINE_SHARED_UDP_PORT_NOT_BOUND`

`RakNet and NetherNet cannot share UDP port {port}: {reason}`

Thrown as `PrismarineServerErrors.SharedUdpPortNotBound`, which extends `Error`.

RakNet and NetherNet could not open the UDP port they share, usually because another process
holds it. Free the port, or change `server-port` in `config.json`.

## `PRISMARINE_SIGNALING_PORT_NOT_BOUND`

`NetherNet cannot listen for signaling on TCP port {port}: {errorMessage}`

Thrown as `PrismarineServerErrors.SignalingPortNotBound`, which extends `Error`.

NetherNet signaling could not bind its TCP port, usually because another process holds it.
Free the port, or set `enable-nethernet` to `false`.

## `PRISMARINE_STACK_HAS_NO_PLAIN_FORM`

`A stored stack has no plain form: {name}`

Thrown as `PrismarineServerErrors.StackHasNoPlainForm`, which extends `TypeError`.

An item stack could not be recorded as plain data. This is a bug in the server; report it
with the stack trace.

## `PRISMARINE_TEST_CONTENT_READ_TOO_EARLY`

`the content was read before it was built`

Thrown as `PrismarineServerErrors.TestContentReadTooEarly`, which extends `Error`.

A test read the server's content before building it.

## `PRISMARINE_TEST_LEVEL_READS_JAVA_REGISTRIES`

`A test level never reads the Java registries`

Thrown as `PrismarineServerErrors.TestLevelReadsJavaRegistries`, which extends `Error`.

A test level was asked for Java registries, which test levels do not load.

## `PRISMARINE_TIMER_STILL_RUNNING`

`You need to stop the timer before getting the result.`

Thrown as `PrismarineServerErrors.TimerStillRunning`, which extends `Error`.

Code read a timer's result while it was still running.

## `PRISMARINE_UNKNOWN_BLOCK_ENTITY_FIELD`

`A block entity has no field {field}`

Thrown as `PrismarineServerErrors.UnknownBlockEntityField`, which extends `TypeError`.

A change to a block entity names a field block entities do not have. This is a bug in the
server; report it with the stack trace.

## `PRISMARINE_UNKNOWN_BLOCK_PROPERTY`

`Block {name} has no property {key} (has: {properties})`

Thrown as `PrismarineServerErrors.UnknownBlockProperty`, which extends `Error`.

Code read or set a block property the block does not have. The message lists the ones it has.

## `PRISMARINE_UNKNOWN_SELECTOR_TYPE`

`type "{type}" is invalid. Expected "a", "e", "p", "r" or "s"`

Thrown as `PrismarineServerErrors.UnknownSelectorType`, which extends `Error`.

A target selector starts with a letter that is not `a`, `e`, `p`, `r` or `s`.

## `PRISMARINE_UNKNOWN_WORLD_EXPERIMENT`

`Unknown world experiment {experiment}. The experiments this server implements are: {known}.`

Thrown as `PrismarineServerErrors.UnknownWorldExperiment`, which extends `Error`.

A world in `config.json` lists an experiment the server does not implement, often a typo.
Remove it, or spell it as one of the ids the message lists.

## `PRISMARINE_UNSUPPORTED_CONFIG_TYPE`

`Unsupported config type. (Supported types: json)`

Thrown as `PrismarineServerErrors.UnsupportedConfigType`, which extends `Error`.

A config file was opened with an extension other than `.json`.

## `PRISMARINE_UNSUPPORTED_GENERATOR_KEY`

`` Invalid generator with id {generator}. The `generator` key is deprecated: write `preset` as '{defaultWorldPreset}' or '{flatWorldPreset}', or a `dimensions` entry whose generator type is one of: {knownKinds}. ``

Thrown as `PrismarineServerErrors.UnsupportedGeneratorKey`, which extends `Error`.

A world in `config.json` uses the old `generator` key with a value the server no longer
reads. Write `preset`, or a `dimensions` entry, as the message shows.

## `PRISMARINE_UNTYPED_BLOCK_PROPERTY`

`Property {name}.{key} has no declared type`

Thrown as `PrismarineServerErrors.UntypedBlockProperty`, which extends `Error`.

A block's property has no type in the block data. The block data is incomplete; regenerate
it.

## `PRISMARINE_VERSIONED_FILE_NOT_OBJECT`

`{fileName} must hold an object`

Thrown as `PrismarineServerErrors.VersionedFileNotObject`, which extends `Error`.

A file the server upgrades on load, such as `permissions.json` or `config.json`, is not a
JSON object, so it has no version to read. Fix it, or delete it to have the server write a
fresh one.
<!-- /fact -->
