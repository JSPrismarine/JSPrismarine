/**
 * The `entities` scenario: the members of an entity a script spawns, and what each does once the
 * entity is killed. An armor stand has no AI, so it stands where it is put. A chest minecart
 * carries an inventory. Everything runs once the chunk at the origin has loaded, on the flat world's grass at y -61.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { Entity, ItemStack, system, world } from '@minecraft/server';

const PACK = 'entities';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the chunks loaded. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** A vector as plain data, which the record can hold. */
const vector = ({ x, y, z }) => ({ x, y, z });

/**
 * Runs `run` once the chunk at the origin is loaded. With no player, BDS loads no chunk, so the
 * pack adds a ticking area over it first. Ticks are counted from the tick `run` starts.
 */
const whenLoaded = (run) => {
    world.afterEvents.worldLoad.subscribe(() => {
        const overworld = world.getDimension('overworld');
        try {
            overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        } catch {
            // A world that loads its spawn chunks without one, as JSPrismarine's does, may refuse it.
        }
        const waiting = system.runInterval(() => {
            let loaded = false;
            try {
                loaded = overworld.getBlock({ x: 0, y: -61, z: 0 }) !== undefined;
            } catch {
                // Not loaded yet.
            }
            if (!loaded) return;
            system.clearRun(waiting);
            start = system.currentTick;
            run();
        }, 1);
    });
};

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    attempt(
        'spawnEntity an unknown type',
        () => overworld.spawnEntity('minecraft:jsp_no_such_entity', { x: 0.5, y: -60, z: 0.5 }).typeId
    );
    attempt(
        'spawnEntity without a namespace',
        () => overworld.spawnEntity('armor_stand', { x: 4.5, y: -60, z: 4.5 }).typeId
    );
    const stand = overworld.spawnEntity('minecraft:armor_stand', { x: 0.5, y: -60, z: 0.5 });
    attempt('an Entity instance', () => stand instanceof Entity);
    attempt('id is a string', () => typeof stand.id);
    attempt('typeId', () => stand.typeId);
    attempt('location', () => vector(stand.location));
    attempt('dimension', () => stand.dimension.id);
    attempt('dimension is the same object', () => stand.dimension === overworld);
    attempt('isValid', () => stand.isValid);
    attempt('nameTag', () => stand.nameTag);
    attempt('set nameTag', () => {
        stand.nameTag = 'Standing';
        return stand.nameTag;
    });
    attempt('addTag', () => stand.addTag('first'));
    attempt('addTag again', () => stand.addTag('first'));
    attempt('addTag another', () => stand.addTag('second'));
    attempt('hasTag', () => [stand.hasTag('first'), stand.hasTag('third')]);
    attempt('getTags', () => stand.getTags().sort());
    attempt('removeTag', () => stand.removeTag('first'));
    attempt('removeTag again', () => stand.removeTag('first'));
    attempt('getTags after removeTag', () => stand.getTags());
    attempt('getEntities by type', () => overworld.getEntities({ type: 'minecraft:armor_stand' }).length);
    attempt('getEntities by tag', () => overworld.getEntities({ tags: ['second'] }).map((each) => each === stand));
    attempt('getEntities by name', () => overworld.getEntities({ name: 'Standing' }).length);
    attempt(
        'getEntities excluding the type',
        () =>
            overworld.getEntities({
                excludeTypes: ['minecraft:armor_stand'],
                location: { x: 0, y: -60, z: 0 },
                maxDistance: 8
            }).length
    );
    attempt(
        'getEntities near',
        () => overworld.getEntities({ location: { x: 0, y: -60, z: 0 }, maxDistance: 2 }).length
    );
    attempt('getComponent inventory of an armor stand', () => stand.getComponent('minecraft:inventory') === undefined);
    attempt('teleport', () => stand.teleport({ x: 2.5, y: -60, z: 3.5 }));
    attempt('location after teleport', () => vector(stand.location));

    const cart = overworld.spawnEntity('minecraft:chest_minecart', { x: -2.5, y: -60, z: -2.5 });
    const inventory = cart.getComponent('minecraft:inventory');
    attempt('inventory typeId', () => inventory.typeId);
    attempt('getComponent without a namespace', () => cart.getComponent('inventory') !== undefined);
    const container = inventory.container;
    attempt('container size', () => container.size);
    attempt('container emptySlotsCount', () => container.emptySlotsCount);
    attempt('container getItem of an empty slot', () => container.getItem(0) === undefined);
    attempt('container setItem', () => container.setItem(3, new ItemStack('minecraft:apple', 5)));
    attempt('container getItem', () => {
        const item = container.getItem(3);
        return { typeId: item.typeId, amount: item.amount };
    });
    attempt('container emptySlotsCount after setItem', () => container.emptySlotsCount);
    attempt('container getItem is a copy', () => {
        container.getItem(3).amount = 1;
        return container.getItem(3).amount;
    });
    attempt('container setItem out of range', () => container.setItem(27, new ItemStack('minecraft:apple')));
    attempt('container getItem out of range', () => container.getItem(-1));
    attempt('container setItem with nothing', () => {
        container.setItem(3);
        return container.getItem(3) === undefined;
    });

    attempt('kill', () => stand.kill());
    attempt('isValid after kill', () => stand.isValid);
    system.run(() => {
        attempt('isValid the next tick', () => stand.isValid);
        attempt('id the next tick', () => typeof stand.id);
        attempt('typeId the next tick', () => stand.typeId);
        attempt('location the next tick', () => vector(stand.location));
        attempt('nameTag the next tick', () => stand.nameTag);
        attempt('addTag the next tick', () => stand.addTag('third'));
        attempt('teleport the next tick', () => stand.teleport({ x: 0, y: -60, z: 0 }));
        attempt('kill the next tick', () => stand.kill());
        attempt(
            'getEntities by type the next tick',
            () => overworld.getEntities({ type: 'minecraft:armor_stand' }).length
        );
        cart.remove();
        attempt('container of a removed entity', () => container.size);
        attempt('container isValid of a removed entity', () => container.isValid);
        system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
    });
});
