import DataPacket from './DataPacket';

/**
 * The client saying its local player is built and it is ready to play.
 *
 * Protocol 2193 wire layout, with the docs' field name: `Player ID` as an `ActorRuntimeID`,
 * which is one varuint64. Nothing else follows it.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-local-player-as-initialized-packet/
 */
export default class SetLocalPlayerAsInitializedPacket extends DataPacket {
    /** `Player ID`: the runtime id the server gave the player in `StartGame`. */
    public runtimeEntityId = 0n;

    /** Reads the runtime id. */
    public decodePayload(): void {
        this.runtimeEntityId = this.readUnsignedVarLong();
    }

    /** Writes the runtime id, for tests and for a client built on this package. */
    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
    }
}
