/**
 * Verifies a run of redstone dust connects, carries its signal one level less per block into the
 * lamp at its end, and goes dark with the lamp when its source is taken away.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';

import type { Scenario } from '../scenario.mts';
import { lookTo, placeBlockAndWait, standAt, testForBlock, untilTicks, waitTicks } from '../scenario.mts';

const FIXTURE_X = 96;
const ROW_Z = 2;
const SOURCE = { x: FIXTURE_X, y: 64, z: ROW_Z };
const DUST = [1, 2, 3].map((step) => ({ x: FIXTURE_X + step, y: 64, z: ROW_Z }));
const LAMP = { x: FIXTURE_X + 4, y: 64, z: ROW_Z };

/** How many ticks the circuit gets to settle; Bedrock turns a lamp off four ticks late. */
const SETTLE_TICKS = 40;

export const redstoneDust: Scenario = {
    name: 'redstone-dust',
    description:
        'a run of redstone dust connects, fades one level a block into the lamp at its end, and goes dark when its source is removed',
    run: async (context) => {
        const { client, server, playerName, artifacts, log } = context;
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        // The fixture is six chunks from the spawn, and `setblock` into a chunk the server has not
        // loaded is dropped. Stand there first so the chunks load, then build.
        server.command(`gamemode creative ${playerName}`);
        server.command(`teleport ${playerName} ${FIXTURE_X + 2.5} 64 0.5`);
        await waitTicks(server, 40);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);

        await placeBlockAndWait(server, { x: FIXTURE_X + 2, y: 63, z: 0 }, 'minecraft:stone');
        for (let step = 0; step <= 4; step++)
            await placeBlockAndWait(server, { x: FIXTURE_X + step, y: 63, z: ROW_Z }, 'minecraft:stone');
        await placeBlockAndWait(server, LAMP, 'minecraft:redstone_lamp');
        for (const at of DUST) await placeBlockAndWait(server, at, 'minecraft:redstone_wire');
        await standAt(context, { x: FIXTURE_X + 2.5, y: 64, z: 0.5 });
        // Look down at the run, two blocks ahead, for the screenshot.
        await lookTo(client, 0, 50);

        const found = async (at: typeof SOURCE, block: string): Promise<boolean> =>
            /Found the block at/.test(await testForBlock(server, at, block));

        await placeBlockAndWait(server, SOURCE, 'minecraft:redstone_block');
        for (const [index, at] of DUST.entries()) {
            const signal = 15 - index;
            const carries = await untilTicks(server, SETTLE_TICKS, () =>
                found(at, `minecraft:redstone_wire ["redstone_signal"=${signal}]`)
            );
            assert.ok(carries, `the dust ${index + 1} block from the source carries ${signal}`);
        }
        assert.ok(
            await untilTicks(server, SETTLE_TICKS, () => found(LAMP, 'minecraft:lit_redstone_lamp')),
            'the lamp at the end of the run lights'
        );
        // Each dust in the run is drawn along it, which is what the client renders as connected. The
        // shape is checked once the circuit has run: like Java's, `setblock` writes the dust with no
        // shape update, and a dust takes its shape when something beside it changes.
        for (const at of DUST) {
            const line =
                'minecraft:redstone_wire ["redstone_east"="side","redstone_west"="side","redstone_north"="none","redstone_south"="none"]';
            assert.ok(await found(at, line), `the dust at ${at.x} ${at.y} ${at.z} is drawn along the run`);
        }

        await client.screenshot(join(artifacts, 'redstone-dust-lit.png'));

        await placeBlockAndWait(server, SOURCE, 'minecraft:air');
        for (const at of DUST) {
            const dark = await untilTicks(server, SETTLE_TICKS, () =>
                found(at, 'minecraft:redstone_wire ["redstone_signal"=0]')
            );
            assert.ok(dark, `the dust at ${at.x} ${at.y} ${at.z} goes dark once its source is removed`);
        }
        assert.ok(
            await untilTicks(server, SETTLE_TICKS, () => found(LAMP, 'minecraft:redstone_lamp')),
            'the lamp goes out with the dust'
        );
        log('the dust lit the lamp at its end and went dark with it once the source was removed');
    }
};
