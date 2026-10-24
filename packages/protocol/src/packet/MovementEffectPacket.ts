import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The `MovementEffectType` enum behind `Effect ID`, numbered as the docs and gophertunnel list it. */
export enum MovementEffectType {
    /** The boost a firework rocket gives a gliding player. */
    GLIDE_BOOST = 0,
    /** The speed boost from swimming near a dolphin. */
    DOLPHIN_BOOST = 1,
    /** The upward boost from a geyser. */
    GEYSER_BOOST = 2
}

/** The fields of a `MovementEffectPacket`, in wire order. */
export interface MovementEffect {
    /** `Target Runtime ID` of the actor the effect applies to. */
    targetRuntimeId: bigint;
    /** `Effect ID`, which effect to apply. */
    effectType: MovementEffectType;
    /** `Effect Duration` in ticks. */
    effectDuration: number;
    /**
     * `Tick`: the most recently processed `PlayerInputTick` from the target player's
     * `PlayerAuthInputPacket`, or from the one controlling a client-predicted vehicle. Zero for
     * other actors.
     */
    tick: bigint;
}

/**
 * Gives the client the exact duration of a client-predicted movement effect, for example the
 * glide boost a firework rocket starts.
 *
 * Protocol 2193 layout, in wire order: `Target Runtime ID` as a varuint64, `Effect ID` as a
 * ZigZag varint32 holding a {@link MovementEffectType}, `Effect Duration` as a ZigZag
 * varint32, then `Tick` as a varuint64.
 */
export default class MovementEffectPacket extends NetworkPacket<MovementEffect> {
    public get id(): number {
        return PacketIdentifier.MOVEMENT_EFFECT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: MovementEffect): void {
        stream.writeUnsignedVarLong(data.targetRuntimeId);
        stream.writeVarInt(data.effectType);
        stream.writeVarInt(data.effectDuration);
        stream.writeUnsignedVarLong(data.tick);
    }

    protected deserializePayload(stream: NetworkBinaryStream): MovementEffect {
        const targetRuntimeId = stream.readUnsignedVarLong();
        const effectType: MovementEffectType = stream.readVarInt();
        const effectDuration = stream.readVarInt();
        const tick = stream.readUnsignedVarLong();

        return { targetRuntimeId, effectType, effectDuration, tick };
    }
}
