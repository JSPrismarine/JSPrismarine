/** Verifies the client draws a dropped stack on a slab half a block lower than one on a full block (#3097). */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { vec3, waitTicks } from '../scenario.mts';

/** The heights of the item actors the client draws within a block of a column, lowest first. */
const itemHeightsAt = (state: Record<string, unknown>, x: number, z: number): number[] => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors
        .flatMap((actor: unknown) => {
            if (typeof actor !== 'object' || actor === null || !('type' in actor) || actor.type !== 'minecraft:item')
                return [];
            const position = 'position' in actor ? actor.position : undefined;
            if (!Array.isArray(position) || position.length < 3) return [];
            const [ax, ay, az] = position;
            if (typeof ax !== 'number' || typeof ay !== 'number' || typeof az !== 'number') return [];
            return Math.hypot(ax - x, az - z) < 1 ? [ay] : [];
        })
        .sort((left, right) => left - right);
};

export const itemRestShape: Scenario = {
    name: 'item-rest-shape',
    description: 'a stack dropped on a bottom slab rests half a block lower than one dropped on a full block',
    run: async ({ client, server, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        server.command('kill @e[type=item]');

        // A full block and a bottom slab side by side, three blocks ahead, on the flat floor.
        const feet = vec3(await client.state(), 'feet');
        const [x, y, z] = [Math.floor(feet[0]), Math.floor(feet[1]), Math.floor(feet[2]) + 3];
        // Clear the air the stacks fall through. Earlier scenarios in the suite build on these
        // blocks: mining-drops leaves its stone ceiling two above the floor here, which would catch
        // the stack meant for the stone.
        server.command(`fill ${x} ${y + 1} ${z} ${x + 2} ${y + 4} ${z} minecraft:air`);
        server.command(`setblock ${x} ${y} ${z} minecraft:stone`);
        server.command(`setblock ${x + 2} ${y} ${z} minecraft:oak_slab`);
        // What mining this block would drop is what falls on each.
        server.command(`setblock ${x + 4} ${y} ${z} minecraft:dirt`);
        await waitTicks(server, 2);

        // One dirt stack falls onto each from two blocks up.
        server.command(`loot spawn ${x + 0.5} ${y + 3} ${z + 0.5} mine ${x + 4} ${y} ${z}`);
        server.command(`loot spawn ${x + 2.5} ${y + 3} ${z + 0.5} mine ${x + 4} ${y} ${z}`);

        // Both settle within a couple of seconds; wait until the client draws each still across
        // server ticks, so a stalled server cannot pass two samples of a stack still in the air.
        const deadline = Date.now() + 60_000;
        let onStone: number[] = [];
        let onSlab: number[] = [];
        let previous: string | undefined;
        for (;;) {
            const state = await client.state();
            onStone = itemHeightsAt(state, x + 0.5, z + 0.5);
            onSlab = itemHeightsAt(state, x + 2.5, z + 0.5);
            const now = JSON.stringify([onStone, onSlab]);
            if (onStone.length === 1 && onSlab.length === 1 && now === previous) break;
            assert.ok(Date.now() < deadline, `the two stacks never settled: stone ${onStone}, slab ${onSlab}`);
            previous = now;
            await waitTicks(server, 10);
        }

        // Whatever offset the client draws an item at, it is the same on both blocks.
        const drop = (onStone[0] ?? Number.NaN) - (onSlab[0] ?? Number.NaN);
        assert.ok(Math.abs(drop - 0.5) < 0.02, `the stack on the slab sat ${drop} below the one on stone, not 0.5`);
        log(`the stack on the slab rests ${drop.toFixed(3)} below the one on the full block`);
    }
};
