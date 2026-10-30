import { availableActorIdentifiersPacket } from '../wire/definitions/availableActorIdentifiers';
import { layoutAt } from '../wire/WireLayout';
import FieldNetworkPacket from '../FieldNetworkPacket';

import type { ProtocolContext } from '../ProtocolContext';

/**
 * Every actor type the client may be asked to render, sent once at world start.
 *
 * Protocol 2193 carries a single field, `Identifier List`: one network NBT compound holding an
 * `idlist` of `ActorInfo` entries, each with `rid` (the runtime id, an int), `id` (the actor
 * identifier), `bid` (the base identifier), `hasspawnegg` and `summonable`. There is no length
 * prefix, so the compound runs to the end of the packet.
 *
 * The compound is supplied for the negotiated connection through `ProtocolContext.entityIdentifiers`,
 * or explicitly through {@link identifiers}. The protocol package writes those bytes unchanged.
 * A client that never receives the packet falls back to an empty table and cannot resolve the
 * runtime ids in `AddActorPacket`.
 *
 * The wire layout is the `availableActorIdentifiersPacket` definition in the protocol package.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/available-actor-identifiers-packet/
 */
export default class AvailableActorIdentifiersPacket extends FieldNetworkPacket {
    /** `Identifier List` as network NBT, or `null` to use the connection's captured bytes. */
    public identifiers: Buffer | null = null;

    /** Writes `Identifier List`, taking the bytes from the connection context when unset. */
    public encodePayload(context?: ProtocolContext): void {
        const identifiers = this.identifiers ?? context?.entityIdentifiers;
        if (identifiers === undefined) {
            throw new Error(
                'AvailableActorIdentifiersPacket requires entity identifier data in the packet or protocol context'
            );
        }

        layoutAt(availableActorIdentifiersPacket, this.codecProtocol).encode(this, { identifiers });
    }

    /** Reads `Identifier List`, which runs to the end of the packet. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(availableActorIdentifiersPacket, this.codecProtocol).decode(this));
    }
}
