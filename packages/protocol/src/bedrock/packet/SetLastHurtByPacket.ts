import { setLastHurtByPacket } from '../wire/definitions/setLastHurtBy';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/**
 * Tells the client which kind of actor hit the player last.
 *
 * Wire order at protocols 2193 and 2225, which share one layout: `LastHurtBy` as a ZigZag
 * varint32, and nothing else.
 *
 * The value is a member of Mojang's `ActorType`, an enum of around 160 members that this
 * repository does not generate, so the field is a plain number. Its values are not
 * consecutive: the 1.26.60 page and Mojang's enum dump
 * (`packages/minecraft/datagen/snapshot/0e00fe80f4f3-enums.html`) number `Undefined` as 1,
 * `Player` as 319 and `Creeper` as 2849. The 1.26.50 page counts the members from 0, which is a
 * display artifact, not the wire value (the 1.26.60 changelog "changes" every value to the
 * gapped one). 1.26.60 adds `Frostbite` (199579) and `IceBall` (4194460), which a plain number
 * carries without a layout change. No client behavior is known to depend on the packet.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/set-last-hurt-by-packet/
 */
export default class SetLastHurtByPacket extends FieldNetworkPacket {
    /** The `ActorType` of the last attacker. */
    public lastHurtBy = 0;

    /** Reads the actor type. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(setLastHurtByPacket, this.codecProtocol).decode(this));
    }

    /** Writes the actor type. */
    public encodePayload(): void {
        layoutAt(setLastHurtByPacket, this.codecProtocol).encode(this, this);
    }
}
