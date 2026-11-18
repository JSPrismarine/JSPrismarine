/**
 * The `block-inventory` scenario: a chest's `minecraft:inventory` component and its container,
 * a block without one, and the durability component of an item stack. Everything runs once the
 * chunk at the origin has loaded, on the flat world's grass at y -61.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { ItemStack, system, world } from '@minecraft/server';

const PACK = 'chest';
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

/** Runs `run` once the chunk at the origin is loaded, adding a ticking area for BDS. */
const whenLoaded = (run) => {
    world.afterEvents.worldLoad.subscribe(() => {
        const overworld = world.getDimension('overworld');
        try {
            overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        } catch {
            // A world that loads its spawn chunks without one may refuse it.
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

/** A slot's stack as plain data, or null for an empty one. */
const slot = (container, index) => {
    const item = container.getItem(index);
    return item === undefined ? null : { typeId: item.typeId, amount: item.amount };
};

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const block = overworld.getBlock({ x: 1, y: -60, z: 1 });
    block.setType('minecraft:chest');
    const stone = overworld.getBlock({ x: 2, y: -60, z: 1 });
    stone.setType('minecraft:stone');

    attempt('getComponent inventory', () => block.getComponent('inventory') !== undefined);
    attempt('getComponent minecraft:inventory typeId', () => block.getComponent('minecraft:inventory').typeId);
    attempt('hasComponent inventory', () => block.hasComponent('minecraft:inventory'));
    attempt('component block', () => {
        const { x, y, z } = block.getComponent('inventory').block.location;
        return { x, y, z };
    });
    attempt('component isValid', () => block.getComponent('inventory').isValid);
    attempt('stone getComponent inventory', () => stone.getComponent('inventory') ?? null);
    attempt('stone hasComponent inventory', () => stone.hasComponent('inventory'));
    const container = block.getComponent('inventory').container;
    attempt('container size', () => container.size);
    attempt('container emptySlotsCount', () => container.emptySlotsCount);
    attempt('container isValid', () => container.isValid);
    attempt('setItem', () => container.setItem(0, new ItemStack('minecraft:apple', 5)));
    attempt('getItem', () => slot(container, 0));
    attempt('addItem', () => container.addItem(new ItemStack('minecraft:apple', 62)) ?? null);
    attempt('slots after addItem', () => [slot(container, 0), slot(container, 1)]);
    attempt('getItem past the end', () => container.getItem(27));
    attempt('a new block object reads the same slot', () =>
        slot(overworld.getBlock({ x: 1, y: -60, z: 1 }).getComponent('inventory').container, 1)
    );
    attempt('setItem undefined', () => {
        container.setItem(1);
        return slot(container, 1);
    });
    attempt('getComponent of a barrel', () => {
        const barrel = overworld.getBlock({ x: 3, y: -60, z: 1 });
        barrel.setType('minecraft:barrel');
        return barrel.getComponent('inventory').container.size;
    });

    const sword = new ItemStack('minecraft:diamond_sword');
    attempt('sword getComponent durability', () => sword.getComponent('durability') !== undefined);
    attempt('sword durability typeId', () => sword.getComponent('minecraft:durability').typeId);
    attempt('sword hasComponent durability', () => sword.hasComponent('minecraft:durability'));
    attempt('sword maxDurability', () => sword.getComponent('durability').maxDurability);
    attempt('sword damage', () => sword.getComponent('durability').damage);
    attempt('set sword damage', () => {
        const durability = sword.getComponent('durability');
        durability.damage = 10;
        return [durability.damage, sword.getComponent('durability').damage];
    });
    attempt('set sword damage past the max', () => {
        sword.getComponent('durability').damage = 5000;
        return sword.getComponent('durability').damage;
    });
    attempt('apple getComponent durability', () => new ItemStack('minecraft:apple').getComponent('durability') ?? null);
    attempt('apple hasComponent durability', () => new ItemStack('minecraft:apple').hasComponent('durability'));
    attempt('damaged sword in a chest', () => {
        const damaged = new ItemStack('minecraft:diamond_sword');
        damaged.getComponent('durability').damage = 7;
        container.setItem(5, damaged);
        return container.getItem(5).getComponent('durability').damage;
    });

    attempt('chest removed', () => {
        block.setType('minecraft:air');
        return container.isValid;
    });
    attempt('size of a removed chest', () => container.size);
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 2);
});
