import { NetworkUtil } from '../NetworkUtil';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * A one-off animation to play on a set of actors.
 *
 * Bound to the client. It either plays a single animation or starts an animation controller,
 * which then picks animations by its own states and transitions. The animation, state and
 * controller names are the ones declared in the resource packs the client has.
 *
 * Wire order at protocol 2193: mAnimation, mNextState and mStopExpression as strings,
 * mStopExpressionVersion as an int32 in little-endian byte order, mController as a string,
 * mBlendOutTime as a float in little-endian byte order, then mRuntimeIds as a varuint32 count
 * followed by that many `ActorRuntimeID` (plain LEB128 varuint64).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/animate-entity-packet/
 */
export default class AnimateEntityPacket extends FieldNetworkPacket {
    /** mAnimation: the animation to play. */
    public animation = '';

    /** mNextState: the controller state to enter once the animation finishes. */
    public nextState = '';

    /** mStopExpression: the MoLang expression that decides when to leave the animation. */
    public stopExpression = '';

    /** mStopExpressionVersion: which MoLang version the stop expression is written for. */
    public stopExpressionVersion = 0;

    /** mController: the animation controller that manages the animation. */
    public controller = '';

    /** mBlendOutTime: seconds spent blending out of the animation. */
    public blendOutTime = 0;

    /** mRuntimeIds: the actors that play the animation. */
    public runtimeIds: bigint[] = [];

    /** Reads the four names, the version and blend time, and the actor list. */
    public decodePayload(): void {
        this.animation = NetworkUtil.readString(this);
        this.nextState = NetworkUtil.readString(this);
        this.stopExpression = NetworkUtil.readString(this);
        this.stopExpressionVersion = this.readIntLE();
        this.controller = NetworkUtil.readString(this);
        this.blendOutTime = this.readFloatLE();

        const count = this.readUnsignedVarInt();
        this.runtimeIds = [];
        for (let index = 0; index < count; index++) {
            this.runtimeIds.push(this.readUnsignedVarLong());
        }
    }

    /** Writes the four names, the version and blend time, and the actor list. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.animation);
        NetworkUtil.writeString(this, this.nextState);
        NetworkUtil.writeString(this, this.stopExpression);
        this.writeIntLE(this.stopExpressionVersion);
        NetworkUtil.writeString(this, this.controller);
        this.writeFloatLE(this.blendOutTime);

        this.writeUnsignedVarInt(this.runtimeIds.length);
        for (const runtimeId of this.runtimeIds) {
            this.writeUnsignedVarLong(runtimeId);
        }
    }
}
