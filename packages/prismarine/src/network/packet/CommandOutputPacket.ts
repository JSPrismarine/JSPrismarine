import UUID from '../../utils/UUID';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import CommandOriginData from '../type/CommandOriginData';
import CommandOriginType from '../type/CommandOriginType';
import DataPacket from './DataPacket';

/**
 * How the client should treat the output, as `CommandOutputType` orders its members.
 *
 * The wire carries the member name as a string, not the number: the 1.26.51 docs give the
 * enum one wire format, "serialized as string", and its schema no `Enum-as-Value` option.
 */
export enum CommandOutputType {
    None = 0,
    LastOutput = 1,
    Silent = 2,
    AllOutput = 3,
    DataSet = 4
}

/** The name to write for each output type, in the lower case form real senders use. */
const OUTPUT_TYPE_NAMES: Readonly<Record<CommandOutputType, string>> = {
    [CommandOutputType.None]: 'none',
    [CommandOutputType.LastOutput]: 'lastoutput',
    [CommandOutputType.Silent]: 'silent',
    [CommandOutputType.AllOutput]: 'alloutput',
    [CommandOutputType.DataSet]: 'dataset'
};

/** The output type each name stands for, keyed in lower case so the casing does not matter. */
const OUTPUT_TYPES_BY_NAME = new Map(
    Object.entries(OUTPUT_TYPE_NAMES).map(([type, name]) => [name, Number(type)] as const)
);

/** One line of command output, Mojang's `CommandOutputMessage`. */
export interface CommandOutputMessage {
    /**
     * The message itself, either plain text or the id of a translation such as
     * `commands.tp.success.coordinates`.
     */
    messageId: string;

    /** True when the command succeeded. The client colors a failed message red. */
    successful: boolean;

    /** The values filled into the translation's placeholders. */
    parameters: string[];
}

/**
 * The output of a command, sent back to whoever asked for it.
 *
 * A command may come from a websocket server or a command block rather than from the player,
 * so the reply repeats the `CommandOriginData` of the request instead of assuming the chat
 * window. A server that answers every command with a `TextPacket` sends the output to the
 * wrong place for every origin that is not the player.
 *
 * Wire order at protocol 2193: `Origin Data` as a {@link CommandOriginData}, then `Output`:
 * the output type's name as a string, `Success Count` as a uint32 LE, `Output Messages` as a
 * varuint32 count followed by that many messages, and `Data Set` as an optional string. Each
 * message is its `Message ID` string, a `Successful?` byte, then `Parameters` as a varuint32
 * count and that many strings.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/command-output-packet/
 */
export default class CommandOutputPacket extends DataPacket {
    public static NetID = Identifiers.CommandOutputPacket;

    /** The origin of the request this answers. Send back the one the request arrived with. */
    public originData = new CommandOriginData(CommandOriginType.Player, new UUID(), '', 0n);

    /** `Output Type`: how the client should treat the messages. */
    public outputType: CommandOutputType = CommandOutputType.AllOutput;

    /** How many times the command succeeded. A function may run one command many times. */
    public successCount = 0;

    /** `Output Messages`: the lines to show, in order. */
    public outputMessages: CommandOutputMessage[] = [];

    /** The `Data Set` string, or null when the field is absent. */
    public dataSet: string | null = null;

    /** Reads the origin and the output. An output type name this server does not know reads as `None`. */
    public decodePayload(): void {
        this.originData = CommandOriginData.networkDeserialize(this);
        this.outputType =
            OUTPUT_TYPES_BY_NAME.get(NetworkUtil.readString(this).toLowerCase()) ?? CommandOutputType.None;
        this.successCount = this.readUnsignedIntLE();

        this.outputMessages = [];
        let messageCount = this.readUnsignedVarInt();
        while (messageCount-- > 0) {
            const messageId = NetworkUtil.readString(this);
            const successful = this.readBoolean();

            const parameters: string[] = [];
            let parameterCount = this.readUnsignedVarInt();
            while (parameterCount-- > 0) {
                parameters.push(NetworkUtil.readString(this));
            }

            this.outputMessages.push({ messageId, successful, parameters });
        }

        this.dataSet = this.readBoolean() ? NetworkUtil.readString(this) : null;
    }

    /** Writes the origin and the output. */
    public encodePayload(): void {
        this.originData.networkSerialize(this);
        NetworkUtil.writeString(this, OUTPUT_TYPE_NAMES[this.outputType]);
        this.writeUnsignedIntLE(this.successCount);

        this.writeUnsignedVarInt(this.outputMessages.length);
        for (const message of this.outputMessages) {
            NetworkUtil.writeString(this, message.messageId);
            this.writeBoolean(message.successful);
            this.writeUnsignedVarInt(message.parameters.length);
            for (const parameter of message.parameters) {
                NetworkUtil.writeString(this, parameter);
            }
        }

        this.writeBoolean(this.dataSet !== null);
        if (this.dataSet !== null) NetworkUtil.writeString(this, this.dataSet);
    }
}
