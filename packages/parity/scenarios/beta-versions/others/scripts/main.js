/**
 * The `others` pack of the `beta-versions` scenario. It declares the stable `@minecraft/server` beside the beta of every other module the default `permissions.json` allows, each at the version the pinned server ships.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import * as server from '@minecraft/server';
import { system } from '@minecraft/server';
import * as ui from '@minecraft/server-ui';
import * as gametest from '@minecraft/server-gametest';
import * as admin from '@minecraft/server-admin';
import * as debugUtilities from '@minecraft/debug-utilities';

const PACK = 'others';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

record('@minecraft/server exports', { value: Object.keys(server).length });
record('@minecraft/server-ui exports', { value: Object.keys(ui).length });
record('@minecraft/server-gametest exports', { value: Object.keys(gametest).length });
record('@minecraft/server-admin exports', { value: Object.keys(admin).length });
record('@minecraft/debug-utilities exports', { value: Object.keys(debugUtilities).length });

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
