/**
 * The one way a block entity is written into a chunk while players are watching.
 *
 * A chunk carries its block entities in its own payload, so a sign placed before the chunk
 * was sent arrives with its text. Everything written afterwards used to go no further than
 * the chunk: `setBlockData` filed the compound and stopped, and nothing told the clients
 * already holding that chunk. A sign's text, a chest's contents, a lectern's page and a
 * flower pot's plant were all server-only facts until the player walked far enough away to
 * unload the chunk and came back.
 *
 * Two rules make that safe to fix rather than a new source of traffic.
 *
 * **Nothing is reported that did not change.** Several families rewrite a block entity on a
 * schedule whether or not anything moved - a comparator restates its signal on every tick it
 * runs, a beacon recounts the same pyramid on every neighbor change. The compounds are
 * compared as the bytes they would be sent as, and an identical write is dropped before it
 * reaches the chunk. That also spares the chunk's serialization cache, which
 * {@link import('../world/chunk/Chunk').Chunk.setBlockEntity} drops on every call.
 *
 * **The report is deferred, not sent.** `World` hands it to {@link
 * import('../world/WorldChangeSink').WorldChangeSink}, which collects it by position and puts
 * it on the wire once, after the tick's block changes have gone out. The order is the point:
 * `BlockActorDataPacket` is dropped by a client with no block entity at that position, and an
 * `UpdateBlockPacket` arriving afterwards makes the client rebuild the block entity from its
 * own empty data. So a chest placed and filled in one tick has to be announced as a block
 * first and as a block entity second.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { ByteOrder, NBTWriter } from '@jsprismarine/nbt';
import type { NBTTagCompound } from '@jsprismarine/nbt';

import type { BlockEntity } from './BlockEntity';
import { BlockEntityRegistry } from './BlockEntityRegistry';

/** A chunk as a block entity write reads and writes one, which is the little of `Chunk` it uses. */
export interface BlockEntityChunk {
    getBlockEntity(x: number, y: number, z: number): { toNBT(): NBTTagCompound } | null;
    setBlockEntity(blockEntity: BlockEntity): void;
}

/** The little of a world a block entity write touches: the chunks, and somewhere to report to. */
export interface BlockEntityWorld {
    /** The chunk holding a column, or null when it is not in memory. */
    getLoadedChunk(x: number, z: number): BlockEntityChunk | null;

    /**
     * Reports that the block entity at a position is now these tags.
     *
     * Called only for a write that changed something, and only once the chunk holds it.
     * @param position - The block the block entity sits in.
     * @param tags - Its complete data, as the chunk would serialize it.
     */
    blockEntityChanged(position: Vector3, tags: NBTTagCompound): void;
}

/**
 * The bytes a compound travels as: network NBT, little endian with varint lengths.
 *
 * The comparison is done on these rather than on the compounds because this is the form that
 * decides whether a client would see any difference. Two compounds that encode the same way
 * are the same block entity however they were built.
 */
const networkTags = (tags: NBTTagCompound): Buffer => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(true);
    writer.writeCompound(tags);

    return stream.getBuffer();
};

/**
 * Files a block entity at the position its own tags name, and reports it if it changed.
 *
 * The compound is rebuilt through {@link BlockEntityRegistry} before the comparison so that
 * both sides of it have been through the same round trip. A class lifts the fields it models
 * out of the compound and puts them back in `toNBT`, which can move a key, and comparing a
 * freshly built compound against a round-tripped one would call every write a change.
 *
 * @param world - Where the chunk is, and where the change is reported.
 * @param tags - The whole block entity, carrying its own `x`, `y` and `z`.
 * @returns `false` when the chunk is not in memory, or when the write changed nothing.
 */
export const writeBlockEntity = (world: BlockEntityWorld, tags: NBTTagCompound): boolean => {
    const [x, y, z] = [tags.getNumber('x', 0), tags.getNumber('y', 0), tags.getNumber('z', 0)];

    const chunk = world.getLoadedChunk(x >> 4, z >> 4);
    if (chunk === null || chunk === undefined) return false;

    const written = BlockEntityRegistry.fromNBT(tags);
    const settled = written.toNBT();

    const standing = chunk.getBlockEntity(x, y, z);
    if (standing !== null && standing !== undefined && networkTags(standing.toNBT()).equals(networkTags(settled))) {
        return false;
    }

    chunk.setBlockEntity(written);
    world.blockEntityChanged(new Vector3(x, y, z), settled);

    return true;
};
