import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Closes a container, in either direction.
 *
 * The client sends it once it has deleted its own container manager; the server deletes its
 * own and sends one back, which is what takes the screen off the player.
 *
 * Wire order at protocol 2193: `Container Id` (uint8), `Container Type` (uint8),
 * `Server Initiated Close` (boolean).
 */
export default class ContainerClosePacket extends DataPacket {
    public static NetID = Identifiers.ContainerClosePacket;

    /** `Container Id`: the window being closed. */
    public containerId!: number;

    /** `Container Type`: which screen it was. */
    public containerType!: number;

    /** `Server Initiated Close`: true when the server, not the player, closed it. */
    public serverInitiatedClose!: boolean;

    /** Writes the three fields in docs order. */
    public encodePayload(): void {
        this.writeByte(this.containerId);
        this.writeByte(this.containerType);
        this.writeBoolean(this.serverInitiatedClose);
    }

    /** Reads the three fields in docs order. */
    public decodePayload(): void {
        this.containerId = this.readByte();
        this.containerType = this.readByte();
        this.serverInitiatedClose = this.readBoolean();
    }
}
