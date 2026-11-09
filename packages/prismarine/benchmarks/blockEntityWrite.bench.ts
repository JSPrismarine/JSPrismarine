/**
 * Compares unchanged and changed block-entity writes across the types called out in #2817.
 *
 * Run with `node packages/prismarine/benchmarks/run.mjs packages/prismarine/benchmarks/blockEntityWrite.bench.ts`.
 */
import { performance } from 'node:perf_hooks';

import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTWriter, NBTTagCompound, Types } from '@jsprismarine/nbt';

import { BlockEntityRegistry } from '../src/blockentity/BlockEntityRegistry';
import type { BlockEntity } from '../src/blockentity/BlockEntity';
import { writeBlockEntity } from '../src/blockentity/blockEntityWrite';

const WRITES = 10_000;
const SAMPLES = 5;
const AT = { x: 8, y: 64, z: 8 };

const networkTags = (tags: NBTTagCompound): Buffer => {
    const stream = new BinaryStream();
    const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(true);
    writer.writeCompound(tags);
    return stream.getBuffer();
};

const tagsFor = (kind: 'container' | 'sign' | 'furnace' | 'comparator', revision: number): NBTTagCompound => {
    const tags = new NBTTagCompound('');
    const id = { container: 'Chest', sign: 'Sign', furnace: 'Furnace', comparator: 'Comparator' }[kind];
    tags.addValue('id', new Types.StringVal(id));
    tags.addValue('x', new Types.NumberVal(AT.x));
    tags.addValue('y', new Types.NumberVal(AT.y));
    tags.addValue('z', new Types.NumberVal(AT.z));

    if (kind === 'container' || kind === 'furnace') {
        const items = new Set<NBTTagCompound>();
        for (let slot = 0; slot < 27; slot++) {
            const item = new NBTTagCompound('');
            item.addValue('Slot', new Types.ByteVal(slot));
            item.addValue('Name', new Types.StringVal(`minecraft:item_${slot}`));
            item.addValue('Count', new Types.ByteVal(1));
            items.add(item);
        }
        tags.addValue('Items', items);
    }

    if (kind === 'sign') {
        tags.addValue('Text', new Types.StringVal(`Revision ${revision}`));
    } else if (kind === 'furnace') {
        tags.addValue('BurnTime', new Types.ShortVal(revision));
        tags.addValue('CookTime', new Types.ShortVal(20));
        tags.addValue('BurnDuration', new Types.ShortVal(1600));
    } else if (kind === 'comparator') {
        tags.addValue('OutputSignal', new Types.ByteVal(revision));
    } else {
        tags.addValue('CustomName', new Types.StringVal(`Container ${revision}`));
    }

    return tags;
};

const makeWorld = () => {
    let standing: BlockEntity | null = null;
    let writes = 0;
    const chunk = {
        getBlockEntity: (_x: number, _y: number, _z: number) => standing,
        setBlockEntity: (entity: BlockEntity) => {
            standing = entity;
            writes++;
        }
    };
    return {
        chunk,
        get writes() {
            return writes;
        },
        world: {
            getLoadedChunk: (_cx: number, _cz: number) => chunk,
            blockEntityChanged: () => {}
        }
    };
};

const writeBaseline = (world: ReturnType<typeof makeWorld>['world'], tags: NBTTagCompound): boolean => {
    const x = tags.getNumber('x', 0);
    const y = tags.getNumber('y', 0);
    const z = tags.getNumber('z', 0);
    const chunk = world.getLoadedChunk(x >> 4, z >> 4);
    if (chunk === null) return false;

    const written = BlockEntityRegistry.fromNBT(tags);
    const settled = written.toNBT();
    const standing = chunk.getBlockEntity(x, y, z);
    if (standing && networkTags(standing.toNBT()).equals(networkTags(settled))) return false;

    chunk.setBlockEntity(written);
    return true;
};

const measure = (run: () => number): number => {
    run();
    run();
    const times = Array.from({ length: SAMPLES }, () => {
        const started = performance.now();
        const writes = run();
        return { ms: performance.now() - started, writes };
    }).sort((left, right) => left.ms - right.ms);
    return times[Math.floor(times.length / 2)]!.ms;
};

for (const kind of ['container', 'sign', 'furnace', 'comparator'] as const) {
    const unchanged = [tagsFor(kind, 10)];
    const changed = Array.from({ length: WRITES }, (_unused, index) => tagsFor(kind, index % 2 === 0 ? 10 : 11));

    for (const [change, inputs] of [
        ['unchanged', unchanged],
        ['changed', changed]
    ] as const) {
        const baselineMs = measure(() => {
            const sample = makeWorld();
            writeBaseline(sample.world, inputs[0]!);
            let writes = 0;
            for (let index = 0; index < WRITES; index++) {
                if (writeBaseline(sample.world, inputs[index % inputs.length]!)) writes++;
            }
            return writes;
        });
        const cachedMs = measure(() => {
            const sample = makeWorld();
            writeBlockEntity(sample.world, inputs[0]!);
            let writes = 0;
            for (let index = 0; index < WRITES; index++) {
                if (writeBlockEntity(sample.world, inputs[index % inputs.length]!)) writes++;
            }
            return writes;
        });
        console.log(
            JSON.stringify({
                benchmark: 'block-entity-write',
                kind,
                change,
                node: process.version,
                writesPerSample: WRITES,
                baselineMedianMs: baselineMs,
                cachedMedianMs: cachedMs
            })
        );
    }
}
