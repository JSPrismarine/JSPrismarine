/**
 * Verifies pointed dripstone a client places stands on the floor it was clicked onto, and that a
 * stalactite whose ceiling goes falls as falling blocks and breaks where it lands.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3, waitTicks } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

const BLOCK_REPLY = /Found the block at|The block is |The \w+ state does not match|That chunk is not loaded/;
const ENTITY_REPLY = /Found \d+ entit(?:y|ies)|No entity was found/;
/** The ceiling the stalactite hangs from: high enough that its fall outlasts a console round trip. */
const CEILING_Y = 90;
const FIXTURE_X = 80;
/** The column the stalactite falls down, beside the placement fixture. */
const COLUMN = { x: FIXTURE_X, z: 6 };

/** Reads one block through the server console. */
const blockAt = (server: Context['server'], x: number, y: number, z: number, expected: string): Promise<string> => {
    const reply = server.waitForLine(BLOCK_REPLY, 10_000);
    server.command(`testforblock ${x} ${y} ${z} ${expected}`);
    return reply;
};

export const dripstone: Scenario = {
    name: 'dripstone',
    description: 'placed pointed dripstone points up from a floor, and a stalactite falls when its ceiling goes',
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        server.command(`setblock ${FIXTURE_X} 63 0 minecraft:stone`);
        server.command(`setblock ${FIXTURE_X} 64 2 minecraft:stone`);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:pointed_dripstone 4`);
        server.command(`teleport ${playerName} ${FIXTURE_X + 0.5} 64 0.5`);

        const deadline = Date.now() + 15_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - (FIXTURE_X + 0.5), feet[1] - 64, feet[2] - 0.5) < 1) break;
            assert.ok(Date.now() < deadline, `client did not arrive at the fixture; still at ${feet.join(', ')}`);
            await sleep(250);
        }
        // Looking down at the top of the stone, as a player building a stalagmite does.
        await client.input({ look: { yaw: 0, pitch: 21, frames: 0 } });
        await client.input({ hotbar: 1 });
        await waitTicks(server, 6);

        let placed = '';
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await client.input({ press: ['MouseRight'], press_frames: 1 });
            await sleep(100);
            await client.input({ release: ['MouseRight'] });
            await waitTicks(server, 8);
            placed = await blockAt(server, FIXTURE_X, 65, 2, 'minecraft:pointed_dripstone');
            if (/Found the block at/.test(placed)) break;
        }
        assert.match(placed, /Found the block at/, `right click did not place pointed dripstone: ${placed}`);
        const standing = await blockAt(
            server,
            FIXTURE_X,
            65,
            2,
            'minecraft:pointed_dripstone ["hanging"=false,"dripstone_thickness"="tip"]'
        );
        assert.match(standing, /Found the block at/, `dripstone placed on a floor should point up: ${standing}`);
        log('pointed dripstone placed on a floor stands as a stalagmite');
        await client.input({ release_all: true });

        // A two-segment stalactite high over a stone floor. Falling, it shows as two falling block
        // entities for the whole drop; breaking where it hung, it never makes one.
        server.command(`setblock ${COLUMN.x} 64 ${COLUMN.z} minecraft:stone`);
        server.command(`setblock ${COLUMN.x} ${CEILING_Y} ${COLUMN.z} minecraft:stone`);
        server.command(
            `setblock ${COLUMN.x} ${CEILING_Y - 1} ${COLUMN.z} minecraft:pointed_dripstone ["hanging"=true,"dripstone_thickness"="base"]`
        );
        server.command(
            `setblock ${COLUMN.x} ${CEILING_Y - 2} ${COLUMN.z} minecraft:pointed_dripstone ["hanging"=true,"dripstone_thickness"="tip"]`
        );
        server.command('kill @e[type=item]');
        await waitTicks(server, 4);
        server.command(`setblock ${COLUMN.x} ${CEILING_Y} ${COLUMN.z} minecraft:air`);
        await waitTicks(server, 6);

        const falling = server.waitForLine(ENTITY_REPLY, 10_000);
        server.command('testfor @e[type=minecraft:falling_block]');
        assert.match(await falling, /Found 2 entities/, 'the stalactite did not turn into two falling blocks');
        await waitTicks(server, 80);

        for (let y = CEILING_Y - 1; y >= 65; y -= 1) {
            const empty = await blockAt(server, COLUMN.x, y, COLUMN.z, 'minecraft:air');
            assert.match(empty, /Found the block at/, `the stalactite was left at y ${y}: ${empty}`);
        }
        const landed = server.waitForLine(ENTITY_REPLY, 10_000);
        server.command('testfor @e[type=minecraft:falling_block]');
        assert.match(await landed, /No entity was found|Found 0/, 'a falling stalactite never landed');
        const items = server.waitForLine(ENTITY_REPLY, 10_000);
        server.command('testfor @e[type=minecraft:item]');
        // Two pointed dripstone items lying together may merge into one stack, so any count passes.
        assert.match(await items, /Found [1-9]\d* entit/, 'the stalactite did not break into items where it landed');
        log('a stalactite whose ceiling was removed fell as falling blocks and broke into items where it landed');

        server.command(`fill ${FIXTURE_X} 63 0 ${FIXTURE_X} ${CEILING_Y} ${COLUMN.z} minecraft:air`);
        server.command('kill @e[type=item]');
    }
};
