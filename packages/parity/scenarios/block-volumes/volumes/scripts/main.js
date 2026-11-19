/**
 * The `block-volumes` scenario: block boxes and volumes, which read no world, so everything runs
 * once after `worldLoad`.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { BlockBoundingBoxUtils, BlockVolume, ListBlockVolume, system, world } from '@minecraft/server';

const PACK = 'volumes';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** Every location an iterator gives, as plain data. */
const walk = (iterator) => {
    const found = [];
    for (const location of iterator) found.push(location);
    return found;
};

world.afterEvents.worldLoad.subscribe(() => {
    const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 3, z: 4 } };
    const other = { min: { x: 1, y: 1, z: 1 }, max: { x: 5, y: 5, z: 5 } };
    const apart = { min: { x: 10, y: 10, z: 10 }, max: { x: 11, y: 11, z: 11 } };
    attempt('createValid', () => BlockBoundingBoxUtils.createValid({ x: 3, y: -1, z: 2 }, { x: 0, y: 4, z: -2 }));
    attempt('createValid fractional', () =>
        BlockBoundingBoxUtils.createValid({ x: 0.5, y: 1.7, z: -0.5 }, { x: 2.2, y: 3.9, z: 1.5 })
    );
    attempt('dilate', () => BlockBoundingBoxUtils.dilate(box, { x: 1, y: 2, z: 3 }));
    attempt('equals itself', () => BlockBoundingBoxUtils.equals(box, { min: { ...box.min }, max: { ...box.max } }));
    attempt('equals another', () => BlockBoundingBoxUtils.equals(box, other));
    attempt('expand', () => BlockBoundingBoxUtils.expand(box, apart));
    attempt('getCenter', () => BlockBoundingBoxUtils.getCenter(box));
    attempt('getCenter of one block', () =>
        BlockBoundingBoxUtils.getCenter({ min: { x: 3, y: 3, z: 3 }, max: { x: 3, y: 3, z: 3 } })
    );
    attempt('getIntersection', () => BlockBoundingBoxUtils.getIntersection(box, other));
    attempt('getIntersection apart', () => BlockBoundingBoxUtils.getIntersection(box, apart) === undefined);
    attempt('getIntersection touching', () =>
        BlockBoundingBoxUtils.getIntersection(box, { min: { x: 2, y: 3, z: 4 }, max: { x: 6, y: 6, z: 6 } })
    );
    attempt('getSpan', () => BlockBoundingBoxUtils.getSpan(box));
    attempt('intersects', () => BlockBoundingBoxUtils.intersects(box, other));
    attempt('intersects apart', () => BlockBoundingBoxUtils.intersects(box, apart));
    attempt('isInside', () => BlockBoundingBoxUtils.isInside(box, { x: 2, y: 3, z: 4 }));
    attempt('isInside outside', () => BlockBoundingBoxUtils.isInside(box, { x: 3, y: 0, z: 0 }));
    attempt('isInside fractional', () => BlockBoundingBoxUtils.isInside(box, { x: 2.5, y: 0, z: 0 }));
    attempt('isValid', () => BlockBoundingBoxUtils.isValid(box));
    attempt('isValid inverted', () => BlockBoundingBoxUtils.isValid({ min: box.max, max: box.min }));
    attempt('translate', () => BlockBoundingBoxUtils.translate(box, { x: -1, y: 10, z: 0.5 }));

    const volume = new BlockVolume({ x: 2, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
    attempt('BlockVolume from', () => volume.from);
    attempt('BlockVolume to', () => volume.to);
    attempt('BlockVolume fractional corners', () => {
        const fractional = new BlockVolume({ x: 0.7, y: -0.2, z: 1.5 }, { x: 2.1, y: 1.9, z: -1.5 });
        return [fractional.from, fractional.to, fractional.getMin(), fractional.getMax()];
    });
    attempt('getMin', () => volume.getMin());
    attempt('getMax', () => volume.getMax());
    attempt('getSpan', () => volume.getSpan());
    attempt('getCapacity', () => volume.getCapacity());
    attempt('getBoundingBox', () => volume.getBoundingBox());
    attempt('isInside', () => [volume.isInside({ x: 1, y: 1, z: 1 }), volume.isInside({ x: 3, y: 0, z: 0 })]);
    attempt('isInside fractional', () => volume.isInside({ x: 2.9, y: 1.5, z: 0.2 }));
    attempt('iterator order', () => walk(volume.getBlockLocationIterator()));
    attempt('getClosest', () => volume.getClosest(4, { x: 1, y: 0, z: 0 }));
    attempt('getFarthest', () => volume.getFarthest(3, { x: 0, y: 0, z: 0 }));
    attempt('getClosest more than it has', () => volume.getClosest(50, { x: 0, y: 0, z: 0 }).length);
    attempt('getClosest fractional', () => volume.getClosest(2, { x: 1.6, y: 0.4, z: 0.5 }));
    attempt('doesLocationTouchFaces', () => [
        volume.doesLocationTouchFaces({ x: 0, y: 0, z: 0 }),
        volume.doesLocationTouchFaces({ x: 1, y: 1, z: 1 }),
        volume.doesLocationTouchFaces({ x: 5, y: 0, z: 0 })
    ]);
    const big = new BlockVolume({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 4 });
    attempt('doesLocationTouchFaces middle', () => big.doesLocationTouchFaces({ x: 2, y: 2, z: 2 }));
    attempt('doesVolumeTouchFaces', () => [
        big.doesVolumeTouchFaces(new BlockVolume({ x: 1, y: 1, z: 1 }, { x: 3, y: 3, z: 3 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: 4, y: 1, z: 1 }, { x: 6, y: 3, z: 3 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: 5, y: 1, z: 1 }, { x: 6, y: 3, z: 3 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 4 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: 0, y: 1, z: 1 }, { x: 2, y: 3, z: 3 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: -2, y: 1, z: 1 }, { x: 0, y: 3, z: 3 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: -2, y: 1, z: 1 }, { x: 4, y: 3, z: 3 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: 2, y: 2, z: 2 }, { x: 4, y: 9, z: 9 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: 1, y: 1, z: 4 }, { x: 3, y: 3, z: 9 }))
    ]);
    attempt('doesVolumeTouchFaces more', () => [
        big.doesVolumeTouchFaces(new BlockVolume({ x: -2, y: 5, z: 1 }, { x: 0, y: 6, z: 3 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: 0, y: 0, z: -3 }, { x: 4, y: 4, z: 0 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 3 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: -1, y: -1, z: -1 }, { x: 5, y: 5, z: 5 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: 1, y: -3, z: 1 }, { x: 3, y: 0, z: 3 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: -3, y: -3, z: -3 }, { x: 0, y: 0, z: 0 })),
        big.doesVolumeTouchFaces(new BlockVolume({ x: -3, y: 1, z: 1 }, { x: -1, y: 3, z: 3 })),
        new BlockVolume({ x: -2, y: 1, z: 1 }, { x: 0, y: 3, z: 3 }).doesVolumeTouchFaces(big)
    ]);
    attempt('intersects', () => [
        big.intersects(new BlockVolume({ x: 1, y: 1, z: 1 }, { x: 3, y: 3, z: 3 })),
        big.intersects(new BlockVolume({ x: 3, y: 3, z: 3 }, { x: 6, y: 6, z: 6 })),
        big.intersects(new BlockVolume({ x: 7, y: 7, z: 7 }, { x: 8, y: 8, z: 8 })),
        new BlockVolume({ x: 1, y: 1, z: 1 }, { x: 3, y: 3, z: 3 }).intersects(big),
        big.intersects(new BlockVolume({ x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 4 }))
    ]);
    attempt('iterator isValid', () => {
        const iterator = volume.getBlockLocationIterator();
        const before = iterator.isValid();
        iterator.next();
        const during = iterator.isValid();
        volume.translate({ x: 1, y: 0, z: 0 });
        const after = iterator.isValid();
        const next = iterator.next();
        return [before, during, after, next.done, next.value];
    });
    attempt('translate', () => [volume.from, volume.to]);
    attempt('translate fractional', () => {
        const moved = new BlockVolume({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
        moved.translate({ x: 0.5, y: -0.5, z: 1.5 });
        return [moved.from, moved.to];
    });
    attempt('set from', () => {
        const changed = new BlockVolume({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
        changed.from = { x: 3, y: 2.5, z: -1 };
        return [changed.from, changed.getMin(), changed.getMax()];
    });
    attempt('iterator done twice', () => {
        const iterator = new BlockVolume({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }).getBlockLocationIterator();
        return [iterator.next(), iterator.next(), iterator.next()].map((each) => [each.done, each.value ?? null]);
    });

    const list = new ListBlockVolume([
        { x: 3, y: 0, z: 0 },
        { x: 1, y: 2, z: 0 },
        { x: 3, y: 0, z: 0 },
        { x: 0.5, y: -1.5, z: 2 }
    ]);
    attempt('ListBlockVolume iterator order', () => walk(list.getBlockLocationIterator()));
    attempt('ListBlockVolume getCapacity', () => list.getCapacity());
    attempt('ListBlockVolume getMin getMax getSpan', () => [list.getMin(), list.getMax(), list.getSpan()]);
    attempt('ListBlockVolume getBoundingBox', () => list.getBoundingBox());
    attempt('ListBlockVolume isInside', () => [
        list.isInside({ x: 1, y: 2, z: 0 }),
        list.isInside({ x: 2, y: 1, z: 0 })
    ]);
    attempt('ListBlockVolume add', () => {
        list.add([
            { x: 9, y: 9, z: 9 },
            { x: 1, y: 2, z: 0 }
        ]);
        return [list.getCapacity(), walk(list.getBlockLocationIterator())];
    });
    attempt('ListBlockVolume remove', () => {
        list.remove([
            { x: 3, y: 0, z: 0 },
            { x: 7, y: 7, z: 7 }
        ]);
        return [list.getCapacity(), walk(list.getBlockLocationIterator())];
    });
    // BDS keeps a list's locations in a hash set, and a translate rebuilds it, so the order after
    // one is the hash's; the record sorts it.
    attempt('ListBlockVolume translate', () => {
        list.translate({ x: 1, y: 1, z: 1 });
        return walk(list.getBlockLocationIterator()).sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
    });
    attempt('ListBlockVolume getClosest', () => list.getClosest(2, { x: 0, y: 0, z: 0 }));
    const empty = new ListBlockVolume([]);
    attempt('ListBlockVolume empty getCapacity', () => empty.getCapacity());
    attempt('ListBlockVolume empty getMin', () => empty.getMin());
    attempt('ListBlockVolume empty getMax', () => empty.getMax());
    attempt('ListBlockVolume empty getSpan', () => empty.getSpan());
    attempt('ListBlockVolume empty getBoundingBox', () => empty.getBoundingBox());
    attempt('ListBlockVolume empty iterator', () => walk(empty.getBlockLocationIterator()));
    attempt('ListBlockVolume empty getClosest', () => empty.getClosest(1, { x: 0, y: 0, z: 0 }));
    attempt('ListBlockVolume empty isInside', () => empty.isInside({ x: 0, y: 0, z: 0 }));
    record('volumes done');
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
