/**
 * The `primitive-shapes` scenario: `@minecraft/server`'s own debug text. A `TextPrimitive` starts
 * with BDS's defaults and keeps what its setters are given, and `world.primitiveShapesManager`
 * draws, lists and removes texts. A drawn text's `timeLeft` counts down by each frame's elapsed
 * time on BDS, so the record keeps whether it moved rather than its values.
 *
 * Everything runs from `worldLoad`, which runs at tick 0, so the ticks the record shows count from
 * there.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, TextPrimitive, world } from '@minecraft/server';

const PACK = 'text';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since `worldLoad`. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        const value = call();
        record(event, { value: value === undefined ? 'undefined' : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** A float the way the record keeps it. */
const round = (value) => (typeof value === 'number' ? Math.round(value * 1e4) / 1e4 : value);

/** Reads one property, or what reading it throws. */
const read = (shape, name) => {
    try {
        const value = shape[name];
        if (value === undefined) return 'undefined';
        if (value === null) return null;
        if (Array.isArray(value)) return value.map((each) => each.id ?? each);
        if (typeof value === 'object') {
            if ('id' in value && typeof value.id === 'string') return `dimension ${value.id}`;
            return Object.fromEntries(Object.entries(value).map(([key, n]) => [key, round(n)]));
        }
        return round(value);
    } catch (error) {
        return `throws ${String(error)}`;
    }
};

const PROPERTIES = [
    'attachedTo',
    'backfaceVisible',
    'backgroundColorOverride',
    'color',
    'defaultVisibleToAll',
    'depthTest',
    'dimension',
    'hasDuration',
    'hiddenFrom',
    'lineGapHeight',
    'location',
    'maximumRenderDistance',
    'rotation',
    'scale',
    'text',
    'textBackfaceVisible',
    'timeLeft',
    'totalTimeLeft',
    'useRotation',
    'visibleTo'
];

const describe = (shape) => Object.fromEntries(PROPERTIES.map((name) => [name, read(shape, name)]));

world.afterEvents.worldLoad.subscribe(() => {
    start = system.currentTick;
    const overworld = world.getDimension('overworld');
    const manager = world.primitiveShapesManager;
    attempt('primitiveShapesManager is the same object', () => world.primitiveShapesManager === manager);
    attempt('maxShapes', () => manager.maxShapes);
    attempt('a new text', () => describe(new TextPrimitive({ x: 1.5, y: 2, z: 3 }, 'hello')));
    attempt('a new text in a dimension', () =>
        describe(new TextPrimitive({ dimension: overworld, x: 1, y: 2, z: 3 }, { rawtext: [{ text: 'raw' }] }))
    );
    attempt('a new text of a bad location', () => new TextPrimitive({ x: 1 }, 'x'));
    attempt('a new text of a number', () => new TextPrimitive({ x: 1, y: 2, z: 3 }, 5));
    attempt('setters', () => {
        const text = new TextPrimitive({ x: 0, y: 0, z: 0 }, 'set');
        text.backfaceVisible = false;
        text.backgroundColorOverride = { red: 0.5, green: 0.25, blue: 0, alpha: 1 };
        text.color = { red: 1, green: 0, blue: 0, alpha: 0.5 };
        text.depthTest = true;
        text.lineGapHeight = 0.3;
        text.maximumRenderDistance = 40;
        text.rotation = { x: 10, y: 20, z: 30 };
        text.scale = 2.5;
        text.textBackfaceVisible = true;
        text.useRotation = true;
        text.defaultVisibleToAll = false;
        text.setText('changed');
        text.setLocation({ x: 7, y: 8, z: 9 });
        return describe(text);
    });
    attempt('scale out of bounds', () => {
        const text = new TextPrimitive({ x: 0, y: 0, z: 0 }, 'x');
        text.scale = 5000;
        return text.scale;
    });
    attempt('timeLeft set', () => {
        const text = new TextPrimitive({ x: 0, y: 0, z: 0 }, 'x');
        text.timeLeft = 2;
        return [text.timeLeft, text.totalTimeLeft, text.hasDuration];
    });
    attempt('getShapes before adding', () => manager.getShapes().length);
    const drawn = new TextPrimitive({ x: 0, y: -60, z: 0 }, 'drawn');
    drawn.timeLeft = 5;
    const kept = new TextPrimitive({ x: 30, y: -60, z: 0 }, 'kept');
    attempt('addText', () => manager.addText(drawn, overworld));
    attempt('addText again', () => manager.addText(drawn));
    attempt('addText without a dimension', () => manager.addText(kept));
    attempt('getShapes', () => manager.getShapes().map((shape) => shape.text));
    attempt('getShapes is the same objects', () => manager.getShapes().includes(drawn));
    attempt('getShapes near the origin', () =>
        manager.getShapes({ location: { x: 0, y: -60, z: 0 }, maxDistance: 10 }).map((shape) => shape.text)
    );
    attempt('getShapes away from the origin', () =>
        manager.getShapes({ location: { x: 0, y: -60, z: 0 }, minDistance: 10 }).map((shape) => shape.text)
    );
    attempt('the drawn text', () => [read(drawn, 'dimension'), read(drawn, 'timeLeft')]);
    system.runTimeout(() => {
        attempt('timeLeft a tick later', () => {
            const left = drawn.timeLeft;
            return left === undefined ? 'undefined' : left < 5 ? 'down' : 'still';
        });
        attempt('removeText', () => {
            manager.removeText(drawn);
            return manager.getShapes().map((shape) => shape.text);
        });
        attempt('remove', () => {
            kept.remove();
            return manager.getShapes().length;
        });
        manager.addText(new TextPrimitive({ x: 0, y: 0, z: 0 }, 'a'));
        manager.addText(new TextPrimitive({ x: 0, y: 0, z: 0 }, 'b'));
        attempt('removeAll', () => {
            manager.removeAll();
            return manager.getShapes().length;
        });
        console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
    }, 1);
});
