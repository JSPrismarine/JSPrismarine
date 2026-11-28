/**
 * The pack actor golden: the entries the pinned Bedrock Dedicated Server writes into
 * `AvailableActorIdentifiersPacket` for the entities of `scenarios/pack-blocks/`.
 *
 * The client creates no actor whose type that list leaves out. The golden drops each entry's
 * `rid`: the server numbers the types without a legacy id in its hash map's order, so the number
 * says nothing about the type.
 *
 * This module imports nothing beyond node and relative paths, so the capture script runs it
 * under plain node.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isRecord } from './isRecord.ts';
import { PACK_BLOCK_NAMESPACE } from './packBlocks.ts';

/** Where the capture writes the server's entries. */
export const PACK_ACTORS_GOLDEN = join(import.meta.dirname, '..', 'goldens', 'pack-actors.json');

/** The checked-in golden. */
export interface PackActorsGolden {
    readonly $comment: readonly string[];
    readonly server: { readonly protocolVersion: number; readonly serverVersion: string };
    /** Each fixture type's entry without its `rid`, by identifier, as `nbtToPlain` reads it. */
    readonly actors: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * The fixture types' entries of an actor list, without their `rid`.
 * @param list - The list's compound, as `nbtToPlain` reads it.
 */
export const packActorEntriesOf = (list: unknown): Record<string, Record<string, unknown>> => {
    const idlist = isRecord(list) && Array.isArray(list.idlist) ? list.idlist : [];
    const entries: Record<string, Record<string, unknown>> = {};
    for (const entry of idlist) {
        if (!isRecord(entry) || typeof entry.id !== 'string') continue;
        const identifier = entry.id.replace(/^string:/, '');
        if (!identifier.startsWith(`${PACK_BLOCK_NAMESPACE}:`)) continue;
        const { rid: _rid, ...rest } = entry;
        entries[identifier] = rest;
    }
    return entries;
};

/** Reads the checked-in golden. */
export const readPackActorsGolden = (): PackActorsGolden => {
    const golden: unknown = JSON.parse(readFileSync(PACK_ACTORS_GOLDEN, 'utf8'));
    if (!isRecord(golden) || !isRecord(golden.actors) || !isRecord(golden.server)) {
        throw new Error(`${PACK_ACTORS_GOLDEN} is not a pack actor golden.`);
    }
    const { protocolVersion, serverVersion } = golden.server;
    if (typeof protocolVersion !== 'number' || typeof serverVersion !== 'string') {
        throw new Error(`${PACK_ACTORS_GOLDEN} names no server.`);
    }
    const actors: Record<string, Record<string, unknown>> = {};
    for (const [identifier, entry] of Object.entries(golden.actors)) if (isRecord(entry)) actors[identifier] = entry;
    const comment = Array.isArray(golden.$comment) ? golden.$comment.map(String) : [];
    return { $comment: comment, server: { protocolVersion, serverVersion }, actors };
};

/** The golden as the capture writes it: types in name order, four-space JSON. */
export const renderPackActorsGolden = (golden: PackActorsGolden): string =>
    `${JSON.stringify(
        {
            ...golden,
            actors: Object.fromEntries(Object.entries(golden.actors).sort(([a], [b]) => (a < b ? -1 : 1)))
        },
        null,
        4
    )}\n`;
