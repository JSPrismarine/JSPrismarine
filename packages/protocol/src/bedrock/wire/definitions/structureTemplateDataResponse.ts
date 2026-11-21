/**
 * `StructureTemplateDataResponsePacket`: returns a structure template or reports that none was found.
 *
 * The protocol reference leaves `Structure's NBT` as an unknown field. The observed 2193
 * layout uses a success boolean followed by the network NBT compound when present, then
 * `Response Type` (uint8). The response type follows the compound directly, which occupies
 * only its own NBT bytes.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/structure-template-data-response-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { networkNbtCompound } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** Which structure operation the response answers. */
export enum StructureTemplateResponseType {
    None = 0,
    Export = 1,
    Query = 2
}

/** The fields sent when the server answers a structure template request. */
export const structureTemplateDataResponsePacket = definePacket('StructureTemplateDataResponsePacket', {
    /** `Structure Name`: the structure name from the request. */
    structureName: t.string,
    /** `Structure's NBT`: a success bool, then the network NBT compound; `null` when no template was found. */
    structureTemplate: t.optional(networkNbtCompound),
    /** `Response Type`: the kind of request this response answers, as one byte. */
    responseType: t.enumOf<StructureTemplateResponseType>(t.uint8)
});

/** The decoded fields of a structure template data response. */
export type StructureTemplateDataResponsePayload = PayloadOf<typeof structureTemplateDataResponsePacket>;
