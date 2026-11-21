/**
 * `EmoteListPacket`: the emotes a client has equipped, sent so other clients can download them.
 *
 * The payload is the runtime id of the player, then the emote piece ids as a varuint32 count
 * followed by one `mce::UUID` per emote.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/emote-list-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { uuid } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `EmoteListPacket` field list. */
export const emoteListPacket = definePacket('EmoteListPacket', {
    /** `Runtime id`: the player whose equipped emotes these are, a plain LEB128 varuint64. */
    runtimeId: t.varuint64,
    /** `Emote piece ids`: a varuint32 count, then one `mce::UUID` per equipped emote. */
    emoteIds: t.list(uuid)
});

/** Payload carried by `EmoteListPacket`. */
export type EmoteListPayload = PayloadOf<typeof emoteListPacket>;
