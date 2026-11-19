/**
 * The `world-events` scenario: the world events a script's own actions raise on a server with no
 * player. A pig gets a status effect, a blow and a removal, and a game rule is set. Each
 * subscriber records what it reads.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'events';
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

const pigs = { entityTypes: ['minecraft:pig'] };

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const pig = overworld.spawnEntity('minecraft:pig', { x: 2.5, y: -60, z: 2.5 });
    record('spawned');

    world.beforeEvents.effectAdd.subscribe((event) => {
        record('before effectAdd', { value: [event.entity.typeId, event.effectType, event.duration] });
        event.duration = 40;
    });
    world.afterEvents.effectAdd.subscribe((event) => {
        record('after effectAdd', {
            value: [event.entity.typeId, event.effect.typeId, event.effect.duration, event.effect.amplifier]
        });
    }, pigs);
    world.beforeEvents.entityHurt.subscribe((event) => {
        record('before entityHurt', { value: [event.hurtEntity.typeId, event.damage, event.damageSource.cause] });
    });
    world.afterEvents.entityHealthChanged.subscribe((event) => {
        record('after entityHealthChanged', { value: [event.entity.typeId, event.oldValue, event.newValue] });
    }, pigs);
    world.afterEvents.gameRuleChange.subscribe((event) => {
        record('after gameRuleChange', { value: [event.rule, event.value] });
    });
    world.beforeEvents.entityRemove.subscribe((event) => {
        record('before entityRemove', { value: [event.removedEntity.typeId, event.removedEntity.isValid] });
    });
    world.afterEvents.entityRemove.subscribe((event) => {
        record('after entityRemove', { value: [event.typeId, event.removedEntityId === pig.id] });
    }, pigs);

    system.runTimeout(() => attempt('add speed', () => pig.addEffect('speed', 200).duration), 2);
    system.runTimeout(() => attempt('hurt the pig', () => pig.applyDamage(3)), 4);
    system.runTimeout(
        () => attempt('set a game rule', () => overworld.runCommand('gamerule dodaylightcycle false').successCount),
        6
    );
    system.runTimeout(() => attempt('remove the pig', () => pig.remove()), 8);
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 12);
});
