/**
 * The `custom-components` scenario: block and item custom components a pack registers in
 * `startup`, the errors a registration BDS refuses throws, and the hooks the pack's blocks run
 * them through when a script or a command places, ticks and removes them. Version 2 blocks name
 * a component as a key of their components, with parameters; a block of an older format names it
 * in `minecraft:custom_components`. Everything in the world runs once the chunk at the origin has
 * loaded, with random ticks off, so each tick a hook runs in is fixed.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { ItemStack, system, world } from '@minecraft/server';

const PACK = 'components';
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
        const value = call();
        record(event, { value: value === undefined ? null : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** A vector as plain data, which the record can hold. */
const vector = (value) => (value === undefined ? null : { x: value.x, y: value.y, z: value.z });

/** What the record keeps of a hook's event: its class, its block, and each member the hook defines. */
const describe = (event) => {
    const read = (name, as) => {
        try {
            const value = event[name];
            return value === undefined ? null : as(value);
        } catch (error) {
            return `threw ${String(error)}`;
        }
    };
    const kept = { class: event.constructor.name };
    if ('block' in event) kept.block = read('block', (block) => ({ typeId: block.typeId, ...vector(block.location) }));
    if ('dimension' in event) kept.dimension = read('dimension', (dimension) => dimension.id);
    if ('previousBlock' in event) kept.previousBlock = read('previousBlock', (permutation) => permutation.type.id);
    if ('brokenBlockPermutation' in event) {
        kept.brokenBlockPermutation = read('brokenBlockPermutation', (permutation) => permutation.type.id);
    }
    if ('entitySource' in event) kept.entitySource = read('entitySource', (entity) => entity.typeId);
    if ('blockDestructionSource' in event) {
        kept.blockDestructionSource = read('blockDestructionSource', (block) => block.typeId);
    }
    if ('player' in event) kept.player = read('player', (player) => player.typeId);
    return kept;
};

/** A component whose every hook records the event and the parameters the block gave it. */
const recorder = (component, hooks) =>
    Object.fromEntries(
        hooks.map((hook) => [
            hook,
            (event, parameters) => {
                const params = parameters === undefined ? 'no parameters' : parameters.params;
                record(`${component} ${hook}`, { value: { ...describe(event), params: params ?? null } });
            }
        ])
    );

const BLOCK_HOOKS = [
    'beforeOnPlayerPlace',
    'onBreak',
    'onEntityFallOn',
    'onPlace',
    'onPlayerBreak',
    'onPlayerInteract',
    'onRandomTick',
    'onRedstoneUpdate',
    'onStepOff',
    'onStepOn',
    'onTick'
];
const ITEM_HOOKS = [
    'onBeforeDurabilityDamage',
    'onCompleteUse',
    'onConsume',
    'onHitEntity',
    'onMineBlock',
    'onUse',
    'onUseOn'
];

let blocks;
let items;

system.beforeEvents.startup.subscribe((event) => {
    blocks = event.blockComponentRegistry;
    items = event.itemComponentRegistry;
    attempt('register jsp:recorder', () =>
        blocks.registerCustomComponent('jsp:recorder', recorder('jsp:recorder', BLOCK_HOOKS))
    );
    attempt('register jsp:legacy', () =>
        blocks.registerCustomComponent('jsp:legacy', recorder('jsp:legacy', BLOCK_HOOKS))
    );
    attempt('register jsp:recorder again', () => blocks.registerCustomComponent('jsp:recorder', {}));
    attempt('register without a namespace', () => blocks.registerCustomComponent('recorder', {}));
    attempt('register in the minecraft namespace', () => blocks.registerCustomComponent('minecraft:recorder', {}));
    attempt('register a hook that is not a function', () => blocks.registerCustomComponent('jsp:odd', { onPlace: 5 }));
    attempt('register an item component', () =>
        items.registerCustomComponent('jsp:item_recorder', recorder('jsp:item_recorder', ITEM_HOOKS))
    );
    attempt('register an item component again', () => items.registerCustomComponent('jsp:item_recorder', {}));
    attempt('register an item component without a namespace', () => items.registerCustomComponent('wand', {}));
    record('startup done');
});

world.afterEvents.worldLoad.subscribe(() => {
    attempt('register after startup', () => blocks.registerCustomComponent('jsp:late', {}));
    attempt('register an item component after startup', () => items.registerCustomComponent('jsp:late_item', {}));
    const overworld = world.getDimension('overworld');
    try {
        overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        overworld.runCommand('gamerule randomtickspeed 0');
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
        run(overworld);
    }, 1);
});

const run = (overworld) => {
    attempt('setType jsp:ticker', () => overworld.getBlock({ x: 0, y: -60, z: 0 }).setType('jsp:ticker'));
    attempt('setblock jsp:ticker', () => overworld.runCommand('setblock 2 -60 0 jsp:ticker').successCount);
    attempt('setblock jsp:legacy', () => overworld.runCommand('setblock 4 -60 0 jsp:legacy').successCount);
    attempt('setblock jsp:legacy again', () => overworld.runCommand('setblock 6 -60 0 jsp:legacy').successCount);
    attempt('setblock a third jsp:ticker', () => overworld.runCommand('setblock 8 -60 0 jsp:ticker').successCount);
    attempt('setblock over a jsp:ticker', () => overworld.runCommand('setblock 8 -60 0 jsp:ticker').successCount);
    attempt('an ItemStack of jsp:wand', () => new ItemStack('jsp:wand').typeId);
    system.runTimeout(() => {
        attempt('setType air', () => overworld.getBlock({ x: 0, y: -60, z: 0 }).setType('minecraft:air'));
        attempt('setblock air', () => overworld.runCommand('setblock 2 -60 0 air').successCount);
        attempt('setblock air over jsp:legacy', () => overworld.runCommand('setblock 4 -60 0 air').successCount);
        attempt(
            'setblock air destroy over jsp:legacy',
            () => overworld.runCommand('setblock 6 -60 0 air destroy').successCount
        );
        attempt(
            'setblock air destroy over jsp:ticker',
            () => overworld.runCommand('setblock 8 -60 0 air destroy').successCount
        );
        record('blocks removed');
        system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 15);
    }, 25);
};
