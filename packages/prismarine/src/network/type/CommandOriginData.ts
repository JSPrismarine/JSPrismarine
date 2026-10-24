import type BinaryStream from '@jsprismarine/binaryutils';
import UUID from '../../utils/UUID';
import { NetworkUtil } from '../NetworkUtil';
import CommandOriginType from './CommandOriginType';

/**
 * The name each origin travels under, keyed in lower case so the lookup ignores the client's
 * casing.
 *
 * "Type" is a string on the wire. Reading a varint there takes the length prefix as the value
 * and the name's bytes as the UUID, which is how a command from a real client once failed with
 * "cannot read 101 bytes", 101 being whatever the name happened to start with.
 */
const ORIGIN_NAMES: Readonly<Record<string, CommandOriginType>> = {
    player: CommandOriginType.Player,
    commandblock: CommandOriginType.Block,
    minecartcommandblock: CommandOriginType.MinecartBlock,
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
 * The "Origin" of a `CommandRequestPacket` and the "Origin Data" a `CommandOutputPacket`
 * sends back, Mojang's `CommandOriginData`.
 *
 * Wire order at 2193: "Type" string, "UUID" as two uint64 LE halves, "RequestId" string,
 * "PlayerId" int64 LE. "PlayerId" is always present; it is not conditional on the origin.
 */
export default class CommandOriginData {
    public type: CommandOriginType;
    public uuid: UUID;
    public requestId: string;
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
     * "Type" goes out in lower case, the form gophertunnel and Dragonfly send. The reader above
     * matches a name in any casing.
     */
    public networkSerialize(stream: BinaryStream): void {
        NetworkUtil.writeString(stream, ORIGIN_NAME_BY_TYPE.get(this.type) ?? 'player');
        this.uuid.networkSerialize(stream);
        NetworkUtil.writeString(stream, this.requestId);
        stream.writeLongLE(this.uniqueEntityId);
    }
}
