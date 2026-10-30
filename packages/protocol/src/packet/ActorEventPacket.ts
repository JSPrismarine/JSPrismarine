import { ActorEvent } from '@jsprismarine/minecraft';
import { actorEventPacket } from '../wire/definitions/actors';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

import type { Vector3 } from '@jsprismarine/math';

/**
 * One-off things that happen to an entity and that the client animates itself: the red
 * flash of being hurt, the death spin, an arm swing.
 *
 * Health arriving as a smaller number is not enough on its own. The client moves the hearts
 * and says nothing about it; the flash and the sound come from here.
 *
 * Protocol 2193 layout (docs id 27), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Target Runtime ID | varuint64 | |
 * | Event ID | uint8 | An {@link ActorEvent} |
 * | Data | varint32 | ZigZag encoded; meaning depends on the event |
 * | Fire At Position | optional Vec3 | A presence byte, then three little-endian floats when it is 0x01 |
 *
 * **Bound To:** Client and Server. A client sends `FEED` about its own player when it starts eating.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/actor-event-packet/
 */
export default class ActorEventPacket extends FieldNetworkPacket {
    public runtimeEntityId!: bigint;
    public event!: ActorEvent;

    /** `Data`. Meaning depends on the event; zero for the ones that carry nothing. */
    public data: number = 0;

    /**
     * `Fire At Position`: where the event happens, when that is somewhere other than the
     * entity. Null leaves the optional absent, and the entity's own position is used.
     */
    public fireAtPosition: Vector3 | null = null;

    /** Writes the event fields and the optional position presence byte. */
    public encodePayload(): void {
        // The presence byte of `Fire At Position` goes out whether or not a position follows.
        // Leaving it out ends the packet a byte early, and a client that reads past the end of
        // a packet treats it as malformed and drops the connection with `initialconnection-90`.
        // One of these goes out the moment anything takes damage.
        layoutAt(actorEventPacket, this.codecProtocol).encode(this, {
            runtimeEntityId: this.runtimeEntityId,
            event: this.event,
            data: this.data,
            fireAtPosition: this.fireAtPosition
        });
    }

    /** Reads the event fields and preserves whether `Fire At Position` was present. */
    public decodePayload(): void {
        const read = layoutAt(actorEventPacket, this.codecProtocol).decode(this);
        this.runtimeEntityId = read.runtimeEntityId;
        this.event = read.event;
        this.data = read.data;
        this.fireAtPosition = read.fireAtPosition;
    }
}

/**
 * The events this packet can carry, generated from Mojang's 1.26.51 release documentation in
 * `@jsprismarine/minecraft`. The values have gaps (`FEED` is 57, `UPDATE_STACK_SIZE` is 69)
 * because they are the game's own enum values; the rendered docs site numbers the members
 * 0 to 60 consecutively, which is a display artifact of metadata that carries no values.
 * @deprecated Import `ActorEvent` from `@jsprismarine/minecraft` instead.
 */
export { ActorEvent };
