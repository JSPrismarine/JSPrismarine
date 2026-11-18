/**
 * The `entity-event-options` scenario: which `entityHurt`, `entityDie` and `entityRemove`-free
 * after-events reach a subscriber that passes `EntityEventOptions`, by entity and by type. A pig
 * and a cow are spawned, hurt and killed, and each subscriber records what it gets.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'options';
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

const name = (entity) => entity.typeId.replace('minecraft:', '');

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const pig = overworld.spawnEntity('minecraft:pig', { x: 2.5, y: -60, z: 2.5 });
    const cow = overworld.spawnEntity('minecraft:cow', { x: -2.5, y: -60, z: 2.5 });
    record('spawned');

    world.afterEvents.entityHurt.subscribe((event) => record('hurt, no options', { value: name(event.hurtEntity) }));
    world.afterEvents.entityHurt.subscribe((event) => record('hurt, pig type', { value: name(event.hurtEntity) }), {
        entityTypes: ['minecraft:pig']
    });
    world.afterEvents.entityHurt.subscribe(
        (event) => record('hurt, cow without namespace', { value: name(event.hurtEntity) }),
        {
            entityTypes: ['cow']
        }
    );
    world.afterEvents.entityHurt.subscribe(
        (event) => record('hurt, the cow entity', { value: name(event.hurtEntity) }),
        {
            entities: [cow]
        }
    );
    world.afterEvents.entityHurt.subscribe(
        (event) => record('hurt, pig entity and cow type', { value: name(event.hurtEntity) }),
        {
            entities: [pig],
            entityTypes: ['minecraft:cow']
        }
    );
    world.afterEvents.entityHurt.subscribe((event) => record('hurt, empty lists', { value: name(event.hurtEntity) }), {
        entities: [],
        entityTypes: []
    });
    world.afterEvents.entityHurt.subscribe((event) => record('hurt, sheep type', { value: name(event.hurtEntity) }), {
        entityTypes: ['minecraft:sheep']
    });
    world.afterEvents.entityDie.subscribe((event) => record('die, pig type', { value: name(event.deadEntity) }), {
        entityTypes: ['minecraft:pig']
    });
    world.afterEvents.entityDie.subscribe((event) => record('die, the cow entity', { value: name(event.deadEntity) }), {
        entities: [cow]
    });
    attempt('subscribe with an unknown type', () => {
        world.afterEvents.entityHurt.subscribe(() => {}, { entityTypes: ['jsp:nothing'] });
        return 'subscribed';
    });

    system.runTimeout(() => {
        attempt('hurt the pig', () => pig.applyDamage(2));
        attempt('hurt the cow', () => cow.applyDamage(2));
    }, 2);
    system.runTimeout(() => {
        attempt('kill the pig', () => pig.kill());
        attempt('kill the cow', () => cow.kill());
    }, 4);
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 10);
});
