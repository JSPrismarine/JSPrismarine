import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { loadLibrary, scriptHostAvailable } from '../../testing/library.test-utils';
import { MemoryWorld } from '../../testing/memoryWorld.test-utils';
import type { ScriptDebugShape, ScriptDebugShapeChange } from '../world';
import { shapeVisibleTo } from '../world';
import { SystemScripts } from './serverWorld.test-utils';

const harness = new SystemScripts(loadLibrary);
afterEach(() => harness.stopAll());
afterAll(() => harness.removeAll());

/** A memory world that records the debug shape changes it is asked to draw. */
class DrawingWorld extends MemoryWorld {
    public readonly changes: ScriptDebugShapeChange[][] = [];

    public drawDebugShapes(changes: readonly ScriptDebugShapeChange[]): void {
        this.changes.push([...changes]);
    }
}

const text: ScriptDebugShape = {
    kind: 'DebugText',
    location: { x: 0, y: 0, z: 0 },
    color: { red: 1, green: 1, blue: 1, alpha: 1 },
    scale: 1,
    rotation: { x: 0, y: 0, z: 0 }
};

describe('shapeVisibleTo', () => {
    it('shows a shape to everyone, to the players visibleTo names, and never to the ones it is hidden from', () => {
        expect(shapeVisibleTo(text, '1')).toBe(true);
        expect(shapeVisibleTo({ ...text, defaultVisibleToAll: false }, '1')).toBe(false);
        expect(shapeVisibleTo({ ...text, visibleTo: ['2'] }, '1')).toBe(false);
        expect(shapeVisibleTo({ ...text, visibleTo: ['1'], defaultVisibleToAll: false }, '1')).toBe(true);
        expect(shapeVisibleTo({ ...text, visibleTo: ['1'], hiddenFrom: ['1'] }, '1')).toBe(false);
    });
});

describe.skipIf(!scriptHostAvailable())('world.primitiveShapesManager', () => {
    it('draws texts with their defaults, lists and filters them, and takes them out', () => {
        const world = new DrawingWorld();
        const steve = world.join('Steve');
        const { lines } = harness.start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const manager = world.primitiveShapesManager;
                const [player] = world.getAllPlayers();
                const near = new server.TextPrimitive({ x: 0, y: 0, z: 0 }, 'near');
                const far = new server.TextPrimitive({ x: 30, y: 0, z: 0 }, { rawtext: [{ text: 'far' }] });
                log('defaults', () => [near.backfaceVisible, near.depthTest, near.defaultVisibleToAll, near.visibleTo.length, near.hiddenFrom.length]);
                far.visibleTo = [player];
                far.defaultVisibleToAll = false;
                manager.addText(near, world.getDimension('overworld'));
                manager.addText(far);
                log('shapes', () => manager.getShapes().map((shape) => shape === near ? 'near' : shape.text));
                log('near the origin', () => manager.getShapes({ location: { x: 0, y: 0, z: 0 }, maxDistance: 5 }).length);
                log('visible to', () => far.visibleTo[0] === player);
                log('max', () => manager.maxShapes);
                system.runTimeout(() => {
                    manager.removeText(near);
                    log('after removeText', () => manager.getShapes().length);
                    manager.removeAll();
                }, 1);
            });`,
            world,
            3
        );
        expect(lines).toEqual([
            'defaults [true,false,true,0,0]',
            'shapes ["near",{"rawtext":[{"text":"far"}]}]',
            'near the origin 1',
            'visible to true',
            'max 1000',
            'after removeText 1'
        ]);
        const [first] = world.changes;
        expect(first?.map((change) => change.shape?.text)).toEqual(['near', 'far']);
        expect(first?.[1]?.shape).toMatchObject({ visibleTo: [steve], defaultVisibleToAll: false });
        expect(world.changes.flat().filter((change) => change.shape === undefined)).toHaveLength(2);
    });
});
