/**
 * The `debug-shapes` scenario: what `@minecraft/debug-utilities`' shapes keep and report, and what
 * `debugDrawer` does with them. Every observation is of what a script reads back: the defaults each
 * class starts with, what a setter keeps, the errors the drawer and the shapes throw, and how
 * `timeLeft` counts down once a shape is drawn.
 *
 * BDS counts a drawn shape's `timeLeft` down by each frame's elapsed time, which drifts with the
 * host's load, so the record keeps how the count moves (down, still, or at zero) rather than its
 * values. A bounds error leaves its context on BDS's error stack, and the next conversion error's
 * message carries it, so the bounds errors come after every conversion error.
 *
 * Everything runs from `worldLoad`, which runs at tick 0, so the ticks the record shows count from
 * there.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';
import {
    DebugArrow,
    DebugBox,
    DebugCircle,
    DebugCone,
    DebugCylinder,
    DebugEllipsoid,
    DebugLine,
    DebugPyramid,
    DebugShape,
    DebugSphere,
    DebugText,
    debugDrawer,
    disableWatchdogTimingWarnings
} from '@minecraft/debug-utilities';

const PACK = 'shapes';
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

/** A float the way the record keeps it, so a float32 round trip reads the same on every engine. */
const round = (value) => (typeof value === 'number' ? Math.round(value * 1e4) / 1e4 : value);

/** A vector with its components rounded. */
const vector = (value) =>
    value === undefined ? 'undefined' : Object.fromEntries(Object.entries(value).map(([key, n]) => [key, round(n)]));

/** Reads one property, or what reading it throws. */
const read = (shape, name) => {
    try {
        const value = shape[name];
        if (value === undefined) return 'undefined';
        if (value === null) return null;
        if (typeof value === 'object') {
            if ('id' in value && typeof value.id === 'string') return `dimension ${value.id}`;
            return vector(value);
        }
        return round(value);
    } catch (error) {
        return `throws ${String(error)}`;
    }
};

/** Every property of a `DebugShape`, read off a shape. */
const BASE = [
    'attachedTo',
    'color',
    'dimension',
    'hasDuration',
    'location',
    'maximumRenderDistance',
    'rotation',
    'scale',
    'timeLeft',
    'totalTimeLeft'
];

/** The properties each class adds to its base's. */
const OWN = {
    DebugArrow: ['endLocation', 'headLength', 'headRadius', 'headSegments'],
    DebugBox: ['bound'],
    DebugCircle: [],
    DebugCone: ['height', 'numSegments', 'radii'],
    DebugCylinder: ['height', 'numSegments', 'radii'],
    DebugEllipsoid: ['radii', 'segmentsPerAxis'],
    DebugLine: ['endLocation'],
    DebugPyramid: ['depth', 'height', 'width'],
    DebugSphere: [],
    DebugText: [
        'backfaceVisible',
        'backgroundColorOverride',
        'depthTest',
        'lineGapHeight',
        'text',
        'textBackfaceVisible',
        'useRotation'
    ]
};

/** Every property of a shape, by name. */
const describe = (shape) =>
    Object.fromEntries([...BASE, ...OWN[shape.constructor.name]].map((name) => [name, read(shape, name)]));

/** Where a shape's `timeLeft` went from one tick to the next. */
const movement = (before, after) =>
    after === before ? (after === 0 ? 'at zero' : 'still') : after < before ? 'down' : 'up';

/** The movements of a list of readings, with each run of the same movement written once. */
const runs = (readings) => {
    const moves = [];
    for (let index = 1; index < readings.length; index++) {
        const move = movement(readings[index - 1], readings[index]);
        if (moves[moves.length - 1] !== move) moves.push(move);
    }
    return moves;
};

const at = { x: 1.5, y: -58, z: 2.25 };
const end = { x: 4, y: -57, z: 2 };

