import { layoutAt, setActorLinkPacket } from '@jsprismarine/protocol';
import { ActorLinkType } from '@jsprismarine/protocol/wire/definitions/addActor';

import type { ActorLink } from '@jsprismarine/protocol/wire/definitions/addActor';

import DataPacket from './DataPacket';

/**
 * Starts or ends one riding relationship between two actors.
 *
 * **Bound To:** Client and Server
 *
 * Both sides send it and the client's legacy handler is the only thing that reads it. A
 * client sends two at a time when a player mounts something. A link sent this way is only
 * known to the clients that receive it: a player who sees the pair later needs the link in
 * the `AddActorPacket` or `AddPlayerPacket` that spawns them.
 *
 * Protocol 2193 layout (docs id 41), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Link | ActorLink | See {@link ActorLink} |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-actor-link-packet/
 */
export default class SetActorLinkPacket extends DataPacket {
    /** Link, the riding relationship to set or clear. */
    public link: ActorLink = {
        targetA: 0n,
        targetB: 0n,
        type: ActorLinkType.None,
        immediate: false,
        passengerInitiated: false,
        vehicleAngularVelocity: 0
    };

    /** Reads the six `ActorLink` fields. */
    public decodePayload(): void {
        this.link = layoutAt(setActorLinkPacket, this.codecProtocol).decode(this).link;
    }

    /** Writes the six `ActorLink` fields. */
    public encodePayload(): void {
        layoutAt(setActorLinkPacket, this.codecProtocol).encode(this, { link: this.link });
    }
}
