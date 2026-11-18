/**
 * The `entity-members` scenario: `World.getEntity`, `Dimension.getPlayers`, an entity's rotation,
 * head location, view direction and sneaking, and `Container.addItem` on a chest minecart's
 * inventory. An armor stand has no AI, so it stands where it is put. Everything runs once the
 * chunk at the origin has loaded, on the flat world's grass at y -61.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { ItemStack, system, world } from '@minecraft/server';

const PACK = 'members';
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

/** A vector as plain data, rounded to four places, which the record can hold. */
const vector = (value) => {
    const round = (part) => Math.round(part * 10000) / 10000;
    return Object.fromEntries(Object.entries(value).map(([key, part]) => [key, round(part)]));
};

/** A slot's stack as plain data, or null for an empty one. */
const slot = (container, index) => {
    const item = container.getItem(index);
    return item === undefined ? null : { typeId: item.typeId, amount: item.amount, nameTag: item.nameTag ?? null };
};

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
    const stand = overworld.spawnEntity('minecraft:armor_stand', { x: 0.5, y: -60, z: 0.5 });
    attempt('getEntity finds the same object', () => world.getEntity(stand.id) === stand);
    attempt('getEntity of an unknown id', () => world.getEntity('-12345') === undefined);
    attempt('getEntity of a word', () => world.getEntity('nonsense') === undefined);
    attempt('Dimension.getPlayers', () => overworld.getPlayers().length);
    attempt('Dimension.getPlayers by name', () => overworld.getPlayers({ name: 'nobody' }).length);
    attempt('Dimension.getPlayers by type', () => overworld.getPlayers({ type: 'minecraft:armor_stand' }).length);
    attempt('getRotation', () => vector(stand.getRotation()));
    attempt('getHeadLocation', () => vector(stand.getHeadLocation()));
    attempt('getViewDirection', () => vector(stand.getViewDirection()));
    attempt('isSneaking', () => stand.isSneaking);

    const cart = overworld.spawnEntity('minecraft:chest_minecart', { x: -2.5, y: -60, z: -2.5 });
    const container = cart.getComponent('minecraft:inventory').container;
    attempt('addItem into an empty container', () => container.addItem(new ItemStack('minecraft:apple', 5)));
    attempt('slot 0 after addItem', () => slot(container, 0));
    attempt('addItem past a full stack', () => container.addItem(new ItemStack('minecraft:apple', 62)));
    attempt('slots 0 and 1 after addItem', () => [slot(container, 0), slot(container, 1)]);
    attempt('addItem a named stack', () => {
        const named = new ItemStack('minecraft:apple', 2);
        named.nameTag = 'Shiny';
        return container.addItem(named);
    });
    attempt('slots 1 and 2 after a named stack', () => [slot(container, 1), slot(container, 2)]);
    attempt('addItem an unstackable item', () => container.addItem(new ItemStack('minecraft:diamond_sword')));
    attempt('slot 3 after an unstackable item', () => slot(container, 3));
    attempt('addItem fills a gap first', () => {
        container.setItem(1);
        container.addItem(new ItemStack('minecraft:stick', 4));
        return [slot(container, 1), slot(container, 4)];
    });
    attempt('addItem leaves the argument as it was', () => {
        const stack = new ItemStack('minecraft:stick', 7);
        container.addItem(stack);
        return stack.amount;
    });
    attempt('addItem into a nearly full container', () => {
        for (let index = 0; index < container.size; index++)
            container.setItem(index, new ItemStack('minecraft:stone', 64));
        container.setItem(26, new ItemStack('minecraft:stone', 60));
        const left = container.addItem(new ItemStack('minecraft:stone', 10));
        return [left === undefined ? null : { typeId: left.typeId, amount: left.amount }, slot(container, 26)];
    });
    attempt('addItem into a full container', () => {
        const left = container.addItem(new ItemStack('minecraft:apple', 3));
        return left === undefined ? null : { typeId: left.typeId, amount: left.amount };
    });
    attempt('emptySlotsCount when full', () => container.emptySlotsCount);

    stand.remove();
    attempt('getEntity of a removed entity', () => world.getEntity(stand.id) === undefined);
    cart.remove();
    attempt('addItem to the container of a removed entity', () => container.addItem(new ItemStack('minecraft:apple')));
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
