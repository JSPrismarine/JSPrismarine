import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { setCommandsEnabledPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import type { PayloadOf } from '../wire/define';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The `Commands Enabled` flag sent by {@link SetCommandsEnabledPacket}. */
export type SetCommandsEnabledPayload = PayloadOf<typeof setCommandsEnabledPacket>;

/**
 * Tells a client whether it may run commands and use command-related interface controls.
 *
 * The packet contains one `Commands Enabled` boolean. It is used by the world settings screen,
 * cheats, and Education Edition tools; the server sends it in response to enabling commands
 * through `SimpleEventPacket`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-commands-enabled-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/simple-event-packet/
 */
export default class SetCommandsEnabledPacket extends NetworkPacket<SetCommandsEnabledPayload> {
    public get id(): number {
        return PacketIdentifier.SET_COMMANDS_ENABLED;
    }

    public constructor(packetData?: SetCommandsEnabledPayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetCommandsEnabledPayload): void {
        layoutAt(setCommandsEnabledPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetCommandsEnabledPayload {
        return layoutAt(setCommandsEnabledPacket, this.codecProtocol).decode(stream);
    }
}
