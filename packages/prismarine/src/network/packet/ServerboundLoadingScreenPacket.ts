import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Which edge of a loading screen the client is reporting.
 *
 * Mojang's 1.26.50 page lists the members as 0 and 1, but those are positions in the listing.
 * A 1.26.51 client writes 1 for the start and 2 for the end, which is how gophertunnel reads
 * them at protocol 2193 and how the 2207 page lists them.
 */
export enum LoadingScreenPacketType {
    Unknown = 0,
    StartLoadingScreen = 1,
    EndLoadingScreen = 2
}

/**
 * The client saying that a loading screen opened or closed.
 *
 * Wire layout at protocol 2193: Loading Screen Packet Type as a ZigZag varint32, then Loading
 * Screen Id as an optional uint32 LE (a presence byte, then the value). The id is absent for
 * the screen shown while joining a world and carries the server's value from
 * `ChangeDimensionPacket` otherwise. The 1.26.50 page draws the id as a plain uint32, but the
 * client has sent the presence byte since the packet appeared; the 2207 page says so too.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/serverbound-loading-screen-packet/
 */
export default class ServerboundLoadingScreenPacket extends DataPacket {
    public static NetID = Identifiers.ServerboundLoadingScreenPacket;

    /** Start or end of the screen, see {@link LoadingScreenPacketType}. */
    public loadingScreenType = LoadingScreenPacketType.Unknown;

    /** The id the server gave the screen, or `null` for the screen shown while joining. */
    public loadingScreenId: number | null = null;

    /** Reads the type and the optional id. */
    public decodePayload(): void {
        this.loadingScreenType = this.readVarInt();
        this.loadingScreenId = this.readBoolean() ? this.readUnsignedIntLE() : null;
    }

    /** Writes the type and the optional id, for tests and for a client built on this package. */
    public encodePayload(): void {
        this.writeVarInt(this.loadingScreenType);
        this.writeBoolean(this.loadingScreenId !== null);
        if (this.loadingScreenId !== null) this.writeUnsignedIntLE(this.loadingScreenId);
    }
}
