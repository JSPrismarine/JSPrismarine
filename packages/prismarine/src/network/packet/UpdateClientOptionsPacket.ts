import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/** The client's graphics setting, as `GraphicsMode` numbers it. */
export enum GraphicsMode {
    Simple = 0,
    Fancy = 1,
    Advanced = 2,
    RayTraced = 3
}

/**
 * A change to one of the client settings it first reported in the login connection request.
 *
 * **Bound To:** Server
 *
 * Protocol 2193 layout (docs id 323), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Graphics Mode Change | optional uint8 | A presence byte, then one of {@link GraphicsMode} when set |
 * | Filter Profanity Change | optional boolean | A presence byte, then the value when set |
 *
 * The 1.26.51 page draws both fields as plain values and its 1.26.60-preview.21 changelog then
 * marks them optional. The presence bytes are not new: gophertunnel and PocketMine read them at
 * protocol 2193, and the client has written them since the packet appeared.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-client-options-packet/
 */
export default class UpdateClientOptionsPacket extends FieldNetworkPacket {
    /** Graphics Mode Change: the new graphics mode, or `null` when it did not change. */
    public graphicsMode: GraphicsMode | null = null;

    /** Filter Profanity Change: the new profanity filter setting, or `null` when it did not change. */
    public filterProfanity: boolean | null = null;

    /** Reads the two optional settings. */
    public decodePayload(): void {
        this.graphicsMode = this.readBoolean() ? this.readByte() : null;
        this.filterProfanity = this.readBoolean() ? this.readBoolean() : null;
    }

    /** Writes the two optional settings. */
    public encodePayload(): void {
        this.writeBoolean(this.graphicsMode !== null);
        if (this.graphicsMode !== null) this.writeByte(this.graphicsMode);
        this.writeBoolean(this.filterProfanity !== null);
        if (this.filterProfanity !== null) this.writeBoolean(this.filterProfanity);
    }
}
