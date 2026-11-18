/**
 * The `entity-effects` scenario: `Entity.addEffect`, `getEffect`, `getEffects` and
 * `removeEffect` on a pig, an `Effect`'s members a few ticks later, and a `MolangVariableMap`
 * passed to `Dimension.spawnParticle`. Everything runs once the chunk at the origin has loaded.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { MolangVariableMap, system, world } from '@minecraft/server';

const PACK = 'effects';
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

/** An effect as plain data, or null for none. */
const effect = (found) =>
    found === undefined
        ? null
        : {
              typeId: found.typeId,
              amplifier: found.amplifier,
              duration: found.duration,
              displayName: found.displayName
          };

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const pig = overworld.spawnEntity('minecraft:pig', { x: 2.5, y: -60, z: 2.5 });
    attempt('getEffects of a new pig', () => pig.getEffects().length);
    attempt('addEffect speed', () => effect(pig.addEffect('speed', 200)));
    attempt('addEffect minecraft:slowness with options', () =>
        effect(pig.addEffect('minecraft:slowness', 100, { amplifier: 2, showParticles: false }))
    );
    attempt('addEffect a weaker speed', () => effect(pig.addEffect('speed', 50, { amplifier: 0 })));
    attempt('addEffect a stronger speed', () => effect(pig.addEffect('speed', 60, { amplifier: 3 })));
    attempt('addEffect unknown', () => pig.addEffect('jsp:nothing', 20));
    attempt('addEffect duration 0', () => pig.addEffect('speed', 0));
    attempt('addEffect amplifier 300', () => pig.addEffect('speed', 20, { amplifier: 300 }));
    attempt('getEffect speed', () => effect(pig.getEffect('speed')));
    attempt('getEffect minecraft:speed', () => effect(pig.getEffect('minecraft:speed')));
    attempt('getEffect absent', () => effect(pig.getEffect('poison')));
    attempt('getEffect unknown', () => pig.getEffect('jsp:nothing'));
    attempt('getEffects', () => pig.getEffects().map(effect));
    attempt('removeEffect slowness', () => pig.removeEffect('slowness'));
    attempt('removeEffect slowness again', () => pig.removeEffect('slowness'));
    attempt('removeEffect unknown', () => pig.removeEffect('jsp:nothing'));

    const molang = new MolangVariableMap();
    attempt('setFloat', () => molang.setFloat('variable.size', 2));
    attempt('setVector3', () => molang.setVector3('variable.direction', { x: 0, y: 1, z: 0 }));
    attempt('setColorRGB', () => molang.setColorRGB('variable.color', { red: 1, green: 0.5, blue: 0 }));
    attempt('setColorRGBA', () => molang.setColorRGBA('variable.tint', { red: 1, green: 0.5, blue: 0, alpha: 0.25 }));
    attempt('setSpeedAndDirection', () => molang.setSpeedAndDirection('variable.motion', 3, { x: 1, y: 0, z: 0 }));
    attempt('setFloat without a number', () => molang.setFloat('variable.size'));
    attempt('setColorRGB with a vector', () => molang.setColorRGB('variable.color', { x: 1, y: 0, z: 0 }));
    attempt('spawnParticle with the map', () =>
        overworld.spawnParticle('minecraft:basic_flame_particle', { x: 0.5, y: -59, z: 0.5 }, molang)
    );
    attempt('spawnParticle without a map', () =>
        overworld.spawnParticle('minecraft:basic_flame_particle', { x: 0.5, y: -59, z: 0.5 })
    );
    attempt('spawnParticle unloaded', () =>
        overworld.spawnParticle('minecraft:basic_flame_particle', { x: 5000, y: -59, z: 5000 })
    );

    system.runTimeout(() => {
        attempt('getEffect speed 5 ticks later', () => effect(pig.getEffect('speed')));
        attempt('getEffect slowness 5 ticks later', () => effect(pig.getEffect('slowness')));
        pig.kill();
        attempt('getEffects of a dead pig', () => pig.getEffects().length);
        system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 2);
    }, 5);
});
