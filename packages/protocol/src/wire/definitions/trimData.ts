/**
 * `TrimDataPacket` described as a declarative field list; layout unchanged between protocols
 * 2193 and 2225. The docs type the ids and item names as `hashed_string`, which the wire
 * carries as a plain string; the client hashes it on receipt.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/trim-data-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { TrimMaterial, TrimPattern } from '../../packet/TrimDataPacket';

/** One `TrimPattern` entry: `Item Name`, then `Pattern Id`. */
const trimPattern = t.custom<TrimPattern>(
    'TrimPattern',
    (s, v) => {
        t.string.write(s, v.itemName);
        t.string.write(s, v.patternId);
    },
    (s) => ({ itemName: t.string.read(s), patternId: t.string.read(s) })
);

/** One `TrimMaterial` entry: `Material Id`, `Color`, then `Item Name`. */
const trimMaterial = t.custom<TrimMaterial>(
    'TrimMaterial',
    (s, v) => {
        t.string.write(s, v.materialId);
        t.string.write(s, v.color);
        t.string.write(s, v.itemName);
    },
    (s) => ({ materialId: t.string.read(s), color: t.string.read(s), itemName: t.string.read(s) })
);

/**
 * The `TrimDataPacket` field list: every armor trim pattern and material the client may show,
 * sent once during the join.
 */
export const trimDataPacket = definePacket('TrimDataPacket', {
    /** `TrimPattern List`, every armor trim pattern the client may show. */
    patterns: t.list(trimPattern),
    /** `TrimMaterial List`, every armor trim material the client may show. */
    materials: t.list(trimMaterial)
});
