import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The command and output preference sent when a player changes a world setting. */
export interface SettingsCommand {
    /** Full command line the server should run, including its leading slash. */
    command: string;
    /** Whether the client asks the server to suppress command output. */
    suppressOutput: boolean;
}

/**
 * Requests a setting change through commands. The client sends it when the player changes a
 * world setting such as the day and night cycle or weather from the world settings menu.
 *
 * Protocol 2193 layout: `Command` as a varuint32-length-prefixed UTF-8 string, then
 * `Suppress Output?` as a boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/settings-command-packet/
 */
export default class SettingsCommandPacket extends NetworkPacket<SettingsCommand> {
    public get id(): number {
        return PacketIdentifier.SETTINGS_COMMAND;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SettingsCommand): void {
        stream.writeString(data.command);
        stream.writeBoolean(data.suppressOutput);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SettingsCommand {
        return { command: stream.readString(), suppressOutput: stream.readBoolean() };
    }
}
