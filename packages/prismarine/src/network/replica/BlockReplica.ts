/**
 * What replication keeps of a world's blocks, folded from the change log
 * ([ADR 0016](../../../../../docs/adr/0016-replication-reads-the-change-log.md)).
 *
 * A block change needs no copy: a `block` entry carries the runtime id the block now has. A block
 * entity does. The log records it field by field (`blockentity/blockEntityLog.ts`), so a stack
 * moved into a chest is one `items.<slot>` entry, and a client is sent the whole compound. The
 * replica holds the logged fields of every block entity in the chunks the world has loaded, and
 * folds the compound from them for each position a tick changed.
 *
 * A chunk's block entities reach the replica when the chunk enters the world, from the content the
 * chunk arrived with, because a chunk entry names a chunk and does not carry it
 * ([ADR 0012](../../../../../docs/adr/0012-the-change-log-is-the-history.md)). Every later change
 * comes from the log. The replica holds plain data only: network NBT bytes by field.
 */
import type { NBTTagCompound } from '@jsprismarine/nbt';

import { BlockEntityRegistry } from '../../blockentity/BlockEntityRegistry';
import type { BlockEntityValue } from '../../blockentity/blockEntityLog';
import {
    BLOCK_ENTITY_DATA,
    blockEntityChanges,
    blockEntityValueOf,
    withBlockEntityField
} from '../../blockentity/blockEntityLog';
import type { SealedTick } from '../../world/changelog/ChangeLog';
import type { BlockPositionKey, CoordinatePairKey } from '../../world/positionKeys';
import { blockPositionKey, blockPositionKeys, coordinatePairKey } from '../../world/positionKeys';

/** A block position. */
export type BlockAt = { readonly x: number; readonly y: number; readonly z: number };

/** A block clients are told about, with the runtime id it now has. */
export type ShownBlock = BlockAt & { readonly block: number };

/** What one sealed tick changed in the blocks clients see. */
export type BlockTickChanges = {
    /**
     * The last runtime id of every block the tick wrote or showed, by position, in the order each
     * position was first written. Only the block layer: the world writes no other.
     */
    readonly blocks: ReadonlyMap<BlockPositionKey, ShownBlock>;
    /**
     * The block entities whose fields the tick changed, by position, in the order each was first
     * changed. One whose block entity is gone is still listed; {@link BlockReplica.compound}
     * answers null for it.
     */
    readonly blockEntities: ReadonlyMap<BlockPositionKey, BlockAt>;
};

/** What the replica holds and what it has done, by count. */
export type BlockReplicaCounts = {
    /** The block entities it holds. */
    readonly blockEntities: number;
    /** The bytes of their fields. */
    readonly bytes: number;
    /** Block and block entity entries read from sealed ticks. */
    readonly entriesRead: number;
    /** Compounds folded from fields. */
    readonly folded: number;
};

type Fields = Map<string, Uint8Array>;
type ChunkReplica = Map<CoordinatePairKey, { readonly at: BlockAt; readonly fields: Fields }>;

/** The block entities of one world as replication last read them, by chunk. */
export class BlockReplica {
    private readonly chunks = new Map<CoordinatePairKey, ChunkReplica>();
    private entriesRead = 0;
    private folded = 0;

    /**
     * Takes the block entities of a chunk that entered the world, replacing whatever the replica
     * held for it.
     * @param x - The chunk's x, in chunks.
     * @param z - The chunk's z, in chunks.
     * @param blockEntities - The chunk's block entities as the chunk serializes them.
     */
    public chunkEntered(x: number, z: number, blockEntities: Iterable<NBTTagCompound>): void {
        const chunk: ChunkReplica = new Map();
        for (const tags of blockEntities) {
            const at = { x: tags.getNumber('x', 0), y: tags.getNumber('y', 0), z: tags.getNumber('z', 0) };
            const fields: Fields = new Map();
            for (const { field, after } of blockEntityChanges(null, tags)) if (after !== null) fields.set(field, after);
            chunk.set(blockPositionKeys(at.x, at.y, at.z).position, { at, fields });
        }
        this.chunks.set(coordinatePairKey(x, z), chunk);
    }

