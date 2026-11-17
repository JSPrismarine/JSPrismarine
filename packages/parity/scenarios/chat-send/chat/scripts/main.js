/**
 * The `chat` pack of the `chat-send` scenario. A behavior pack scenario has no client to chat, so
 * the pack registers the GameTest `jsp:chat`, and the capture runs it with `/gametest run` once the
 * pack is ready. The test spawns a simulated player who sends two lines, and the pack cancels the
 * second in `world.beforeEvents.chatSend`, a beta event. `structures/jsp/chat.mcstructure` is the
 * test's 3 by 3 by 3 structure of air, which BDS loads even for a test with a structure location.
 *
 * Ticks are counted from the tick the test starts, which depends on when the console command
 * arrives.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { Player, system, world } from '@minecraft/server';
import { register } from '@minecraft/server-gametest';

const PACK = 'chat';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the test started. */
const record = (event, observed = {}) => {
    seq += 1;
    const tick = system.currentTick - start;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick, event, ...observed })}`);
};

world.beforeEvents.chatSend.subscribe((event) => {
    record('world.beforeEvents.chatSend', {
        value: {
            message: event.message,
            sender: event.sender instanceof Player ? event.sender.name : null,
            targets: event.targets === undefined ? null : event.targets.length
        }
    });
    if (event.message === 'cancel me') event.cancel = true;
});

world.afterEvents.chatSend.subscribe((event) => record('world.afterEvents.chatSend', { value: event.message }));

register('jsp', 'chat', (test) => {
    start = system.currentTick;
    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Chatter');
    record('chat hello');
    player.chat('hello');
    record('chat cancel me');
    player.chat('cancel me');
    record('chatted');
    test.succeed();
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
})
    .structureLocation({ x: 0, y: -60, z: 0 })
    .maxTicks(40);

record('ready for /gametest');
