/**
 * The `items` scenario: item stacks a script makes, and the members it reads and writes on them.
 * None of them needs the world, so everything runs at the top level after `worldLoad`.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { ItemStack, system, world } from '@minecraft/server';

const PACK = 'items';
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

/** A vector as plain data, which the record can hold. */
const vector = ({ x, y, z }) => ({ x, y, z });

world.afterEvents.worldLoad.subscribe(() => {
    const apple = new ItemStack('minecraft:apple');
    attempt('an ItemStack instance', () => apple instanceof ItemStack);
    attempt('typeId', () => apple.typeId);
    attempt('amount', () => apple.amount);
    attempt('typeId without a namespace', () => new ItemStack('apple').typeId);
    attempt('amount given', () => new ItemStack('minecraft:apple', 16).amount);
    attempt('amount over the stack size', () => new ItemStack('minecraft:apple', 65).amount);
    attempt('amount 0', () => new ItemStack('minecraft:apple', 0).amount);
    attempt('amount 255', () => new ItemStack('minecraft:apple', 255).amount);
    attempt('an unknown type', () => new ItemStack('minecraft:jsp_no_such_item').typeId);
    attempt('a block item', () => new ItemStack('minecraft:stone', 3).typeId);
    attempt('nameTag', () => apple.nameTag === undefined);
    attempt('set nameTag', () => {
        apple.nameTag = 'Named';
        return apple.nameTag;
    });
    attempt('set nameTag undefined', () => {
        apple.nameTag = undefined;
        return apple.nameTag === undefined;
    });
    attempt('getLore', () => apple.getLore());
    attempt('setLore', () => apple.setLore(['first', 'second']));
    attempt('getLore after setLore', () => apple.getLore());
    attempt('setLore with nothing', () => {
        apple.setLore();
        return apple.getLore();
    });
    attempt('set amount', () => {
        apple.amount = 7;
        return apple.amount;
    });
    attempt('set amount 0', () => {
        apple.amount = 0;
        return apple.amount;
    });
    attempt('set amount over the stack size', () => {
        apple.amount = 65;
        return apple.amount;
    });
    attempt('two stacks are separate', () => {
        const one = new ItemStack('minecraft:apple', 2);
        const two = new ItemStack('minecraft:apple', 2);
        one.amount = 5;
        return [one.amount, two.amount, one === two];
    });
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
