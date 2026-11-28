/**
 * A chunk's `PendingTicks` record (key tag 0x33): the scheduled ticks it was saved with.
 *
 * Bedrock writes one little endian NBT compound: `currentTick`, the world's tick when it saved,
 * and `tickList`, one compound per tick holding the block state it fires for (`{name, states,
 * version}`, the palette form), the absolute tick it is due on as `time`, and its world `x`, `y`
 * and `z`. Read from a world protocol 2193's pinned Bedrock Dedicated Server saved with lava still spreading.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';

import { paletteEntryCompound } from './PersistentPalette';

/** One saved tick. */
export interface SavedPendingTick {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** The block state name the tick fires for, such as `minecraft:flowing_water`. */
    readonly name: string;
    /** The absolute game tick it is due on, in the clock `currentTick` reads. */
    readonly time: bigint;
}

/** A decoded `PendingTicks` record. */
export interface SavedPendingTicks {
    readonly currentTick: number;
    readonly ticks: readonly SavedPendingTick[];
}

/** A tick to write, with the runtime id of the block it fires for. */
export interface PendingTickToSave {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly runtimeId: number;
    /** The absolute game tick it is due on. */
    readonly time: number;
}

/**
 * Encodes a chunk's pending ticks, or returns null when it has none, which a writer deletes the
 * record for rather than storing an empty list.
 *
 * @throws When a tick's block has no registered state, which would leave the record unreadable.
 */
export const encodePendingTicks = (currentTick: number, ticks: readonly PendingTickToSave[]): Buffer | null => {
    if (ticks.length === 0) return null;

    const tickList = new Set<NBTTagCompound>();
    for (const tick of ticks) {
        // A nested compound carries its key as its name, so the palette form is copied under one.
        const blockState = new NBTTagCompound('blockState');
        for (const [key, field] of paletteEntryCompound(tick.runtimeId).entries()) blockState.addValue(key, field);

        const entry = new NBTTagCompound('');
        entry.addValue('blockState', blockState);
        entry.addValue('time', new Types.LongVal(BigInt(tick.time)));
        entry.addValue('x', new Types.NumberVal(tick.x));
        entry.addValue('y', new Types.NumberVal(tick.y));
        entry.addValue('z', new Types.NumberVal(tick.z));
        tickList.add(entry);
    }

    const root = new NBTTagCompound('');
    root.addValue('currentTick', new Types.NumberVal(currentTick));
    root.addValue('tickList', tickList);

    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(false);
    writer.writeCompound(root);
    return stream.getBuffer();
};

/**
 * Decodes a `PendingTicks` record. An entry missing a field is skipped rather than failing the
 * chunk, as a malformed block entity is.
 */
export const decodePendingTicks = (value: Buffer): SavedPendingTicks => {
    const reader = new NBTReader(new BinaryStream(value), ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(false);
    const root = reader.parse();

    const ticks: SavedPendingTick[] = [];
    for (const entry of root.getList('tickList', false) ?? []) {
        if (!(entry instanceof NBTTagCompound)) continue;
        const name = entry.getCompound('blockState', false)?.getString('name', '') ?? '';
        if (name === '' || !entry.has('time') || !entry.has('x') || !entry.has('y') || !entry.has('z')) continue;
        ticks.push({
            x: entry.getNumber('x', 0),
            y: entry.getNumber('y', 0),
            z: entry.getNumber('z', 0),
            name,
            time: entry.getLong('time', 0n)
        });
    }

    return { currentTick: root.getNumber('currentTick', 0), ticks };
};
