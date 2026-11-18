/**
 * The `entity-events` scenario: `world.afterEvents.entitySpawn`, `entityHurt` and `entityDie` for
 * entities a script spawns, summons, hurts and kills. Mob loot is off, so no item or experience
 * orb spawns. Everything runs once the chunk at the origin has loaded, on the flat world's grass
 * at y -61.
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

/** The entities the scenario made, by the name it gives each, so an event can name them. */
const named = new Map();
const nameOf = (entity) => {
    if (entity === undefined) return null;
    for (const [name, each] of named) if (each === entity) return name;
    return entity.typeId;
};

/** A damage source as plain data. */
const source = ({ cause, damagingEntity, damagingProjectile }) => ({
    cause,
    damagingEntity: nameOf(damagingEntity),
    damagingProjectile: nameOf(damagingProjectile)
});

let watching = false;

world.afterEvents.entitySpawn.subscribe((event) => {
    if (!watching) return;
    record('entitySpawn', { value: { typeId: event.entity.typeId, cause: event.cause } });
});
world.afterEvents.entityHurt.subscribe((event) => {
    if (!watching) return;
    record('entityHurt', {
        value: { hurtEntity: nameOf(event.hurtEntity), damage: event.damage, damageSource: source(event.damageSource) }
    });
});
world.afterEvents.entityDie.subscribe((event) => {
    if (!watching) return;
    record('entityDie', {
        value: {
            deadEntity: nameOf(event.deadEntity),
            typeId: event.deadEntity.typeId,
            isValid: event.deadEntity.isValid,
            damageSource: source(event.damageSource)
        }
    });
});

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
    overworld.runCommand('gamerule domobloot false');
    watching = true;
    const stand = overworld.spawnEntity('minecraft:armor_stand', { x: 0.5, y: -60, z: 0.5 });
    named.set('stand', stand);
    const pig = overworld.spawnEntity('minecraft:pig', { x: 4.5, y: -60, z: 4.5 });
    named.set('pig', pig);
    const other = overworld.spawnEntity('minecraft:pig', { x: -4.5, y: -60, z: -4.5 });
    named.set('other pig', other);
    record('spawned');
    attempt('summon', () => overworld.runCommand('summon minecraft:armor_stand 3 -60 -3').successCount);
    system.runTimeout(() => {
        attempt('applyDamage', () => pig.applyDamage(3));
        attempt('applyDamage by an entity', () => pig.applyDamage(2, { cause: 'entityAttack', damagingEntity: stand }));
        attempt('applyDamage of nothing', () => pig.applyDamage(0));
        attempt('applyDamage a fatal fall', () => pig.applyDamage(100, { cause: 'fall' }));
        attempt('applyDamage a dead entity', () => pig.applyDamage(1));
        attempt('kill', () => stand.kill());
        attempt('kill a pig', () => other.kill());
        record('hurt');
        system.runTimeout(() => {
            attempt('isValid of the dead pig', () => pig.isValid);
            watching = false;
            console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
        }, 10);
    }, 2);
});
