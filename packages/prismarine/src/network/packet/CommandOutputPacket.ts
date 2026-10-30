import { commandOutputPacket, CommandOutputType, layoutAt } from '@jsprismarine/protocol';

import UUID from '../../utils/UUID';
import CommandOriginData from '../type/CommandOriginData';
import CommandOriginType from '../type/CommandOriginType';
import DataPacket from './DataPacket';

import type { CommandOutputMessage } from '@jsprismarine/protocol';

export { CommandOutputType } from '@jsprismarine/protocol';
export type { CommandOutputMessage } from '@jsprismarine/protocol';

/**
 * The output of a command, sent back to whoever asked for it.
 *
 * A command may come from a websocket server or a command block rather than from the player,
 * so the reply repeats the `CommandOriginData` of the request instead of assuming the chat
 * window. A server that answers every command with a `TextPacket` sends the output to the
 * wrong place for every origin that is not the player.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `commandOutputPacket` definition:
 * `Origin Data`, then the output type's name as a string, `Success Count` as a uint32 LE,
 * `Output Messages` as a counted list, and `Data Set` as an optional string.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/command-output-packet/
 */
export default class CommandOutputPacket extends DataPacket {
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
        const read = layoutAt(commandOutputPacket, this.codecProtocol).decode(this);
        this.originData = read.originData;
        this.outputType = read.outputType;
        this.successCount = read.successCount;
        this.outputMessages = read.outputMessages;
        this.dataSet = read.dataSet;
    }

    /** Writes the origin and the output. */
    public encodePayload(): void {
        layoutAt(commandOutputPacket, this.codecProtocol).encode(this, {
            originData: this.originData,
            outputType: this.outputType,
            successCount: this.successCount,
            outputMessages: this.outputMessages,
            dataSet: this.dataSet
        });
    }
}
