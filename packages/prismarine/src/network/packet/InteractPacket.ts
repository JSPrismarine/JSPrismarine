import { interactPacket, layoutAt } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

import type { Vector3 } from '@jsprismarine/math';

/**
 * The docs' `InteractPacket::Action`: what the client did to the target actor, written as a
 * uint8.
 *
 * The 1.26.50 docs page numbers the members 1 to 4, but clients send 3 to 6, which is what
 * the page's own 2207 changelog and gophertunnel record.
 */
export enum InteractAction {
    Invalid = 0,
    StopRiding = 3,
    InteractUpdate = 4,
    NpcOpen = 5,
    OpenInventory = 6
}

/**
 * Sent by the client when it interacts with an actor, or presses the inventory button.
 *
 * Protocol 2193 layout: Action as a uint8, Target Runtime ID as a varuint64, then Position as
 * an optional Vec3: a presence byte, followed by three little-endian floats when it is 0x01.
 */
export default class InteractPacket extends DataPacket {
    public action!: number;
    public target!: bigint;

    /** The Position field. Null when the client sent the optional as absent. */
    public position: Vector3 | null = null;

    public encodePayload(): void {
        layoutAt(interactPacket, this.codecProtocol).encode(this, {
            action: this.action,
            target: this.target,
            position: this.position
        });
    }

    public decodePayload(): void {
        const read = layoutAt(interactPacket, this.codecProtocol).decode(this);
        this.action = read.action;
        this.target = read.target;
        this.position = read.position;
    }
}
