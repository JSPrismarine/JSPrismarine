/**
 * `ServerPresenceInfoPacket`: tells the client which rich presence to show while connected.
 *
 * One field, `presence_configuration`, an optional `PresenceConfig`: a presence byte, then the
 * configuration only when set. The configuration is `richPresenceId` as an optional string, a
 * second presence byte, then the string only when set. The 1.26.50 page prints the field as
 * plain and the 1.26.60 page as optional, with a changelog row saying it "is now optional";
 * Mojang's note for that build calls such rows a documentation fix, not a wire change
 * (`docs/research/protocol-2225-delta.md`), so both versions carry the presence byte, the same
 * nesting `StartGamePacket`'s `Server Configuration Join Info` uses for its `presence`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/server-presence-info-packet/
 */
import PresenceConfig from '../../structure/PresenceConfig';
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** `PresenceConfig`: an optional `richPresenceId`, as the structure class models it. */
const presenceConfig = t.custom<PresenceConfig>(
    'PresenceConfig',
    (stream, value) => t.present(t.string).write(stream, value.richPresenceId),
    (stream) => new PresenceConfig(t.present(t.string).read(stream))
);

/** The fields sent when a server changes the client's rich presence. */
export const serverPresenceInfoPacket = definePacket('ServerPresenceInfoPacket', {
    /** `presence_configuration`: the rich presence the client should show. Unset sends none. */
    presenceConfiguration: t.present(presenceConfig)
});

/** Payload carried by `ServerPresenceInfoPacket`. */
export type ServerPresenceInfoPayload = PayloadOf<typeof serverPresenceInfoPacket>;
