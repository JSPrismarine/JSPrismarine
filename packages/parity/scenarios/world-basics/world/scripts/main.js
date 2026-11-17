/**
 * The `world-basics` scenario: the world, system and dimension members a pack uses before any
 * player joins, and `system.afterEvents.scriptEventReceive`, which a `/scriptevent` that the
 * script runs itself raises. Everything runs from a task due at tick 40, once the spawn chunks
 * have loaded.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { Dimension, system, world } from '@minecraft/server';

const PACK = 'world';
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

system.afterEvents.scriptEventReceive.subscribe((event) => {
    record('system.afterEvents.scriptEventReceive', {
        value: {
            id: event.id,
            message: event.message,
            sourceType: event.sourceType,
            sourceEntity: event.sourceEntity === undefined ? null : event.sourceEntity.typeId,
            sourceBlock: event.sourceBlock === undefined ? null : event.sourceBlock.typeId,
            initiator: event.initiator === undefined ? null : event.initiator.typeId
        }
    });
});

system.runTimeout(() => {
    attempt('world.getAllPlayers', () => world.getAllPlayers().length);
    attempt('world.getPlayers', () => world.getPlayers().length);
    attempt('world.getPlayers by name', () => world.getPlayers({ name: 'nobody' }).length);
    attempt('world.getDimension overworld', () => world.getDimension('overworld').id);
    attempt('world.getDimension minecraft:nether', () => world.getDimension('minecraft:nether').id);
    attempt('world.getDimension the_end', () => world.getDimension('the_end').id);
    attempt('world.getDimension unknown', () => world.getDimension('nowhere').id);
    attempt('the same Dimension object', () => world.getDimension('overworld') === world.getDimension('overworld'));
    attempt('a Dimension instance', () => world.getDimension('overworld') instanceof Dimension);
    attempt('system.currentTick is a number', () => typeof system.currentTick);
    const overworld = world.getDimension('overworld');
    attempt(
        'Dimension.runCommand scriptevent',
        () => overworld.runCommand('scriptevent jsp:hello hi there').successCount
    );
    attempt(
        'Dimension.runCommand scriptevent without a namespace',
        () => overworld.runCommand('scriptevent hello hi').successCount
    );
    attempt('Dimension.runCommand say', () => overworld.runCommand('say hello').successCount);
    attempt('Dimension.runCommand an unknown command', () => overworld.runCommand('jspnosuchcommand').successCount);
    attempt('Dimension.runCommand a bad argument', () => overworld.runCommand('time set nonsense').successCount);
    attempt('Dimension.runCommand with a slash', () => overworld.runCommand('/time query daytime').successCount);
    record('commands ran');
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
}, 40);
