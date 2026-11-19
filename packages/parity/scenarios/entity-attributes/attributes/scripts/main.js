/**
 * The `entity-attributes` scenario: the attribute components `getComponents` lists for a player,
 * an NPC and an armor stand, and the values of a player's hunger, saturation and exhaustion.
 *
 * A behavior pack scenario has no client, so the pack registers the GameTest `jsp:attributes`,
 * and the capture runs it with `/gametest run` once the pack is ready. Ticks are counted from the
 * tick the test starts. `structures/jsp/attributes.mcstructure` is a 3 by 3 by 3 structure of air.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system } from '@minecraft/server';
import { register } from '@minecraft/server-gametest';

const PACK = 'attributes';
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

/** The attribute components an entity lists. */
const attributes = (entity) =>
    entity
        .getComponents()
        .map((component) => component.typeId)
        .filter((id) => id.includes('movement') || id === 'minecraft:health' || id.startsWith('minecraft:player.'))
        .sort();

/** An attribute component's values, or null when the entity has none. */
const values = (component) =>
    component === undefined
        ? null
        : {
              currentValue: component.currentValue,
              defaultValue: component.defaultValue,
              effectiveMin: component.effectiveMin,
              effectiveMax: component.effectiveMax
          };

register('jsp', 'attributes', (test) => {
    start = system.currentTick;
    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Tester');
    const npc = test.spawn('minecraft:npc', { x: 0, y: 2, z: 0 });
    const stand = test.spawn('minecraft:armor_stand', { x: 2, y: 2, z: 2 });
    attempt('player attributes', () => attributes(player));
    attempt('npc attributes', () => attributes(npc));
    attempt('armor stand attributes', () => attributes(stand));
    for (const id of ['player.hunger', 'player.saturation', 'player.exhaustion']) {
        attempt(`player ${id}`, () => values(player.getComponent(id)));
    }
    attempt('npc health', () => values(npc.getComponent('health')));
    attempt('armor stand movement', () => values(stand.getComponent('movement')));
    record('removing');
    test.removeSimulatedPlayer(player);
    npc.remove();
    stand.remove();
    test.succeed();
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
})
    .structureLocation({ x: 0, y: -60, z: 0 })
    .maxTicks(40);

record('ready for /gametest');
