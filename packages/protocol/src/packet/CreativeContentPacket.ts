import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { creativeContentPacket } from '../wire/definitions/creativeContent';
import { protocolVersion } from '../wire/versions/v2193';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { CreativeContentPayload } from '../wire/definitions/creativeContent';

/**
 * The docs' `CreativeItemCategory`: which tab of the creative menu a group belongs to.
 *
 * The game data names a group's tab in words, which {@link creativeCategoryOf} turns into one
 * of these.
 */
export enum CreativeItemCategory {
    ALL,
    CONSTRUCTION,
    NATURE,
    EQUIPMENT,
    ITEMS,
    ITEM_COMMAND_ONLY,
    UNDEFINED
}

/**
 * The tabs by the name the game data uses for them, derived from the enum rather than listed
 * again beside it.
 */
const categoriesByName = new Map(
    Object.entries(CreativeItemCategory)
        .filter((member): member is [string, CreativeItemCategory] => typeof member[1] === 'number')
        .map(([name, value]) => [name.toLowerCase(), value])
);

/**
 * The tab a group sits in, from the name the game data gives it.
 *
 * `construction`, `nature`, `equipment` and `items` are the four vanilla uses. A name this does
 * not know falls back to the catch-all tab, because a menu drawn under the wrong heading is
 * still a menu and a group index pointing at nothing is not.
 * @param name - The tab name as the creative data writes it.
 * @returns The matching tab, or `ITEMS`.
 */
export const creativeCategoryOf = (name: string): CreativeItemCategory =>
    categoriesByName.get(name.toLowerCase()) ?? CreativeItemCategory.ITEMS;

/** A heading in the creative menu, with the item shown beside it. */
export type CreativeGroup = CreativeContentPayload['groups'][number];

/** One entry of the creative menu, and which heading it sits under. */
export type CreativeEntry = CreativeContentPayload['entries'][number];

/** The two lists the creative menu is made of. */
export type CreativeContent = CreativeContentPayload;

/**
 * Writes the two lists without a packet header, for a caller that writes its own.
 *
 * The bytes are the packet's payload alone, so the format lives in the packet's definition
 * once and nothing reimplements it.
 */
export const writeCreativeContent = (stream: NetworkBinaryStream, data: CreativeContent): void => {
    layoutAt(creativeContentPacket, protocolVersion).encode(stream, data);
};

/** Reads the two lists, the mirror of {@link writeCreativeContent}. */
export const readCreativeContent = (stream: NetworkBinaryStream): CreativeContent =>
    layoutAt(creativeContentPacket, protocolVersion).decode(stream);

/**
 * The contents of the creative menu.
 *
 * Two lists, in the order the client renders them. Groups come first: each
 * `CreativeGroupInfoPayload` is a Creative Category byte, a Name string and a Group Icon Item
 * written as an `ItemStack`. Entries follow: each `CreativeItemEntryPayload` is a one-based
 * Creative Net Id varuint32, the Item Instance as an `ItemStack`, and a Group Index varuint32
 * into the groups list.
 *
 * Every entry has to point at a group that exists. A group with an empty Name is anonymous:
 * the client draws its members loose, without a heading.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/creative-content-packet/
 */
export default class CreativeContentPacket extends NetworkPacket<CreativeContent> {
    public get id(): number {
        return PacketIdentifier.CREATIVE_CONTENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CreativeContent): void {
        layoutAt(creativeContentPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CreativeContent {
        return layoutAt(creativeContentPacket, this.codecProtocol).decode(stream);
    }
}
