/**
 * Verifies a client's placement takes the state Java's getStateForPlacement gives it: a ladder
 * clicked onto a wall faces away from that wall, and a sign clicked onto a floor stands turned
 * toward the player.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3, waitTicks } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

const BLOCK_REPLY = /Found the block at|The block is |The \w+ state does not match|That chunk is not loaded/;
const FIXTURE_X = 88;

/** Reads one block through the server console. */
const blockAt = (server: Context['server'], x: number, y: number, z: number, expected: string): Promise<string> => {
    const reply = server.waitForLine(BLOCK_REPLY, 10_000);
    server.command(`testforblock ${x} ${y} ${z} ${expected}`);
    return reply;
};

/** Right clicks with hotbar slot 1 until a block of `identifier` stands at the target. */
const placeUntil = async (
    { client, server }: Context,
    target: { x: number; y: number; z: number },
    identifier: string
): Promise<string> => {
    await client.input({ hotbar: 1 });
    await waitTicks(server, 6);
    let reply = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await client.input({ press: ['MouseRight'], press_frames: 1 });
        await sleep(100);
        await client.input({ release: ['MouseRight'] });
        await waitTicks(server, 8);
        reply = await blockAt(server, target.x, target.y, target.z, identifier);
        if (/Found the block at/.test(reply)) break;
    }
    await client.input({ release_all: true });
    return reply;
};

export const wallPlacement: Scenario = {
    name: 'wall-placement',
    description:
        'a ladder clicked onto a wall faces away from it, and a sign clicked onto a floor stands facing the player',
    run: async (context) => {
        const { client, server, playerName, log } = context;
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        server.command(`setblock ${FIXTURE_X} 63 0 minecraft:stone`);
        server.command(`setblock ${FIXTURE_X} 64 2 minecraft:stone`);
        server.command(`setblock ${FIXTURE_X} 65 3 minecraft:stone`);
        server.command(`teleport ${playerName} ${FIXTURE_X + 0.5} 64 0.5`);

        const deadline = Date.now() + 15_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - (FIXTURE_X + 0.5), feet[1] - 64, feet[2] - 0.5) < 1) break;
            assert.ok(Date.now() < deadline, `client did not arrive at the fixture; still at ${feet.join(', ')}`);
            await sleep(250);
        }

        // Looking south, nearly level, the ray meets the north face of the stone at z 3.
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:ladder 4`);
        await client.input({ look: { yaw: 0, pitch: 5, frames: 0 } });
        const ladder = await placeUntil(context, { x: FIXTURE_X, y: 65, z: 2 }, 'minecraft:ladder');
        assert.match(ladder, /Found the block at/, `right click did not place a ladder: ${ladder}`);
        const facing = await blockAt(server, FIXTURE_X, 65, 2, 'minecraft:ladder ["facing_direction"=2]');
        assert.match(facing, /Found the block at/, `a ladder clicked onto a south wall should face north: ${facing}`);
        log('a ladder clicked onto a wall faces away from it');

        // Looking down at the top of the stone at z 2, the sign stands on it and faces north,
        // back toward the player looking south.
        server.command(`setblock ${FIXTURE_X} 65 2 minecraft:air`);
        server.command(`setblock ${FIXTURE_X} 65 3 minecraft:air`);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:oak_sign 4`);
        await client.input({ look: { yaw: 0, pitch: 21, frames: 0 } });
        const sign = await placeUntil(context, { x: FIXTURE_X, y: 65, z: 2 }, 'minecraft:standing_sign');
        assert.match(sign, /Found the block at/, `right click did not stand a sign on the floor: ${sign}`);
        const turned = await blockAt(server, FIXTURE_X, 65, 2, 'minecraft:standing_sign ["ground_sign_direction"=8]');
        assert.match(turned, /Found the block at/, `a sign placed looking south should face north: ${turned}`);
        log('a sign clicked onto a floor stands facing the player');

        server.command(`fill ${FIXTURE_X} 63 0 ${FIXTURE_X} 65 3 minecraft:air`);
    }
};
