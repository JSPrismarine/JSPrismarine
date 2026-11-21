import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { levelEventPacket } from '../wire/definitions/levelEvent';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { LevelEvent } from '../wire/definitions/levelEvent';

export type { LevelEvent };

/**
 * Tells the client what happened in the world and where. The event number selects the
 * client-side behavior, while `Data` supplies any event-specific value.
 *
 * Protocol 2193 layout: `Event Id` as a ZigZag varint32, `Position` as three little-endian
 * floats, and `Data` as a ZigZag varint32.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/level-event-packet/
 */
export default class LevelEventPacket extends NetworkPacket<LevelEvent> {
    public get id(): number {
        return PacketIdentifier.LEVEL_EVENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LevelEvent): void {
        layoutAt(levelEventPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): LevelEvent {
        return layoutAt(levelEventPacket, this.codecProtocol).decode(stream);
    }
}
