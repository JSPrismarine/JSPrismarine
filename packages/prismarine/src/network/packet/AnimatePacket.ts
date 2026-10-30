import { AnimateAction, AnimateHand, animatePacket, layoutAt } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

export { AnimateAction };

/**
 * Triggers an animation on an actor, in either direction.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s declarative definition, which this class
 * walks at the protocol version stamped on it: the four documented 2193 fields, plus the
 * trailing `Hand` byte from 2225 on. One class serves every version; which fields travel is the
 * layout's decision, not this file's.
 */
export default class AnimatePacket extends FieldNetworkPacket {
    /** `Action`, as the raw byte. See {@link AnimateAction} for the numbers. */
    public action!: number;

    /** Target Actor Runtime ID. */
    public runtimeEntityId!: bigint;

    /** Data. Meaning depends on the action; zero for the ones that carry nothing. */
    public data = 0;

    /** Swing Source: what caused the swing, by name, or `null` when absent. */
    public swingSource: string | null = null;

    /** Hand: which hand is animating, from 2225 on; earlier versions leave it at the default. */
    public hand: number = AnimateHand.Mainhand;

    /** Writes the fields the stamped protocol version puts on the wire, in layout order. */
    public encodePayload(): void {
        layoutAt(animatePacket, this.codecProtocol).encode(this, this);
    }

    /** Reads them back in the same order, filling version-absent fields with their fallbacks. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(animatePacket, this.codecProtocol).decode(this));
    }
}
