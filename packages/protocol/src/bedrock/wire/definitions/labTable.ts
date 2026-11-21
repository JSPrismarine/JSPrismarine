/**
 * `LabTablePacket`: a client action or server reaction for the Education Edition chemistry lab
 * table.
 *
 * Protocol 2193 and 2225 layout (identical): `Type` (uint8), `Position` (three ZigZag varint32 coordinates), and
 * `Reaction` (uint8). The client sends `StartCombine`; the server can answer with
 * `StartReaction` and a reaction effect.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/lab-table-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { blockPosStructure } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** What the Education Edition chemistry lab table was asked to do. */
export enum LabTableType {
    StartCombine = 0,
    StartReaction = 1,
    Reset = 2
}

/** The reaction effect produced by an Education Edition chemistry lab table. */
export enum LabTableReactionType {
    None = 0,
    IceBomb = 1,
    Bleach = 2,
    ElephantToothpaste = 3,
    Fertilizer = 4,
    HeatBlock = 5,
    MagnesiumSalts = 6,
    MiscFire = 7,
    MiscExplosion = 8,
    MiscLava = 9,
    MiscMystical = 10,
    MiscSmoke = 11,
    MiscLargeSmoke = 12
}

/** The `LabTablePacket` field list; the module doc carries the wire provenance. */
export const labTablePacket = definePacket('LabTablePacket', {
    /** `Type`: whether the client started a combination, started a reaction, or reset the table. */
    type: t.enumOf<LabTableType>(t.uint8),
    /** `Position`: the lab table as a signed `BlockPos`. */
    position: blockPosStructure,
    /** `Reaction`: the effect to play for `StartReaction`; otherwise `None`. */
    reaction: t.enumOf<LabTableReactionType>(t.uint8)
});

/** The action, position, and optional reaction carried by a chemistry lab table exchange. */
export type LabTablePayload = PayloadOf<typeof labTablePacket>;
