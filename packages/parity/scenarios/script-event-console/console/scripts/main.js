/**
 * The `script-event-console` scenario: `system.afterEvents.scriptEventReceive` for `/scriptevent`
 * typed on the server console, and for one with an id BDS refuses. The runner types the commands
 * once the pack records `ready for the console`, whenever the capture gets to it, so every record
 * is stamped tick 0.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'console';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: 0, event, ...observed })}`);
};

system.afterEvents.scriptEventReceive.subscribe((event) => {
    record('scriptEventReceive', {
        value: {
            id: event.id,
            message: event.message,
            sourceType: event.sourceType,
            sourceEntity: event.sourceEntity === undefined,
            sourceBlock: event.sourceBlock === undefined,
            initiator: event.initiator === undefined
        }
    });
    if (event.id === 'jsp:last') {
        system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
    }
});

world.afterEvents.worldLoad.subscribe(() => {
    system.runTimeout(() => {
        record('ready for the console');
    }, 20);
});
