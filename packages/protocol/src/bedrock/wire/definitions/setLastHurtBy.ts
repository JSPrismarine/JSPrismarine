/**
 * `SetLastHurtByPacket`: Tells the client which kind of actor hit the player last.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/set-last-hurt-by-packet/}
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `SetLastHurtByPacket` field list. */
export const setLastHurtByPacket = definePacket('SetLastHurtByPacket', {
    /** The `ActorType` of the last attacker. */
    lastHurtBy: t.varint32
});

/** Tells the client which kind of actor hit the player last. */
export type SetLastHurtByPayload = PayloadOf<typeof setLastHurtByPacket>;
