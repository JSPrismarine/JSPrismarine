import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * The client saying it has finished loading every resource pack.
 *
 * Part of the resource pack exchange: it arrives after `ResourcePackStack`, between the
 * `HaveAllPacks` and `Completed` answers in `ResourcePackClientResponsePacket`. The packet
 * arriving at all is the whole message, and nothing is sent back. Read so that a 1.26.51
 * client's join does not log `Packet 0x154 isn't implemented`.
 *
 * **Bound To:** Server
 *
 * Protocol 2193 layout (docs id 340): the header and no payload.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/resource-packs-ready-for-validation-packet/
 */
export default class ResourcePacksReadyForValidationPacket extends FieldNetworkPacket {
    /** Nothing to read. */
    public decodePayload(): void {
        // The payload is empty by design.
    }

    /** Nothing to write. */
    public encodePayload(): void {
        // The payload is empty by design.
    }
}
