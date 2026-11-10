/**
 * `SetLastHurtByPacket`: Tells the client which kind of actor hit the player last.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-last-hurt-by-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `SetLastHurtByPacket` field list. */
export const setLastHurtByPacket = definePacket('SetLastHurtByPacket', {
    /** The `ActorType` of the last attacker. */
    lastHurtBy: t.varint32
});

/** Tells the client which kind of actor hit the player last. */
export type SetLastHurtByPayload = PayloadOf<typeof setLastHurtByPacket>;
