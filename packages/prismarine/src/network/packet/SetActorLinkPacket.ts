import type { ActorLink } from './AddActorPacket';
import { ActorLinkType } from './AddActorPacket';
import DataPacket from './DataPacket';

/**
 * The {@link ActorLinkType} values a link may carry, as a narrowed union.
 */
type ActorLinkTypeValue = (typeof ActorLinkType)[keyof typeof ActorLinkType];

/**
 * Narrows a byte read off the wire to a known {@link ActorLinkType}.
 * @param value - The Type byte.
 * @returns The matching link type.
 * @throws When the byte is not a link type the protocol defines.
 */
const toActorLinkType = (value: number): ActorLinkTypeValue => {
    const known = Object.values(ActorLinkType).find((type) => type === value);
    if (known === undefined) throw new Error(`Unknown ActorLinkType ${value}`);
    return known;
};

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
        this.link = {
            targetA: this.readVarLong(),
            targetB: this.readVarLong(),
            type: toActorLinkType(this.readByte()),
            immediate: this.readBoolean(),
            passengerInitiated: this.readBoolean(),
            vehicleAngularVelocity: this.readFloatLE()
        };
    }

    /** Writes the six `ActorLink` fields. */
    public encodePayload(): void {
        const { link } = this;
        this.writeVarLong(link.targetA);
        this.writeVarLong(link.targetB);
        this.writeByte(link.type);
        this.writeBoolean(link.immediate);
        this.writeBoolean(link.passengerInitiated);
        this.writeFloatLE(link.vehicleAngularVelocity);
    }
}
