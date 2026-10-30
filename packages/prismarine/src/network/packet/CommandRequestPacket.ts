import { commandRequestPacket, layoutAt } from '@jsprismarine/protocol';

import UUID from '../../utils/UUID';
import CommandOriginData from '../type/CommandOriginData';
import CommandOriginType from '../type/CommandOriginType';
import DataPacket from './DataPacket';

/**
 * A slash command a client typed.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `commandRequestPacket` definition:
 * `Command` as a string with its leading slash, `Origin` as a {@link CommandOriginData}, `IsInternal` as a boolean, then `Version` as a string. `Version`
 * refers to the `CurrentCmdVersion` enum, which the schema gives no `Enum-as-Value` option,
 * so the member name travels rather than its number.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/command-request-packet/
 */
export default class CommandRequestPacket extends DataPacket {
    /** `Command`: what was typed, with its leading slash still on. */
    public commandName = '';

    /** `Origin`: who or what ran it. A client's own commands carry the `Player` origin. */
    public commandOriginData = new CommandOriginData(CommandOriginType.Player, new UUID(), '', 0n);

    /** `IsInternal`: whether the client raised it itself rather than the player typing it. */
    public internal = false;

    /** `Version`: a `CurrentCmdVersion` member name. */
    public version = '';

    /** Reads `Command`, `Origin`, `IsInternal` and `Version`. */
    public decodePayload(): void {
        const read = layoutAt(commandRequestPacket, this.codecProtocol).decode(this);
        this.commandName = read.commandName;
        this.commandOriginData = read.commandOriginData;
        this.internal = read.internal;
        this.version = read.version;
    }

    /** Writes `Command`, `Origin`, `IsInternal` and `Version`. */
    public encodePayload(): void {
        layoutAt(commandRequestPacket, this.codecProtocol).encode(this, {
            commandName: this.commandName,
            commandOriginData: this.commandOriginData,
            internal: this.internal,
            version: this.version
        });
    }
}
