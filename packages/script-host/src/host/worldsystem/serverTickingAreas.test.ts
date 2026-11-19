import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { loadLibrary, scriptHostAvailable } from '../../testing/library.test-utils';
import { SystemScripts, worldWithSystem } from './serverWorld.test-utils';

const harness = new SystemScripts(loadLibrary);
afterEach(() => harness.stopAll());
afterAll(() => harness.removeAll());

describe.skipIf(!scriptHostAvailable())('world.tickingAreaManager', () => {
    it('adds areas over whole chunks, counts the chunks they share once, and resolves once they load', () => {
        const { lines, world } = harness.start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const overworld = world.getDimension('overworld');
                const manager = world.tickingAreaManager;
                const area = (id) => { const found = manager.getTickingArea(id); return found && [found.identifier, found.dimension === overworld, found.boundingBox, found.chunkCount, found.isFullyLoaded]; };
                log('max', () => [manager.maxChunkCount, manager.chunkCount]);
                manager.createTickingArea('jsp:near', { dimension: overworld, from: { x: -20, y: 5, z: -3 }, to: { x: 17.5, y: 70, z: 40 } })
                    .then(() => console.warn(system.currentTick + ' near loaded'));
                manager.createTickingArea('plain', { dimension: overworld, from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 1 } })
                    .then(() => console.warn(system.currentTick + ' plain loaded'));
                manager.createTickingArea('jsp:far', { dimension: overworld, from: { x: 1000, y: 0, z: 1000 }, to: { x: 1010, y: 0, z: 1010 } })
                    .then(() => console.warn('far loaded'));
                log('near', () => area('jsp:near'));
                log('count', () => [manager.chunkCount, manager.getAllTickingAreas().map((each) => each.identifier)]);
                log('in use', () => manager.createTickingArea('jsp:near', { dimension: overworld, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } }));
                log('too large', () => manager.createTickingArea('jsp:large', { dimension: overworld, from: { x: -1000, y: 0, z: -1000 }, to: { x: 1000, y: 0, z: 1000 } }));
                log('capacity', () => [manager.hasCapacity({ dimension: overworld, from: { x: 0, y: 0, z: 0 }, to: { x: 15, y: 0, z: 15 } }), manager.hasTickingArea('plain'), manager.hasTickingArea('jsp:none')]);
                system.runTimeout(() => {
                    log('remove', () => { manager.removeTickingArea(manager.getTickingArea('jsp:near')); return manager.chunkCount; });
                    log('remove unknown', () => manager.removeTickingArea('jsp:none'));
                    log('remove all', () => { manager.removeAllTickingAreas(); return manager.getAllTickingAreas().length; });
                }, 3);
            });`,
            worldWithSystem(),
            5
        );
        expect(lines).toEqual([
            'max [300,0]',
            'near ["jsp:near",true,{"min":{"x":-32,"y":-64,"z":-16},"max":{"x":31,"y":320,"z":47}},16,true]',
            'count [20,["jsp:near","plain","jsp:far"]]',
            "in use ! TickingAreaError: Identifier 'jsp:near' already exists.",
            "too large ! TickingAreaError: Adding 'jsp:large' pushes the ticking chunks over the limit of '300'.",
            'capacity [true,true,false]',
            '1 near loaded',
            '1 plain loaded',
            'remove 5',
            "remove unknown ! TickingAreaError: Unknown identifier 'jsp:none'.",
            'remove all 0'
        ]);
        expect(world.worldSystem.tickingAreas()).toEqual([]);
    });
});