    /**
     * Forgets a chunk that left the world.
     * @param x - The chunk's x, in chunks.
     * @param z - The chunk's z, in chunks.
     */
    public chunkLeft(x: number, z: number): void {
        this.chunks.delete(coordinatePairKey(x, z));
    }

    /**
     * Reads the block entries of one sealed tick: notes each block's last runtime id and writes each
     * block entity field into the replica. A block entity field in a chunk the replica does not
     * hold is passed over, since no client holds that chunk either.
     * @param sealed - The tick, read once.
     * @returns What changed, for the flush.
     */
    public read(sealed: SealedTick): BlockTickChanges {
        const blocks = new Map<BlockPositionKey, ShownBlock>();
        const blockEntities = new Map<BlockPositionKey, BlockAt>();
        for (const entry of sealed.entries) {
            if (entry.kind === 'occurrence') {
                if (entry.occurrence !== 'block-shown') continue;
                this.entriesRead++;
                const { x, y, z, block } = entry.data;
                blocks.set(blockPositionKey(x, y, z), { x, y, z, block });
                continue;
            }
            if (entry.kind !== 'field') continue;
            if (entry.field === 'block') {
                this.entriesRead++;
                const { x, y, z, layer } = entry.address;
                if (layer === 0) blocks.set(blockPositionKey(x, y, z), { x, y, z, block: entry.after });
                continue;
            }
            if (entry.field !== 'block-entity') continue;
            this.entriesRead++;
            const { x, y, z, field } = entry.address;
            if (this.write({ x, y, z }, field, blockEntityValueOf(entry.after)))
                blockEntities.set(blockPositionKey(x, y, z), { x, y, z });
        }
        return { blocks, blockEntities };
    }

    /**
     * The compound of the block entity at a position, folded from its fields, in the form the
     * block entity itself serializes to.
     * @param at - The position.
     * @returns The compound, or null when no block entity stands there.
     */
    public compound(at: BlockAt): NBTTagCompound | null {
        const keys = blockPositionKeys(at.x, at.y, at.z);
        const fields = this.chunks.get(keys.chunk)?.get(keys.position)?.fields;
        const data = fields?.get(BLOCK_ENTITY_DATA);
        if (fields === undefined || data === undefined) return null;

        this.folded++;
        let tags = withBlockEntityField(null, at, BLOCK_ENTITY_DATA, data);
        for (const [field, value] of fields)
            if (field !== BLOCK_ENTITY_DATA) tags = withBlockEntityField(tags, at, field, value);
        // Through the block entity, so the tags come out in the order its own `toNBT` writes them,
        // which is the order the chunk sends and the order clients were sent before.
        return tags === null ? null : BlockEntityRegistry.fromNBT(tags).toNBT();
    }

    /** What the replica holds and what it has done. */
    public counts(): BlockReplicaCounts {
        let blockEntities = 0;
        let bytes = 0;
        for (const chunk of this.chunks.values())
            for (const { fields } of chunk.values()) {
                blockEntities++;
                for (const value of fields.values()) bytes += value.length;
            }
        return { blockEntities, bytes, entriesRead: this.entriesRead, folded: this.folded };
    }

    /** @returns Whether the chunk is held, so the field was written. */
    private write(at: BlockAt, field: string, value: BlockEntityValue): boolean {
        const keys = blockPositionKeys(at.x, at.y, at.z);
        const chunk = this.chunks.get(keys.chunk);
        if (chunk === undefined) return false;

        let held = chunk.get(keys.position);
        if (held === undefined) {
            if (value === null) return true;
            held = { at, fields: new Map() };
            chunk.set(keys.position, held);
        }
        if (value !== null) held.fields.set(field, value);
        else if (field === BLOCK_ENTITY_DATA) chunk.delete(keys.position);
        else held.fields.delete(field);
        return true;
    }
}
