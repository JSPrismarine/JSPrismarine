/**
 * The `player-feedback` scenario: what a script tells a player, and what a player does that a
 * script sees. A simulated player gets titles, an action bar and sounds through
 * `onScreenDisplay` and `playSound`, effects and sneaking, then uses items and breaks a block
 * past `world.beforeEvents.itemUse` and `playerBreakBlock`. The break's before-event cancels the
 * first try, and a simulated player tries again the next tick. A simulated player's later
 * `useItem` calls return false on BDS, so the scenario uses one item.
 *
 * A behavior pack scenario has no client, so the pack registers the GameTest `jsp:feedback`,
 * and the capture runs it with `/gametest run` once the pack is ready. Ticks are counted from
 * the tick the test starts. `structures/jsp/feedback.mcstructure` is a 3 by 3 by 3 structure of air.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { ItemStack, system, world } from '@minecraft/server';
import { register } from '@minecraft/server-gametest';

const PACK = 'feedback';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the test started. */
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

/** A stack as plain data, or null for none. */
const stack = (item) => (item === undefined ? null : { typeId: item.typeId, amount: item.amount });

world.beforeEvents.itemUse.subscribe((event) =>
    record('world.beforeEvents.itemUse', {
        value: { item: stack(event.itemStack), source: event.source.name, cancel: event.cancel }
    })
);
world.afterEvents.itemUse.subscribe((event) =>
    record('world.afterEvents.itemUse', { value: { item: stack(event.itemStack), source: event.source.name } })
);

let cancelBreak = true;
world.beforeEvents.playerBreakBlock.subscribe((event) => {
    record('world.beforeEvents.playerBreakBlock', {
        value: {
            block: event.block.typeId,
            player: event.player.name,
            item: stack(event.itemStack),
            dimension: event.dimension.id,
            cancel: event.cancel
        }
    });
    if (cancelBreak) {
        cancelBreak = false;
        event.cancel = true;
    }
});
world.afterEvents.playerBreakBlock.subscribe((event) =>
    record('world.afterEvents.playerBreakBlock', {
        value: {
            block: event.block.typeId,
            broken: event.brokenBlockPermutation.type.id,
            player: event.player.name,
            before: stack(event.itemStackBeforeBreak),
            after: stack(event.itemStackAfterBreak),
            dimension: event.dimension.id
        }
    })
);

register('jsp', 'feedback', (test) => {
    start = system.currentTick;
    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Tester');
    player.setGameMode('Creative');
    const screen = player.onScreenDisplay;
    attempt('onScreenDisplay is the same object', () => player.onScreenDisplay === screen);
    attempt('onScreenDisplay isValid', () => screen.isValid);
    attempt('setTitle', () => screen.setTitle('Hello'));
    attempt('setTitle with options', () =>
        screen.setTitle(
            { rawtext: [{ text: 'Big' }] },
            { fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 5, subtitle: 'small' }
        )
    );
    attempt('setTitle with a negative stay', () =>
        screen.setTitle('Bad', { fadeInDuration: 0, stayDuration: -1, fadeOutDuration: 0 })
    );
    attempt('updateSubtitle', () => screen.updateSubtitle('later'));
    attempt('setActionBar', () => screen.setActionBar(['a', { text: 'b' }]));
    attempt('playSound', () => {
        const sound = player.playSound('random.orb', { volume: 0.5, pitch: 1.5 });
        return sound === undefined ? null : typeof sound;
    });
    attempt('playSound at a location', () => {
        player.playSound('random.orb', { location: player.location });
        return 'played';
    });
    attempt('dimension playSound', () => {
        const sound = player.dimension.playSound('random.pop', player.location, { volume: 2 });
        return { id: sound.id, soundEventId: sound.soundEventId, recipient: sound.recipient ?? null };
    });
    attempt('dimension playSound with a negative volume', () =>
        player.dimension.playSound('random.pop', player.location, { volume: -1 })
    );
    attempt('isSneaking', () => player.isSneaking);
    attempt('set isSneaking', () => {
        player.isSneaking = true;
        return player.isSneaking;
    });
    attempt('addEffect', () => {
        const added = player.addEffect('haste', 100, { amplifier: 1 });
        return added === undefined
            ? null
            : { typeId: added.typeId, amplifier: added.amplifier, duration: added.duration };
    });
    attempt('getEffects', () => player.getEffects().map((each) => each.typeId));

    attempt('useItem', () => player.useItem(new ItemStack('minecraft:stick')));

    /** A block of the test's structure, by its location in the structure. */
    const blockAt = (location) => test.getDimension().getBlock(test.worldBlockLocation(location));
    blockAt({ x: 1, y: 2, z: 2 }).setType('minecraft:stone');
    system.runTimeout(() => {
        attempt('set isSneaking a tick later', () => player.isSneaking);
    }, 2);
    system.runTimeout(() => {
        attempt('breakBlock', () => player.breakBlock({ x: 1, y: 2, z: 2 }));
        attempt('block right after breakBlock', () => blockAt({ x: 1, y: 2, z: 2 }).typeId);
    }, 4);
    system.runTimeout(() => {
        attempt('block 4 ticks after breakBlock', () => blockAt({ x: 1, y: 2, z: 2 }).typeId);
        record('removing');
        test.removeSimulatedPlayer(player);
        attempt('onScreenDisplay isValid after removal', () => screen.isValid);
        attempt('setTitle after removal', () => screen.setTitle('gone'));
        test.succeed();
        system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
    }, 8);
})
    .structureLocation({ x: 0, y: -60, z: 0 })
    .maxTicks(60);

record('ready for /gametest');
