/**
 * `ShowProfilePacket`: Opens the Xbox profile card of one player on the client.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/show-profile-packet/}
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `ShowProfilePacket` field list. */
export const showProfilePacket = definePacket('ShowProfilePacket', {
    /** The Xbox Live id of the player whose profile the client opens. */
    xuid: t.string
});

/** Opens the Xbox profile card of one player on the client. */
export type ShowProfilePayload = PayloadOf<typeof showProfilePacket>;
