import FieldNetworkPacket from '../FieldNetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { containerClosePacket } from '../wire/definitions/containers';

/**
 * Closes a container, in either direction.
 *
 * The client sends it once it has deleted its own container manager; the server deletes its
 * own and sends one back, which is what takes the screen off the player.
 *
 * Wire order at protocol 2193: `Container Id` (uint8), `Container Type` (uint8),
 * `Server Initiated Close` (boolean).
 */
export default class ContainerClosePacket extends FieldNetworkPacket {
    /** `Container Id`: the window being closed. */
    public containerId!: number;

    /** `Container Type`: which screen it was. */
    public containerType!: number;

    /** `Server Initiated Close`: true when the server, not the player, closed it. */
    public serverInitiatedClose!: boolean;

    /** Writes the three fields in docs order. */
    public encodePayload(): void {
        layoutAt(containerClosePacket, this.codecProtocol).encode(this, {
            containerId: this.containerId,
            containerType: this.containerType,
            serverInitiatedClose: this.serverInitiatedClose
        });
    }

    /** Reads the three fields in docs order. */
    public decodePayload(): void {
        const read = layoutAt(containerClosePacket, this.codecProtocol).decode(this);
        this.containerId = read.containerId;
        this.containerType = read.containerType;
        this.serverInitiatedClose = read.serverInitiatedClose;
    }
}
