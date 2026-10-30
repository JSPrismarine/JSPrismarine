/**
 * The item registry data one protocol version puts on the wire.
 *
 * A protocol version fixes two things, not one: the *layout* each packet is written in, which
 * {@link ProtocolCodec} already carries, and the *numbering* the item registry hands the
 * client. `@jsprismarine/bedrock-data` publishes one captured table per version, and the
 * numbering is not stable between them - 1.26.60 moved 82 of the 2080 runtime ids and added
 * four names. Sending a 2193 table to a 2225 session is not a refused join, because the
 * registry is server-authoritative and the client adopts whatever it is sent; what it does is
 * leave those four items unnameable and put the wrong number on 82 of them.
 *
 * This module is the data half of a codec's version. It is deliberately free of any import
 * from the codec or packet modules so that a packet can resolve its own version's table
 * without the barrel cycle those modules already work around.
 *
 * Only the item table is versioned here. The 2225 capture's block definitions and biome
 * definitions came back byte-identical to 2193's, and no item components were captured at
 * 2225, so components stay keyed by name off the single 2193 capture - a name's compound is
 * the client's recipe for building the item, and it does not depend on the number the item
 * travels as.
 */
import { item_components, item_table } from '@jsprismarine/bedrock-data';
import { item_table as item_table_2225 } from '@jsprismarine/bedrock-data/v2225';

import { protocolVersion as protocol2193 } from './v2193';
import { protocolVersion as protocol2225 } from './v2225';

import type { ItemTypeEntry } from '@jsprismarine/bedrock-data';
import type { ProtocolItemData } from '@jsprismarine/protocol';

export type { ProtocolItemData } from '@jsprismarine/protocol';

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

/**
 * Protocol 2193's item data, captured from a Bedrock Dedicated Server 1.26.51.1.
 *
 * Also the canonical table: server-side code that asks whether a name is an item Bedrock has
 * at all, rather than what number to write for it, reads this one at every protocol version.
 */
export const itemData2193: ProtocolItemData = itemDataOver(protocol2193, item_table);

/** Protocol 2225's item data, captured from a Bedrock Dedicated Server 1.26.60.6. */
export const itemData2225: ProtocolItemData = itemDataOver(protocol2225, item_table_2225);

const byProtocol = new Map<number, ProtocolItemData>([
    [itemData2193.protocolVersion, itemData2193],
    [itemData2225.protocolVersion, itemData2225]
]);

/**
 * The item data a session speaking `protocolVersion` must be sent.
 *
 * Falls back to {@link itemData2193} for a version no capture exists for, which is what every
 * packet built outside a session - a test, or the handshake codec - gets. That is the same
 * table those paths read before any version was selectable, so nothing moves under them.
 * @param {number} protocolVersion - the version the session negotiated.
 * @returns {ProtocolItemData} the item data for that version.
 */
export const itemDataForProtocol = (protocolVersion: number): ProtocolItemData =>
    byProtocol.get(protocolVersion) ?? itemData2193;