world.afterEvents.worldLoad.subscribe(() => {
    start = system.currentTick;
    record('worldLoad');
    const overworld = world.getDimension('overworld');
    const nether = world.getDimension('nether');

    attempt('DebugShape constructor', () => new DebugShape(at));
    const made = {
        DebugArrow: () => new DebugArrow(at, end),
        DebugBox: () => new DebugBox(at),
        DebugCircle: () => new DebugCircle(at),
        DebugCone: () => new DebugCone(at),
        DebugCylinder: () => new DebugCylinder(at),
        DebugEllipsoid: () => new DebugEllipsoid(at),
        DebugLine: () => new DebugLine(at, end),
        DebugPyramid: () => new DebugPyramid(at),
        DebugSphere: () => new DebugSphere(at),
        DebugText: () => new DebugText(at, 'hello')
    };
    for (const [name, make] of Object.entries(made)) attempt(`${name} defaults`, () => describe(make()));

    attempt('a shape is a DebugShape', () => {
        const box = new DebugBox(at);
        return {
            instance: box instanceof DebugShape,
            keys: Object.keys(box),
            json: JSON.stringify(box),
            string: String(box)
        };
    });
    attempt('a dimension location sets the dimension', () =>
        describe(new DebugSphere({ dimension: nether, x: 1, y: 2, z: 3 }))
    );
    attempt('new DebugBox with nothing', () => new DebugBox());
    attempt('new DebugBox with a string', () => new DebugBox('x'));
    attempt('new DebugLine without its end', () => new DebugLine(at));
    attempt('new DebugText with a number', () => new DebugText(at, 5));

    attempt('setters keep what they are given', () => {
        const box = new DebugBox(at);
        box.color = { red: 0.25, green: 0.5, blue: 2, alpha: -1 };
        box.scale = -3;
        box.rotation = { x: 10, y: 400, z: -1 };
        box.maximumRenderDistance = 12.5;
        box.timeLeft = 2;
        box.bound = { x: 2, y: 0, z: -1 };
        return describe(box);
    });
    attempt('a float keeps what a 32-bit float keeps', () => {
        const box = new DebugBox(at);
        box.scale = 1.1;
        return box.scale;
    });
    attempt('an integer drops its fraction', () => {
        const cone = new DebugCone(at);
        cone.numSegments = 3.7;
        return cone.numSegments;
    });
    attempt('a vector read back is a copy', () => {
        const box = new DebugBox(at);
        const location = box.location;
        location.x = 99;
        const color = box.color;
        color.red = 0;
        return { location: box.location, color: box.color };
    });
    attempt('a color keeps only its four parts', () => {
        const box = new DebugBox(at);
        box.color = { red: 1, green: 1, blue: 1, alpha: 1, extra: 1 };
        return box.color;
    });
    attempt('timeLeft set to 0', () => {
        const box = new DebugBox(at);
        box.timeLeft = 0;
        return describe(box);
    });
    attempt('timeLeft set to a negative number', () => {
        const box = new DebugBox(at);
        box.timeLeft = -1;
        return describe(box);
    });
    attempt('timeLeft set to undefined', () => {
        const box = new DebugBox(at);
        box.timeLeft = 3;
        box.timeLeft = undefined;
        return describe(box);
    });
    attempt('maximumRenderDistance set to undefined', () => {
        const box = new DebugBox(at);
        box.maximumRenderDistance = 5;
        box.maximumRenderDistance = undefined;
        return read(box, 'maximumRenderDistance');
    });
    attempt('depth and backgroundColorOverride set to undefined', () => {
        const pyramid = new DebugPyramid(at);
        pyramid.depth = 2;
        pyramid.depth = undefined;
        const text = new DebugText(at, 'x');
        text.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0 };
        text.backgroundColorOverride = undefined;
        return { depth: read(pyramid, 'depth'), background: read(text, 'backgroundColorOverride') };
    });
    attempt('setLocation with a vector', () => {
        const box = new DebugBox(at);
        box.setLocation({ x: 9, y: 8, z: 7 });
        return describe(box);
    });
    attempt('setLocation with a dimension location', () => {
        const box = new DebugBox(at);
        box.setLocation({ dimension: nether, x: 9, y: 8, z: 7 });
        return describe(box);
    });
    attempt('DebugText setText with a string', () => {
        const text = new DebugText(at, 'first');
        text.setText('second');
        return read(text, 'text');
    });
    attempt('DebugText setText with a raw message', () => {
        const text = new DebugText(at, { rawtext: [{ text: 'raw' }] });
        const before = text.text;
        text.setText({ translate: 'item.apple.name' });
        return { before, after: text.text };
    });
    attempt('DebugText with a raw message part', () => new DebugText(at, { text: 'x' }).text);
    attempt('DebugText setText with a number', () => new DebugText(at, 'a').setText(5));
    attempt('DebugText setters', () => {
        const text = new DebugText(at, 'hello');
        text.backfaceVisible = true;
        text.backgroundColorOverride = { red: 0, green: 0, blue: 0, alpha: 0.5 };
        text.depthTest = true;
        text.lineGapHeight = 0.5;
        text.textBackfaceVisible = true;
        text.useRotation = true;
        return describe(text);
    });
    attempt('DebugArrow setters', () => {
        const arrow = new DebugArrow(at, end);
        arrow.headLength = 2;
        arrow.headRadius = 0.25;
        arrow.headSegments = 12;
        arrow.endLocation = { x: 0, y: 0, z: 0 };
        return describe(arrow);
    });
    attempt('DebugCone setters', () => {
        const cone = new DebugCone(at);
        cone.height = 3;
        cone.numSegments = 7;
        cone.radii = { x: 2, y: 0.5 };
        return describe(cone);
    });
    attempt('DebugPyramid setters', () => {
        const pyramid = new DebugPyramid(at);
        pyramid.depth = 4;
        pyramid.height = 3;
        pyramid.width = 2;
        return describe(pyramid);
    });
    attempt('DebugEllipsoid setters', () => {
        const ellipsoid = new DebugEllipsoid(at);
        ellipsoid.radii = { x: 1, y: 2, z: 3 };
        ellipsoid.segmentsPerAxis = 9;
        return describe(ellipsoid);
    });

    // Conversion errors: a setter's value is the `Function return value` in BDS's wording.
    attempt('color without alpha', () => {
        new DebugBox(at).color = { red: 1, green: 0, blue: 0 };
    });
    attempt('bound without y', () => {
        new DebugBox(at).bound = { x: 1, z: 1 };
    });
    attempt('bound with an x of NaN', () => {
        new DebugBox(at).bound = { x: Number.NaN, y: 1, z: 1 };
    });
    attempt('bound set to a string', () => {
        new DebugBox(at).bound = 'x';
    });
    attempt('scale set to a string', () => {
        new DebugBox(at).scale = 'x';
    });
    attempt('scale set to NaN', () => {
        new DebugBox(at).scale = Number.NaN;
    });
    attempt('scale set to Infinity', () => {
        new DebugBox(at).scale = Number.POSITIVE_INFINITY;
    });
    attempt('timeLeft set to NaN', () => {
        new DebugBox(at).timeLeft = Number.NaN;
    });
    attempt('attachedTo a non-entity', () => {
        new DebugBox(at).attachedTo = { id: 'nobody' };
    });
    attempt('dimension set', () => {
        new DebugBox(at).dimension = nether;
    });
    attempt('hasDuration set', () => {
        new DebugBox(at).hasDuration = true;
    });
    attempt('addShape without a dimension', () => {
        const box = new DebugBox(at);
        debugDrawer.addShape(box);
        const after = describe(box);
        box.remove();
        return after;
    });
    attempt('addShape with a dimension', () => {
        const box = new DebugBox(at);
        debugDrawer.addShape(box, nether);
        const after = describe(box);
        debugDrawer.removeShape(box);
        return after;
    });
    attempt('addShape of a dimension location shape with another dimension', () => {
        const box = new DebugBox({ dimension: nether, x: 0, y: 0, z: 0 });
        debugDrawer.addShape(box, overworld);
        const after = read(box, 'dimension');
        box.remove();
        return after;
    });
    attempt('addShape twice', () => {
        const box = new DebugBox(at);
        debugDrawer.addShape(box);
        debugDrawer.addShape(box);
        box.remove();
        return 'added twice';
    });
    attempt('addShape of a non-shape', () => debugDrawer.addShape({}));
    attempt('addShape of nothing', () => debugDrawer.addShape());
    attempt('addShape with a dimension that is a string', () => debugDrawer.addShape(new DebugBox(at), 'nether'));
    attempt('removeShape of a non-shape', () => debugDrawer.removeShape({}));
    attempt('removeShape of a shape never added', () => debugDrawer.removeShape(new DebugBox(at)));
    attempt('remove of a shape never added', () => new DebugBox(at).remove());
    attempt('removeAll with nothing drawn', () => debugDrawer.removeAll());
    attempt('removeShape twice', () => {
        const box = new DebugBox(at);
        debugDrawer.addShape(box);
        debugDrawer.removeShape(box);
        debugDrawer.removeShape(box);
        return describe(box);
    });
    attempt('a removed shape can be added again', () => {
        const box = new DebugBox(at);
        debugDrawer.addShape(box);
        box.remove();
        debugDrawer.addShape(box);
        const after = describe(box);
        box.remove();
        return after;
    });
    attempt('removeAll', () => {
        const one = new DebugBox(at);
        const two = new DebugLine(at, end);
        debugDrawer.addShape(one);
        debugDrawer.addShape(two);
        debugDrawer.removeAll();
        return { one: describe(one), two: describe(two) };
    });
    attempt('debugDrawer is a DebugDrawer', () => ({
        keys: Object.keys(debugDrawer),
        constructor: debugDrawer.constructor.name
    }));
    attempt('disableWatchdogTimingWarnings', () => disableWatchdogTimingWarnings(true));
    attempt('disableWatchdogTimingWarnings with nothing', () => disableWatchdogTimingWarnings());

    // Bounds errors last: see the note at the top.
    attempt('headSegments above its bounds', () => {
        new DebugArrow(at, end).headSegments = 300;
    });
    attempt('headSegments below its bounds', () => {
        new DebugArrow(at, end).headSegments = -1;
    });
    attempt('numSegments below its bounds', () => {
        new DebugCone(at).numSegments = 2;
    });
    attempt('numSegments above its bounds', () => {
        new DebugCylinder(at).numSegments = 129;
    });
    attempt('segmentsPerAxis below its bounds', () => {
        new DebugEllipsoid(at).segmentsPerAxis = 0;
    });
    attempt('maximumRenderDistance below its bounds', () => {
        new DebugBox(at).maximumRenderDistance = -1;
    });

    // Shapes that stay drawn while the ticks pass, each read once a tick.
    const timed = new DebugBox(at);
    timed.timeLeft = 0.5;
    debugDrawer.addShape(timed);
    const undrawn = new DebugBox(at);
    undrawn.timeLeft = 0.5;
    const forever = new DebugSphere(at);
    debugDrawer.addShape(forever);
    const removed = new DebugBox(at);
    debugDrawer.addShape(removed);
    removed.timeLeft = 2;
    attempt('a timed shape after addShape', () => describe(timed));
    attempt('timeLeft set after addShape', () => describe(removed));

    const readings = { timed: [0.5], undrawn: [0.5], removed: [2], forever: [] };
    const totals = new Set();
    let ticks = 0;
    const watch = system.runInterval(() => {
        ticks += 1;
        readings.timed.push(timed.timeLeft);
        readings.undrawn.push(undrawn.timeLeft);
        readings.removed.push(removed.timeLeft);
        readings.forever.push(String(forever.timeLeft));
        totals.add(`${timed.totalTimeLeft} ${undrawn.totalTimeLeft}`);
        if (ticks === 3) {
            removed.timeLeft = 1;
            readings.removed[3] = removed.timeLeft;
            record('timeLeft set again while drawn', {
                value: { timeLeft: read(removed, 'timeLeft'), totalTimeLeft: read(removed, 'totalTimeLeft') }
            });
        }
        if (ticks === 6) {
            debugDrawer.removeShape(removed);
            debugDrawer.addShape(undrawn);
            record('removeShape and addShape in tick 6');
        }
        if (ticks === 20) {
            system.clearRun(watch);
            record('how each timeLeft moved', {
                value: {
                    timed: runs(readings.timed),
                    'undrawn before addShape': runs(readings.undrawn.slice(0, 7)),
                    'undrawn after addShape': runs(readings.undrawn.slice(6)),
                    'removed before removeShape': runs(readings.removed.slice(3, 7)),
                    'removed after removeShape': runs(readings.removed.slice(6)),
                    forever: [...new Set(readings.forever)],
                    totals: [...totals]
                }
            });
            attempt('a shape whose time ran out', () => describe(timed));
            attempt('removeShape of a shape whose time ran out', () => debugDrawer.removeShape(timed));
            attempt('addShape of a shape whose time ran out', () => {
                debugDrawer.addShape(timed);
                const after = describe(timed);
                timed.remove();
                return after;
            });
            forever.remove();
            undrawn.remove();
            console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
        }
    }, 1);
});
