/**
 * The item registry data one protocol version puts on the wire.
 *
 * A protocol version fixes two things, not one: the *layout* each packet is written in, which
 * {@link ProtocolCodec} already carries, and the *numbering* the item registry hands the
 * client. `@jsprismarine/bedrock-data` publishes one captured table per version, and the
 * numbering is not stable between them - 1.26.60 moved 82 of the 2080 runtime ids and added
 * four names. Sending one version's table to a session of another is not a refused join,
 * because the registry is server-authoritative and the client adopts whatever it is sent; what
 * it does is put the wrong number on the moved items and name items the client may not have.
 *
 * This module is the data half of a codec's version. It is deliberately free of any import
 * from the codec or packet modules so that a packet can resolve its own version's table
 * without the barrel cycle those modules already work around.
 *
 * Only the item table is versioned here. Item components stay keyed by name off the default
 * capture: the 2193 and 2225 captures carry byte-identical compounds for every name they share,
 * and a name's compound is the client's recipe for building the item, which does not depend on
 * the number the item travels as.
 */
import { item_components } from '@jsprismarine/bedrock-data';
import { item_table as item_table_2193 } from '@jsprismarine/bedrock-data/v2193';
import { item_table as item_table_2225 } from '@jsprismarine/bedrock-data/v2225';
import { item_table as item_table_2259 } from '@jsprismarine/bedrock-data/v2259';

import { newestRelease } from '@jsprismarine/protocol/ProtocolVersion';
import { protocolVersion as protocol2193 } from '@jsprismarine/protocol/wire/versions/v2193';
import { protocolVersion as protocol2225 } from '@jsprismarine/protocol/wire/versions/v2225';
import { protocolVersion as protocol2259 } from '@jsprismarine/protocol/wire/versions/v2259';

import type { ItemTypeEntry } from '@jsprismarine/bedrock-data';
import type { ProtocolItemData } from '@jsprismarine/protocol';

/** A {@link ProtocolItemData} over one captured table, with the reverse index built on demand. */
const itemDataOver = (protocolVersion: number, table: Readonly<Record<string, ItemTypeEntry>>): ProtocolItemData => {
    let namesByRuntimeId: ReadonlyMap<number, string> | undefined;

    return {
        protocolVersion,
        table,
        components: item_components,
        nameOf: (runtimeId) => {
            namesByRuntimeId ??= new Map(Object.entries(table).map(([name, entry]) => [entry.runtime_id, name]));
            return namesByRuntimeId.get(runtimeId);
        }
    };
};

/** Protocol 2193's item data, captured from a Bedrock Dedicated Server 1.26.51.1. */
export const itemData2193: ProtocolItemData = itemDataOver(protocol2193, item_table_2193);

/** Protocol 2225's item data, captured from a Bedrock Dedicated Server 1.26.60.6. */
export const itemData2225: ProtocolItemData = itemDataOver(protocol2225, item_table_2225);

/** The Minecraft Preview protocol 2259's item data, captured from a Bedrock Dedicated Server 1.26.70.24. */
export const itemData2259: ProtocolItemData = itemDataOver(protocol2259, item_table_2259);

const byProtocol = new Map<number, ProtocolItemData>([
    [itemData2193.protocolVersion, itemData2193],
    [itemData2225.protocolVersion, itemData2225],
    [itemData2259.protocolVersion, itemData2259]
]);

/**
 * The canonical item data: the newest release's.
 *
 * Server-side code that asks whether a name is an item Bedrock has at all, rather than what
 * number to write for it, reads this one at every protocol version, and so does a stack written
 * outside any session. It is the same table `@jsprismarine/bedrock-data` exports unversioned,
 * which `itemData.test.ts` holds to.
 */
export const canonicalItemData: ProtocolItemData = byProtocol.get(newestRelease.protocolVersion)!;

/**
 * The item data a session speaking `protocolVersion` must be sent.
 *
 * Falls back to {@link canonicalItemData} for a version no capture exists for.
 * @param {number} protocolVersion - the version the session negotiated.
 * @returns {ProtocolItemData} the item data for that version.
 */
export const itemDataForProtocol = (protocolVersion: number): ProtocolItemData =>
    byProtocol.get(protocolVersion) ?? canonicalItemData;
