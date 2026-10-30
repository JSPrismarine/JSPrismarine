import { layoutAt, setLocalPlayerAsInitializedPacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/**
 * The client saying its local player is built and it is ready to play.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `setLocalPlayerAsInitializedPacket`
 * definition: `Player ID` as an `ActorRuntimeID`, which is one varuint64. Nothing follows it.
 *
 * **Bound To:** Server
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-local-player-as-initialized-packet/
 */
export default class SetLocalPlayerAsInitializedPacket extends DataPacket {
    /** `Player ID`: the runtime id the server gave the player in `StartGame`. */
    public runtimeEntityId = 0n;

    /** Reads the runtime id. */
    public decodePayload(): void {
        this.runtimeEntityId = layoutAt(setLocalPlayerAsInitializedPacket, this.codecProtocol).decode(
            this
        ).runtimeEntityId;
    }

    /** Writes the runtime id, for tests and for a client built on this package. */
    public encodePayload(): void {
        layoutAt(setLocalPlayerAsInitializedPacket, this.codecProtocol).encode(this, {
            runtimeEntityId: this.runtimeEntityId
        });
    }
}
