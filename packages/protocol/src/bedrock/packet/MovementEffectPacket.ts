import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { MovementEffectType, movementEffectPacket } from '../wire/definitions/movementEffect';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { MovementEffectPayload } from '../wire/definitions/movementEffect';

export { MovementEffectType };

/** The fields of a `MovementEffectPacket`, in wire order. */
export type MovementEffect = MovementEffectPayload;

/**
 * Gives the client the exact duration of a client-predicted movement effect, for example the
 * glide boost a firework rocket starts.
 *
 * Protocol 2193 layout, in wire order: `Target Runtime ID` as a varuint64, `Effect ID` as a
 * ZigZag varint32 holding a {@link MovementEffectType}, `Effect Duration` as a ZigZag
 * varint32, then `Tick` as a varuint64. Protocol 2225 leaves the layout unchanged.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/movement-effect-packet/
 */
export default class MovementEffectPacket extends NetworkPacket<MovementEffect> {
    public get id(): number {
        return PacketIdentifier.MOVEMENT_EFFECT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: MovementEffect): void {
        layoutAt(movementEffectPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): MovementEffect {
        return layoutAt(movementEffectPacket, this.codecProtocol).decode(stream);
    }
}
