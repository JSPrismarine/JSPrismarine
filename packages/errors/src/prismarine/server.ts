import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/**
 * Raised when a config file cannot be read as JSON.
 *
 * Thrown rather than swallowed on purpose. Treating a file with a typo in it as empty and then
 * writing the defaults back is how a server used to erase its own config; refusing to start
 * keeps the file for the person to fix.
 */
export abstract class ConfigSyntaxError extends JSPrismarineError {
    public override name = 'ConfigSyntaxError';
}

/** The errors the server code of `@jsprismarine/prismarine` throws. */
export const PrismarineServerErrors = defineErrors('prismarine', {
    /**
     * The protocol the server advertises names no Minecraft version. This is a bug in the server;
     * report it with the stack trace.
     */
    AdvertisedCodecWithoutVersion: 'The advertised codec names no Minecraft version!',
    /**
     * A change to a block entity names a field block entities do not have. This is a bug in the
     * server; report it with the stack trace.
     */
    UnknownBlockEntityField: { message: 'A block entity has no field {field}', base: TypeError },
    /**
     * Code read or set a block property the block does not have. The message lists the ones it has.
     */
    UnknownBlockProperty: 'Block {name} has no property {key} (has: {properties})',
    /** Code read or set a property on a block that has none. */
    BlockHasNoProperties: 'Block {name} has no property {key} (has: none)',
    /** A test advanced the ticker by hand while its loop was running. Stop the loop first. */
    ManualTickWhileLooping: 'Cannot advance the ticker by hand while its loop runs',
    /** A tick advanced the ticker from inside itself. */
    NestedManualTick: 'Cannot advance the ticker while a manual tick is in flight',
    /**
     * The server could not read a config file, and refuses to start rather than overwrite it with
     * defaults. Fix the file named in the message, or its permissions.
     */
    ConfigNotReadable: 'Cannot read {path}: {detail}',
    /**
     * A replay fed a packet before the server's networking started. This is a bug in the server;
     * report it with the stack trace.
     */
    ReplayBeforeNetworking: 'Cannot replay a packet before networking starts',
    /**
     * The random callback the server was configured with cannot save its state, so the session
     * cannot be recorded for replay. Use the default random source to record replays.
     */
    ConfiguredRandomNotSavable: 'The configured server random callback has no serializable state',
    /** A test read the server's content before building it. */
    TestContentReadTooEarly: 'the content was read before it was built',
    /**
     * Code read the server's content before its packs were loaded, such as a plugin that runs too
     * early in startup.
     */
    ContentReadTooEarly: 'the content was read before the pack stack was built',
    /** Code read the content world before the content was built. */
    ContentWorldReadBeforeContent: 'the content world was read before the content was built',
    /**
     * Code read the content world before the server's packs were loaded, such as a plugin that runs
     * too early in startup.
     */
    ContentWorldReadTooEarly: 'the content world was read before the pack stack was built',
    /**
     * The server could not save a setting to its config file. The cause says why, such as
     * permissions or a full disk.
     */
    ConfigNotWritable: 'Could not write {key} to {path}',
    /**
     * A permission was checked without saying who for. This is a bug in the server; report it with
     * the stack trace.
     */
    MissingExecutor: "Executer can't be undefined or null",
    /** A command was given a coordinate that is not a number, `~` or `^`. */
    ExpectedCoordinate: 'Expected a coordinate, got "{original}"',
    /**
     * The server could not build its content because the packs did not load. The cause is the
     * load's error.
     */
    ContentBuildFailed: 'Failed to build the content registries; the pack stack was not loaded',
    /** A test asked its fake level for a dimension it was not given. */
    FakeLevelHasNoWorld: 'the fake level has no {dimensionId} world',
    /** A test's fake level needs a world provider for what the test asked of it. */
    FakeLevelWithoutProvider: 'the fake level was built without a provider',
    /**
     * `config.json` sets both `port` and `server-port`. Remove `port` and keep the value you want
     * in `server-port`.
     */
    PortAndServerPortBothSet:
        '{configFilePath} has both port and server-port. port is the old name of server-port: remove it, and keep the port you want in server-port.',
    /** A target selector was parsed from text that does not start with `@`. */
    SelectorWithoutAt: 'input does not start with "@"',
    /**
     * `permissions.json` or `ops.json` lists a player entry with the wrong shape. Fix or remove
     * that entry.
     */
    InvalidPermissionsEntry: 'Invalid {permissionFileName} file.',
    /**
     * A world in `config.json` uses the old `generator` key with a value the server no longer
     * reads. Write `preset`, or a `dimensions` entry, as the message shows.
     */
    UnsupportedGeneratorKey:
        "Invalid generator with id {generator}. The `generator` key is deprecated: write `preset` as '{defaultWorldPreset}' or '{flatWorldPreset}', or a `dimensions` entry whose generator type is one of: {knownKinds}.",
    /**
     * A world in `config.json` lists an experiment the server does not implement, often a typo.
     * Remove it, or spell it as one of the ids the message lists.
     */
    UnknownWorldExperiment:
        'Unknown world experiment {experiment}. The experiments this server implements are: {known}.',
    /** A coordinate mixes `^` with `~` or a number, which commands do not allow. */
    MixedCaretNotation: 'invalid input',
    /**
     * A replay's saved server random state does not have the shape the server writes, so the save
     * or the replay that holds it is damaged.
     */
    InvalidServerReplayRandomState: { message: 'Invalid server replay random state', base: TypeError },
    /**
     * A block entity change holds a value that is not plain data. This is a bug in the server;
     * report it with the stack trace.
     */
    InvalidLoggedBlockEntityValue: { message: 'A logged block entity field holds {value}', base: TypeError },
    /**
     * An inventory change holds a value that is not an item stack. This is a bug in the server;
     * report it with the stack trace.
     */
    InvalidLoggedSlot: { message: 'A logged slot cannot hold {value}', base: TypeError },
    /** The ban list file is not a JSON list. Fix it, or delete it to start with no bans. */
    BanListNotList: '{fileName} must hold a list of banned players',
    /** `ops.json` is not a JSON list. Fix it, or delete it to start with no operators. */
    OpsNotList: '{opsFileName} must hold a list of operators',
    /**
     * `permissions.json` is not a JSON object. Fix it, or delete it to have the server write a
     * fresh one.
     */
    PermissionsNotObject: '{permissionFileName} must hold an object',
    /**
     * `permissions.json` names a `schemaVersion` this server does not read, so it was written by
     * a newer server. Update the server, or restore the file an older one wrote.
     */
    PermissionsSchemaUnsupported:
        '{permissionFileName} has schemaVersion {schemaVersion}, and this server reads up to {supported}',
    /**
     * A permission node is not spelled as `scope.name`, `scope.*` or `*`, with at most one leading
     * `-`. Dots separate non-empty segments, and `*` can only be the last one.
     */
    InvalidPermissionNode: {
        message: 'Permission node "{node}" is not spelled as scope.name, scope.* or *',
        base: RangeError
    },
    /** An expiry is not an ISO 8601 instant in the future, such as `2030-01-01T00:00:00Z`. */
    InvalidPermissionExpiry: {
        message: 'Expiry "{expires}" is not an ISO 8601 instant in the future',
        base: RangeError
    },
    /** A command or a script named a permission group `permissions.json` does not have. */
    PermissionGroupNotFound: 'No permission group named "{group}"',
    /** A command or a script asked to create a permission group that already exists. */
    PermissionGroupExists: 'A permission group named "{group}" already exists',
    /** `default` and `operator` cannot be deleted: every subject holds the first and every operator the second. */
    PermissionGroupBuiltIn: 'The permission group "{group}" is built in and cannot be deleted',
    /** A group's parent must be another group; a group cannot inherit itself. */
    PermissionGroupOwnParent: 'A permission group cannot be its own parent: {group}',
    /** A group's name is empty or has whitespace. */
    InvalidPermissionGroupName: {
        message: 'Permission group name "{group}" is empty or has whitespace',
        base: RangeError
    },
    /**
     * NetherNet signaling could not bind its TCP port, usually because another process holds it.
     * Free the port, or set `enable-nethernet` to `false`.
     */
    SignalingPortNotBound: 'NetherNet cannot listen for signaling on TCP port {port}: {errorMessage}',
    /**
     * NetherNet failed to start, usually because the native networking library is missing for this
     * platform. The message says why; the server runs on RakNet alone with `enable-nethernet` set
     * to `false`.
     */
    NethernetFailedToStart:
        'NetherNet cannot start: {replace} Set "enable-nethernet": false in config.json to run on RakNet alone.',
    /**
     * An inventory change addresses a container that no longer exists. This is a bug in the server;
     * report it with the stack trace.
     */
    NoContainerForSlot: { message: 'No block entity at {x}, {y}, {z} holds slot {slot}', base: TypeError },
    /** Code asked for the entities of a dimension the world did not load. */
    NoEntityRuntime: 'no entity runtime was built for {dimension}',
    /** A target selector sorted with `@r` matched no one. */
    SelectorMatchedNoOne: 'no results',
    /**
     * `config.json` turns off both RakNet and NetherNet, so no player could join. Turn on at least
     * one.
     */
    NoTransportEnabled: 'No transport is enabled: turn on enable-raknet or enable-nethernet in config.json',
    /**
     * A config file is not valid JSON. The server refuses to start rather than overwrite it with
     * defaults; fix the file at the offset given.
     */
    ConfigNotValidJson: {
        message: 'Not valid json: {printParseErrorCode} at offset {offset}',
        base: ConfigSyntaxError
    },
    /** A config file holds a single value instead of an object or a list. Fix the file. */
    ConfigIsSingleValue: {
        message: 'Not valid json: the document is a single value, not an object or an array',
        base: ConfigSyntaxError
    },
    /**
     * Code set a block property to a value outside its allowed set. The message lists the allowed
     * values.
     */
    InvalidBlockPropertyValue: 'Property {name}.{key} does not accept {value} (accepts: {values})',
    /**
     * A block's property has no type in the block data. The block data is incomplete; regenerate
     * it.
     */
    UntypedBlockProperty: 'Property {name}.{key} has no declared type',
    /** A command or the API named a player who is not online. */
    PlayerNotFound: 'Player "{username}" not found.',
    /** Code asked for the running server's details before it started. */
    ServerIsNotStarted: 'Server is not started',
    /**
     * An item stack could not be recorded as plain data. This is a bug in the server; report it
     * with the stack trace.
     */
    StackHasNoPlainForm: { message: 'A stored stack has no plain form: {name}', base: TypeError },
    /** A test level was asked for Java registries, which test levels do not load. */
    TestLevelReadsJavaRegistries: 'A test level never reads the Java registries',
    /** A target selector starts with a letter that is not `a`, `e`, `p`, `r` or `s`. */
    UnknownSelectorType: 'type "{type}" is invalid. Expected "a", "e", "p", "r" or "s"',
    /**
     * RakNet and NetherNet could not open the UDP port they share, usually because another process
     * holds it. Free the port, or change `server-port` in `config.json`.
     */
    SharedUdpPortNotBound: 'RakNet and NetherNet cannot share UDP port {port}: {reason}',
    /**
     * NetherNet could not bind one of its UDP ports, usually because another process holds it. Free
     * the port, or change `server-udp-ports` in `config.json`.
     */
    NethernetPortNotBound: 'NetherNet cannot bind UDP port {port}: {reason}',
    /** A config file was opened with an extension other than `.json`. */
    UnsupportedConfigType: 'Unsupported config type. (Supported types: json)',
    /**
     * A crafting grid was built with the wrong number of slots for its size. This is a bug in the
     * server; report it with the stack trace.
     */
    CraftingGridSizeMismatch: 'A {width}x{height} grid needs {value} slots, was given {slotsCount}',
    /** Code read a timer's result while it was still running. */
    TimerStillRunning: 'You need to stop the timer before getting the result.',
    /**
     * RakNet could not bind its UDP port, usually because another server holds it. Stop the other
     * server, or change `server-port` in `config.json`.
     */
    RaknetPortNotBound: 'RakNet cannot listen on UDP port {port}: {reason}',
    /**
     * RakNet could not bind the IPv6 UDP port, usually because another server holds it or the
     * machine has IPv6 turned off. Free the port, or change `server-portv6` in `config.json`.
     */
    RaknetIpv6PortNotBound: 'RakNet cannot listen for IPv6 clients on UDP port {port}: {reason}',
    /** One or more network listeners could not start. The message joins each listener's own reason with `; `, and the first failure is the cause. */
    ListenersFailedToStart: '{reasons}',
    /**
     * Code read the content settings, such as the world pack directories, before the server built
     * its content, which reads them. This is a bug in the server; report it with the stack trace.
     */
    ContentSettingsReadBeforeBuild: 'The content settings are read with the content build'
});
