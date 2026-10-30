import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** One client-side animation and the actors that should play it. */
export interface AnimateEntity {
    /** Name of the animation declared in the resource pack. */
    animation: string;
    /** Controller state to enter after the animation finishes. */
    nextState: string;
    /** Molang condition that stops the animation and transitions to {@link nextState}. */
    stopExpression: string;
    /** Numeric Molang version used to evaluate {@link stopExpression}. */
    stopExpressionVersion: number;
    /** Name of the animation controller that selects animations from its state. */
    controller: string;
    /** Time in seconds used to blend out of the animation. */
    blendOutTime: number;
    /** Runtime ids of the actors that play this animation. */
    runtimeIds: bigint[];
}

/**
 * Triggers a one-off animation on the client that receives it.
 *
 * Protocol 2193 writes three strings, `mStopExpressionVersion` as a little-endian int32,
 * `mController` as a string, `mBlendOutTime` as a little-endian float, then `mRuntimeIds` as
 * a varuint32 count followed by varuint64 actor runtime ids. The animation, state, expression,
 * and controller names are defined by resource packs.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/animate-entity-packet/
 */
export default class AnimateEntityPacket extends NetworkPacket<AnimateEntity> {
    public get id(): number {
        return PacketIdentifier.ANIMATE_ENTITY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AnimateEntity): void {
        stream.writeString(data.animation);
        stream.writeString(data.nextState);
        stream.writeString(data.stopExpression);
        stream.writeIntLE(data.stopExpressionVersion);
        stream.writeString(data.controller);
        stream.writeFloatLE(data.blendOutTime);
        stream.writeUnsignedVarInt(data.runtimeIds.length);
        for (const runtimeId of data.runtimeIds) stream.writeUnsignedVarLong(runtimeId);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AnimateEntity {
        const animation = stream.readString();
        const nextState = stream.readString();
        const stopExpression = stream.readString();
        const stopExpressionVersion = stream.readIntLE();
        const controller = stream.readString();
        const blendOutTime = stream.readFloatLE();
        const count = stream.readUnsignedVarInt();
        const runtimeIds: bigint[] = [];
        for (let index = 0; index < count; index++) runtimeIds.push(stream.readUnsignedVarLong());

        return { animation, nextState, stopExpression, stopExpressionVersion, controller, blendOutTime, runtimeIds };
    }
}
