/**
 * The `containers` scenario: finding, moving, swapping and transferring stacks between two chests,
 * and the members a `ContainerSlot` shares with an item stack, in the flat world. Everything runs
 * once the chunk at the origin has loaded.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { BlockPermutation, ItemLockMode, ItemStack, system, world } from '@minecraft/server';

const PACK = 'containers';
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

/** What a container holds, slot by slot, as plain data: null for an empty slot. */
const contents = (container) => {
    const found = [];
    for (let slot = 0; slot < container.size; slot++) {
        const item = container.getItem(slot);
        found.push(item === undefined ? null : `${item.typeId} x${item.amount}`);
    }
    // Trailing empty slots say nothing; a chest has 27.
    while (found.length > 0 && found[found.length - 1] === null) found.pop();
    return found;
};

/** Runs `run` once the chunk at the origin is loaded, after a ticking area over it. */
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
            run(overworld);
        }, 1);
    });
};

whenLoaded((overworld) => {
    const chestAt = (x) => {
        const block = overworld.getBlock({ x, y: -60, z: 5 });
        block.setPermutation(BlockPermutation.resolve('minecraft:chest'));
        return block.getComponent('minecraft:inventory').container;
    };
    const first = chestAt(1);
    const second = chestAt(4);
    first.setItem(0, new ItemStack('minecraft:apple', 10));
    first.setItem(2, new ItemStack('minecraft:stone', 64));
    first.setItem(3, new ItemStack('minecraft:apple', 5));
    const named = new ItemStack('minecraft:apple', 1);
    named.nameTag = 'Named';
    first.setItem(5, named);

    attempt('weight', () => [first.weight, second.weight]);
    attempt('containerRules', () => first.containerRules ?? null);
    attempt('firstItem firstEmptySlot', () => [
        first.firstItem() ?? null,
        first.firstEmptySlot() ?? null,
        second.firstItem() ?? null,
        second.firstEmptySlot() ?? null
    ]);
    attempt('contains', () => [
        first.contains(new ItemStack('minecraft:apple', 1)),
        first.contains(new ItemStack('minecraft:apple', 10)),
        first.contains(new ItemStack('minecraft:apple', 15)),
        first.contains(new ItemStack('minecraft:bread', 1)),
        first.contains(named)
    ]);
    attempt('find', () => [
        first.find(new ItemStack('minecraft:apple', 1)) ?? null,
        first.find(new ItemStack('minecraft:apple', 5)) ?? null,
        first.find(new ItemStack('minecraft:apple', 10)) ?? null,
        first.find(new ItemStack('minecraft:bread')) ?? null,
        first.find(named) ?? null
    ]);
    attempt('findLast', () => [
        first.findLast(new ItemStack('minecraft:apple', 1)) ?? null,
        first.findLast(new ItemStack('minecraft:apple', 10)) ?? null,
        first.findLast(new ItemStack('minecraft:stone', 64)) ?? null
    ]);
    attempt('moveItem to an empty slot', () => {
        first.moveItem(0, 1, second);
        return [contents(first), contents(second)];
    });
    attempt('moveItem onto a matching stack', () => {
        first.moveItem(3, 1, second);
        return [contents(first), contents(second)];
    });
    attempt('moveItem onto a different stack', () => {
        first.moveItem(2, 1, second);
        return [contents(first), contents(second)];
    });
    attempt('moveItem from an empty slot', () => {
        first.moveItem(20, 2, second);
        return [contents(first), contents(second)];
    });
    attempt('moveItem within a container', () => {
        first.moveItem(2, 7, first);
        return contents(first);
    });
    attempt('moveItem past the end', () => first.moveItem(30, 0, second));
    attempt('swapItems', () => {
        first.swapItems(7, 1, second);
        return [contents(first), contents(second)];
    });
    attempt('swapItems with an empty slot', () => {
        first.swapItems(5, 9, second);
        return [contents(first), contents(second)];
    });
    attempt('swapItems past the end', () => first.swapItems(0, 40, second));
    attempt('transferItem', () => {
        second.setItem(0, new ItemStack('minecraft:apple', 60));
        first.setItem(0, new ItemStack('minecraft:apple', 30));
        const left = first.transferItem(0, second);
        return [left === undefined ? null : `${left.typeId} x${left.amount}`, contents(first), contents(second)];
    });
    attempt('transferItem an empty slot', () => first.transferItem(20, second) ?? null);
    attempt('transferItem into a full container', () => {
        const full = chestAt(7);
        for (let slot = 0; slot < full.size; slot++) full.setItem(slot, new ItemStack('minecraft:dirt', 64));
        first.setItem(0, new ItemStack('minecraft:stone', 10));
        const left = first.transferItem(0, full);
        return [left === undefined ? null : `${left.typeId} x${left.amount}`, contents(first)];
    });
    attempt('clearAll', () => {
        second.clearAll();
        return [contents(second), second.emptySlotsCount];
    });

    first.setItem(10, new ItemStack('minecraft:diamond_sword'));
    const slot = first.getSlot(10);
    attempt('slot getTags hasTag', () => [slot.getTags().sort(), slot.hasTag('minecraft:is_sword')]);
    attempt('slot keepOnDeath lockMode', () => {
        const before = [slot.keepOnDeath, slot.lockMode];
        slot.keepOnDeath = true;
        slot.lockMode = ItemLockMode.inventory;
        const item = first.getItem(10);
        return [before, slot.keepOnDeath, slot.lockMode, item.keepOnDeath, item.lockMode];
    });
    attempt('slot canDestroy canPlaceOn', () => {
        slot.setCanDestroy(['minecraft:glass']);
        slot.setCanPlaceOn(['minecraft:obsidian']);
        return [slot.getCanDestroy(), slot.getCanPlaceOn(), first.getItem(10).getCanDestroy()];
    });
    attempt('slot getRawLore', () => {
        slot.setLore(['line']);
        return slot.getRawLore();
    });
    attempt('slot isStackableWith', () => [
        slot.isStackableWith(new ItemStack('minecraft:diamond_sword')),
        first.getSlot(3).isStackableWith(new ItemStack('minecraft:apple'))
    ]);
    attempt('slot dynamic properties', () => {
        const before = [
            slot.getDynamicProperty('jsp:a') ?? null,
            slot.getDynamicPropertyIds(),
            slot.getDynamicPropertyTotalByteCount()
        ];
        slot.setDynamicProperty('jsp:a', 7);
        slot.setDynamicProperties({ 'jsp:b': true, 'jsp:c': 'text' });
        const during = [
            slot.getDynamicProperty('jsp:a'),
            slot.getDynamicPropertyIds().sort(),
            slot.getDynamicPropertyTotalByteCount(),
            first.getItem(10).getDynamicProperty('jsp:c')
        ];
        slot.clearDynamicProperties();
        return [before, during, slot.getDynamicPropertyIds()];
    });
    attempt('slot dynamic property on a stackable item', () => {
        first.setItem(11, new ItemStack('minecraft:apple', 2));
        first.getSlot(11).setDynamicProperty('jsp:a', 1);
        return first.getItem(11).getDynamicProperty('jsp:a') ?? null;
    });
    attempt('empty slot members', () => {
        const empty = first.getSlot(20);
        const tried = [];
        for (const read of [
            () => empty.getTags(),
            () => empty.keepOnDeath,
            () => empty.getCanDestroy(),
            () => empty.getDynamicPropertyIds()
        ]) {
            try {
                tried.push(read());
            } catch (error) {
                tried.push(String(error));
            }
        }
        return tried;
    });
    record('containers done');
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
