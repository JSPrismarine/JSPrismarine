/**
 * `EduUriResourcePacket`: the link an Education Edition server shares with every connected client.
 *
 * Docs packet 170, server to client. The payload is one `EduSharedUriResource`: `Button Name`,
 * then `Link Uri`, both strings (a varuint32 byte length followed by UTF-8).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/edu-uri-resource-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The fields sent when the shared Education Edition link changes for players already in the world. */
export const eduUriResourcePacket = definePacket('EduUriResourcePacket', {
    /** `Edu Shared URI Resource`: the link and button label every client should show. */
    eduSharedUriResource: t.record({
        /** `Button Name`: the label of the button the client shows. */
        buttonName: t.string,
        /** `Link Uri`: the address the button opens. */
        linkUri: t.string
    })
});

/** The payload of an `EduUriResourcePacket`. */
export type EduUriResourcePayload = PayloadOf<typeof eduUriResourcePacket>;
