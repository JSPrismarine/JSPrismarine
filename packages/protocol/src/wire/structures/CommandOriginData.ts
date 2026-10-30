import type BinaryStream from '@jsprismarine/binaryutils';
import { NetworkUtil } from '../networkUtil';
import CommandOriginType from './CommandOriginType';
import UUID from './UUID';

/**
 * The name each origin travels under, keyed in lower case so the lookup ignores the sender's
 * casing.
 *
 * `Type` is a string on the wire, not the enum's number. The 1.26.51 schema gives the field no
 * `Enum-as-Value` option, the rendered docs type it `string`, and gophertunnel at protocol
 * 2193 writes these lower case names. A reader that takes a varint there gets the string's
 * length prefix as the type and the name's bytes as the start of the UUID. The schema lists
 * four names for the field (Player, DevConsole, Test, AutomationPlayer); the reader accepts
 * all sixteen members of `CommandOriginType`.
 */
const ORIGIN_NAMES: Readonly<Record<string, CommandOriginType>> = {
    player: CommandOriginType.Player,
    commandblock: CommandOriginType.CommandBlock,
    minecartcommandblock: CommandOriginType.MinecartCommandBlock,
    devconsole: CommandOriginType.DevConsole,
    test: CommandOriginType.Test,
    automationplayer: CommandOriginType.AutomationPlayer,
    clientautomation: CommandOriginType.ClientAutomation,
    dedicatedserver: CommandOriginType.DedicatedServer,
    entity: CommandOriginType.Entity,
    virtual: CommandOriginType.Virtual,
    gameargument: CommandOriginType.GameArgument,
    entityserver: CommandOriginType.EntityServer,
    precompiled: CommandOriginType.Precompiled,
    gamedirectorentityserver: CommandOriginType.GameDirectorEntityServer,
    scripting: CommandOriginType.Scripting,
    executecontext: CommandOriginType.ExecuteContext
};

/** The name to write for each origin, taken from {@link ORIGIN_NAMES} so the two cannot drift. */
const ORIGIN_NAME_BY_TYPE = new Map(Object.entries(ORIGIN_NAMES).map(([name, type]) => [type, name]));

/**
 * The `Origin` of a `CommandRequestPacket` and the `Origin Data` a `CommandOutputPacket`
 * sends back, Mojang's `CommandOriginData`.
 *
 * Wire order at protocol 2193: `Type` string, `UUID` as two uint64 LE halves with the most
 * significant first, `RequestId` string, `PlayerId` int64 LE. All four are always present;
 * `PlayerId` is not conditional on the origin.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/command-origin-data/
 */
export default class CommandOriginData {
    /** `Type`: who or what issued the command. A client's own commands carry `Player`. */
    public type: CommandOriginType;

    /** `UUID`: identifies this run of the command. The reply carries the same one. */
    public uuid: UUID;

    /** `RequestId`: the request's id, as the sender chose it. */
    public requestId: string;

    /** `PlayerId`: the unique entity id of the player the origin stands for. */
    public uniqueEntityId: bigint;

    public constructor(type: CommandOriginType, uuid: UUID, requestId: string, uniqueEntityId: bigint) {
        this.type = type;
        this.uuid = uuid;
        this.requestId = requestId;
        this.uniqueEntityId = uniqueEntityId;
    }

    /**
     * Reads one origin from the stream. A "Type" name this server does not know decodes as
     * `Player`.
     */
    public static networkDeserialize(stream: BinaryStream): CommandOriginData {
        const origin = NetworkUtil.readString(stream);
        const type = ORIGIN_NAMES[origin.toLowerCase()] ?? CommandOriginType.Player;
        const uuid = UUID.networkDeserialize(stream);
        const requestId = NetworkUtil.readString(stream);
        const uniqueEntityId = stream.readLongLE();
        return new CommandOriginData(type, uuid, requestId, uniqueEntityId);
    }

    /**
     * Writes one origin to the stream, so that a `CommandOutputPacket` can carry back the
     * origin its request arrived with.
     *
     * `Type` goes out in lower case, the form gophertunnel and Dragonfly send. The reader above
     * matches a name in any casing.
     */
    public networkSerialize(stream: BinaryStream): void {
        NetworkUtil.writeString(stream, ORIGIN_NAME_BY_TYPE.get(this.type) ?? 'player');
        this.uuid.networkSerialize(stream);
        NetworkUtil.writeString(stream, this.requestId);
        stream.writeLongLE(this.uniqueEntityId);
    }
}
