import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The docs' `Agent Animation`, numbered from 0 as the datagen snapshot lists it. */
export enum AgentAnimation {
    ARM_SWING = 0,
    SHRUG = 1
}

/** The fields of an `AgentAnimationPacket`, in wire order. */
export interface AgentAnimationData {
    /** `Agent Animation`, which animation the agent plays. */
    animation: AgentAnimation;
    /** `Runtime Id`, the `ActorRuntimeID` of the agent. */
    runtimeId: bigint;
}

/**
 * Tells clients that a Code Builder agent played an animation, so each of them replicates it.
 *
 * Protocol 2193 layout, in wire order: `Agent Animation` as one uint8 holding an
 * {@link AgentAnimation}, then `Runtime Id` as an `ActorRuntimeID`, a varuint64.
 */
export default class AgentAnimationPacket extends NetworkPacket<AgentAnimationData> {
    public get id(): number {
        return PacketIdentifier.AGENT_ANIMATION;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AgentAnimationData): void {
        stream.writeByte(data.animation);
        stream.writeUnsignedVarLong(data.runtimeId);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AgentAnimationData {
        return {
            animation: stream.readByte(),
            runtimeId: stream.readUnsignedVarLong()
        };
    }
}
