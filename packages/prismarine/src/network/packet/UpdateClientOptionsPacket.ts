import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

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
 * Wire layout at protocol 2193: Graphics Mode Change as an optional uint8, then Filter
 * Profanity Change as an optional boolean. Each optional is a presence byte followed by the
 * value. The 1.26.50 page draws both as plain values, but the client has written the presence
 * bytes since the packet appeared, which is how gophertunnel reads it at 2193 and how the
 * 2207 page lists it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/update-client-options-packet/
 */
export default class UpdateClientOptionsPacket extends DataPacket {
    public static NetID = Identifiers.UpdateClientOptionsPacket;

    /** The new graphics mode, or `null` when it did not change. */
    public graphicsMode: GraphicsMode | null = null;

    /** The new profanity filter setting, or `null` when it did not change. */
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
