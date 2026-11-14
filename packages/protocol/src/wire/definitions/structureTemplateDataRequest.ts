/**
 * `StructureTemplateDataRequestPacket`: asks for the data of a structure named in the structure
 * block screen.
 *
 * Protocols 2193 and 2225 share this layout: `Structure Name` (string), `Structure Position`
 * (`BlockPos`), `Structure Settings`, then `Requested Operation` (uint8). Mojang documents this
 * feature as disabled server-side.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/structure-template-data-request-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { blockPosStructure } from '../structureTypes';

import { structureSettings } from './structureBlockUpdate';

import type { PayloadOf } from '../define';

/** What the client asked the structure block server to do. */
export enum StructureTemplateRequestOperation {
    None = 0,
    ExportFromSaveMode = 1,
    ExportFromLoadMode = 2,
    QuerySavedStructure = 3
}

/** The `StructureTemplateDataRequestPacket` field list; the module doc carries the wire provenance. */
export const structureTemplateDataRequestPacket = definePacket('StructureTemplateDataRequestPacket', {
    /** `Structure Name`: structure name entered in the structure block. */
    structureName: t.string,
    /** `Structure Position`: position of the structure block. */
    structurePosition: blockPosStructure,
    /**
     * `Structure Settings`: bounds and placement settings supplied by the client. The 1.26.50 page
     * numbers the `Rotation` aliases `Clockwise90`, `Clockwise180` and `CounterClockwise90` as 4, 5 and
     * 6, and the 1.26.60 page as 1, 2 and 3; the layout keeps 1, 2 and 3 at both protocols, as the
     * 1.26.40 `enums.html` dump does (`StructureTemplateDataRequestPacket.test.ts` asserts it).
     */
    structureSettings,
    /** `Requested Operation`: requested structure operation, one byte. */
    requestedOperation: t.enumOf<StructureTemplateRequestOperation>(t.uint8)
});

/** Payload carried by `StructureTemplateDataRequestPacket`. */
export type StructureTemplateDataRequestPayload = PayloadOf<typeof structureTemplateDataRequestPacket>;
