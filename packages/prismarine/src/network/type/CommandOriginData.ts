import { NetworkUtil } from '../../network/NetworkUtil';
import UUID from '../../utils/UUID';
import CommandOriginType from './CommandOriginType';

/**
 * The name each origin travels under.
 *
 * The origin used to be the enum's number. It is a name now, and reading a varint where the
 * client writes a length prefixed string takes the length as the value and then reads the
 * name's bytes as the UUID - which is why a command from a real client failed to decode with
 * "cannot read 101 bytes", 101 being whatever the string happened to start with.
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
    entityserver: CommandOriginType.EntityServer
};

export default class CommandOriginData {
    public type!: number;
    public uuid!: UUID;
    public requestId!: string;
    public uniqueEntityId!: bigint;

    public static networkDeserialize(stream: any): CommandOriginData {
        const data = new CommandOriginData();

        const origin = NetworkUtil.readString(stream);
        data.type = ORIGIN_NAMES[origin] ?? CommandOriginType.Player;

        data.uuid = UUID.networkDeserialize(stream);
        data.requestId = NetworkUtil.readString(stream);

        // Always present, and a fixed width 64 bit integer rather than a varint. It used to be
        // written only for the dev console and the test origin; skipping it for a player's own
        // command left eight bytes unread and the rest of the packet unreadable.
        data.uniqueEntityId = stream.readLongLE();

        return data;
    }
}
