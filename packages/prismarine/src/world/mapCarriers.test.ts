import { describe, expect, it } from 'vitest';

import type { MapCarrier } from './mapCarriers';
import { MapCarriers } from './mapCarriers';
import type { SavedMap } from './savedMap';
import { MAP_SIZE, blankSavedMap, newSavedMap } from './savedMap';

/** A player that carries a map until told otherwise, standing where it is put. */
const carrierNamed = (name: string, map: SavedMap) => {
    const state = { carrying: true, removed: false, x: 0, z: 0, dimension: 'minecraft:overworld', hidden: false };
    const carrier: MapCarrier = {
        name,
        isRemoved: () => state.removed,
        carries: (carried) => state.carrying && carried === map,
        dimension: () => state.dimension,
        position: () => ({ x: state.x, z: state.z, yaw: 0, gameTime: 0 }),
        hidesFromMaps: () => state.hidden
    };
    return { carrier, state };
};

const blank = () => blankSavedMap({ dimension: 'minecraft:overworld', x: 0, z: 0, scale: 0 });

describe('the players carrying a map', () => {
    it('owes a new holder the whole map and its own marker', () => {
        const map = blank();
        const carriers = new MapCarriers(map);
        const { carrier } = carrierNamed('Steve', map);

        carriers.tickCarriedBy(carrier);
        const update = carriers.nextUpdate(carrier);

        expect(update?.patch).toMatchObject({ startX: 0, startY: 0, width: MAP_SIZE, height: MAP_SIZE });
        expect(update?.decorations).toEqual([{ type: 'minecraft:player', x: 0, y: 0, rotation: 0 }]);
        expect(carriers.nextUpdate(carrier)).toBeUndefined();
    });

    it('sends the smallest rectangle holding every pixel that changed since the last update', () => {
        const map = blank();
        const carriers = new MapCarriers(map);
        const { carrier } = carrierNamed('Steve', map);
        carriers.tickCarriedBy(carrier);
        carriers.nextUpdate(carrier);

        expect(carriers.paint(3, 5, 4)).toBe(true);
        expect(carriers.paint(10, 7, 4)).toBe(true);
        // Painting a pixel the color it already is changes nothing.
        expect(carriers.paint(10, 7, 4)).toBe(false);

        const patch = carriers.nextUpdate(carrier)?.patch;
        expect(patch).toMatchObject({ startX: 3, startY: 5, width: 8, height: 3 });
        expect(patch?.colors[0]).toBe(4);
        expect(patch?.colors[7 + 2 * 8]).toBe(4);
    });

    it('sends a moved marker on every fifth update at most, as Java does', () => {
        const map = blank();
        const carriers = new MapCarriers(map);
        const { carrier, state } = carrierNamed('Steve', map);
        carriers.tickCarriedBy(carrier);
        carriers.nextUpdate(carrier);

        state.x = 20;
        carriers.tickCarriedBy(carrier);
        const updates = Array.from({ length: 5 }, () => carriers.nextUpdate(carrier));

        expect(updates.map((update) => update?.decorations !== undefined)).toEqual([false, false, false, false, true]);
        expect(updates[4]?.decorations?.[0]).toMatchObject({ x: 40, y: 0 });
    });

    it('keeps the markers the map was made with ahead of its holders', () => {
        const map = newSavedMap({
            dimension: 'minecraft:overworld',
            x: 0,
            z: 0,
            scale: 0,
            decorations: { '+': { type: 'minecraft:red_x', x: 10, z: 10, rotation: 180 } }
        });
        const carriers = new MapCarriers(map);
        carriers.tickCarriedBy(carrierNamed('Steve', map).carrier);

        expect(carriers.decorations().map((decoration) => decoration.type)).toEqual([
            'minecraft:red_x',
            'minecraft:player'
        ]);
    });

    it('drops a holder that put the map away, or left, and its marker with it', () => {
        const map = blank();
        const carriers = new MapCarriers(map);
        const steve = carrierNamed('Steve', map);
        const alex = carrierNamed('Alex', map);
        carriers.tickCarriedBy(steve.carrier);
        carriers.tickCarriedBy(alex.carrier);
        expect(carriers.decorations()).toHaveLength(2);

        alex.state.carrying = false;
        carriers.tickCarriedBy(steve.carrier);
        expect(carriers.decorations()).toHaveLength(1);
        expect(carriers.nextUpdate(alex.carrier)).toBeUndefined();

        steve.state.removed = true;
        carriers.tickCarriedBy(alex.carrier);
        expect(carriers.decorations()).toEqual([]);
    });

    it('marks no holder in another dimension, nor one wearing something that hides it from maps', () => {
        const map = blank();
        const carriers = new MapCarriers(map);
        const steve = carrierNamed('Steve', map);
        const alex = carrierNamed('Alex', map);
        alex.state.dimension = 'minecraft:the_nether';
        carriers.tickCarriedBy(steve.carrier);
        carriers.tickCarriedBy(alex.carrier);
        expect(carriers.decorations().map((decoration) => decoration.x)).toEqual([0]);

        steve.state.hidden = true;
        carriers.tickCarriedBy(alex.carrier);
        expect(carriers.decorations()).toEqual([]);
    });

    it('marks no holder on a map that does not track positions', () => {
        const map = { ...blank(), trackingPosition: false };
        const carriers = new MapCarriers(map);

        carriers.tickCarriedBy(carrierNamed('Steve', map).carrier);

        expect(carriers.decorations()).toEqual([]);
    });

    it('shows nobody the marker of a holder who put the map away before any carrier ticked', () => {
        const map = blank();
        const carriers = new MapCarriers(map);
        const steve = carrierNamed('Steve', map);
        carriers.tickCarriedBy(steve.carrier);

        steve.state.carrying = false;

        // No carrier has ticked since, so the marker is still kept, but a map asked for is drawn without it.
        expect(carriers.decorations()).toEqual([]);
    });

    it('shows a holder that hides from maps only its own marker', () => {
        const map = blank();
        const carriers = new MapCarriers(map);
        const steve = carrierNamed('Steve', map);
        const alex = carrierNamed('Alex', map);
        steve.state.hidden = true;
        alex.state.x = 20;
        carriers.tickCarriedBy(alex.carrier);
        carriers.tickCarriedBy(steve.carrier);

        expect(carriers.decorations(steve.carrier)).toHaveLength(2);
        expect(carriers.decorations(alex.carrier).map((decoration) => decoration.x)).toEqual([40]);
    });

    it('owes a holder an update again when it failed to reach the player', () => {
        const map = blank();
        const carriers = new MapCarriers(map);
        const { carrier } = carrierNamed('Steve', map);
        carriers.tickCarriedBy(carrier);
        carriers.nextUpdate(carrier);
        carriers.paint(3, 5, 4);
        const lost = carriers.nextUpdate(carrier);
        expect(carriers.nextUpdate(carrier)).toBeUndefined();

        carriers.unsent(carrier, lost ?? {});

        expect(carriers.nextUpdate(carrier)?.patch).toMatchObject({ startX: 3, startY: 5, width: 1, height: 1 });
    });
});
