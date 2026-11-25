/**
 * Verifies `/fill … replace <filter>` replaces only the blocks the filter names.
 *
 * The tree used to read no filter after `replace`, so the command filled the whole region and a
 * search for portal blocks with `fill … replace minecraft:portal` wrote portals everywhere.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';

/** A row of four blocks above the flat world's surface: two stone, then two obsidian. */
const ROW = { y: -58, z: 12, from: 12, to: 15 } as const;

export const fillReplaceFilter: Scenario = {
    name: 'fill-replace-filter',
    description: '/fill … replace <filter> replaces only the blocks that match the filter',
    run: async ({ client, server, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        const { y, z, from, to } = ROW;

        const answer = (pattern: RegExp, line: string) => {
            const answered = server.waitForLine(pattern, 10_000);
            server.command(line);
            return answered;
        };

        await answer(/Filled 2 blocks/, `fill ${from} ${y} ${z} ${from + 1} ${y} ${z} minecraft:stone`);
        await answer(/Filled 2 blocks/, `fill ${from + 2} ${y} ${z} ${to} ${y} ${z} minecraft:obsidian`);

        // Obsidian over obsidian changes nothing, as Bedrock and Java both report.
        const same = await answer(
            /Filled \d+ blocks|No blocks|Could not/,
            `fill ${from} ${y} ${z} ${to} ${y + 1} ${z} minecraft:obsidian replace minecraft:obsidian`
        );
        assert.doesNotMatch(same, /Filled [1-9]/, `obsidian replacing obsidian changed blocks: ${same}`);

        const replaced = await answer(
            /Filled \d+ blocks|No blocks|Could not/,
            `fill ${from} ${y} ${z} ${to} ${y + 1} ${z} minecraft:dirt replace minecraft:stone`
        );
        assert.match(replaced, /Filled 2 blocks/, `only the two stone blocks became dirt: ${replaced}`);

        const checked = server.waitForLine(/fill-replace-filter-checked/, 10_000);
        for (let x = from; x <= to; x += 1) {
            const wanted = x < from + 2 ? 'minecraft:dirt' : 'minecraft:obsidian';
            server.command(`execute unless block ${x} ${y} ${z} ${wanted} run say fill-replace-filter-wrong ${x}`);
        }
        server.command(
            `execute unless block ${from} ${y + 1} ${z} minecraft:air run say fill-replace-filter-wrong air`
        );
        server.command('say fill-replace-filter-checked');
        await checked;
        assert.ok(
            !server.lines.some((line) => line.includes('fill-replace-filter-wrong')),
            'a block the filter does not name changed'
        );

        server.command(`fill ${from} ${y} ${z} ${to} ${y} ${z} minecraft:air`);
        log('the fill replaced the two stone blocks and left the obsidian and the air alone');
    }
};
