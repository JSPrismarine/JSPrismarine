/**
 * `RequestAbilityPacket`: The client asking to change one of its own abilities, such as toggling
 * flight.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/request-ability-packet/}
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `RequestAbilityPacket` field list. */
export const requestAbilityPacket = definePacket('RequestAbilityPacket', {
    /** The ability being changed, see `AbilityLayerFlag`. */
    ability: t.varint32,
    /** Which value slot holds the request. */
    valueType: t.uint8,
    /** The requested flag when {@link valueType} is `Bool`. */
    boolValue: t.bool,
    /** The requested number when {@link valueType} is `Float`. */
    floatValue: t.lf32
});

/** The client asking to change one of its own abilities, such as toggling flight. */
export type RequestAbilityPayload = PayloadOf<typeof requestAbilityPacket>;
