/**
 * `DeathInfoPacket`: tells a client why its player died so the death screen can show the cause.
 *
 * Both fields belong to the packet's single `Death Cause Message` field, a
 * `DeathCauseMessageType`. Strings are a varuint32 byte length followed by UTF-8.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The fields sent when a player dies, in wire order. */
export const deathInfoPacket = definePacket('DeathInfoPacket', {
    /** `Death Cause Attack Name`: the untranslated death message key, for example "death.attack.lava". */
    cause: t.string,
    /** `Death Cause Message List`: the parameters the client substitutes into the translated message. */
    messages: t.list(t.string)
});

/** Payload carried by `DeathInfoPacket`. */
export type DeathInfoPayload = PayloadOf<typeof deathInfoPacket>;
