import { describe, expect, it } from 'vitest';

import * as Blocks from './Blocks';
import { BlockRuntimeIds } from './state/BlockRuntimeIds';
import { BlockStateSchemas } from './state/BlockStateSchema';

/** Every block class JSPrismarine registers at startup, instantiated as BlockManager does. */
const registeredBlocks = () => Object.values(Blocks).map((Block) => new (Block as any)());

describe('block', () => {
    describe('registered blocks', () => {
        // Bedrock renames blocks between versions - `grass` became `grass_block`, `bricks`
        // became `brick_block`, `red_flower` became `poppy`. A registered block whose state
        // name no longer exists has no runtime id, so it cannot be placed at all: this is
        // what turns the next rename into a failing test instead of a crash during world
        // generation, one block at a time.
        it('all map to a state the catalogue knows', () => {
            const withoutSchema = registeredBlocks()
                .map((block) => block.getStateName())
                .filter((name: string) => BlockStateSchemas.get(name) === null)
                .sort();

            expect(withoutSchema).toEqual([]);
        });

        it('all can be given a runtime id', () => {
            for (const block of registeredBlocks()) {
                expect(() => BlockRuntimeIds.getByName(block.getStateName())).not.toThrow();
            }
        });

        it('registers no two blocks under one name', () => {
            const names = registeredBlocks().map((block) => block.getName());
            expect(names.length).toBe(new Set(names).size);
        });

        it('lets several blocks share one vanilla state, as the beds do', () => {
            // Sixteen coloured beds are sixteen blocks here and one `minecraft:bed` on the
            // wire, because Bedrock keeps the colour in the block entity rather than the
            // state. Separating the two names is what makes that expressible.
            const beds = registeredBlocks().filter(
                (block) => block.getName().endsWith('_bed') || block.getName() === 'minecraft:bed'
            );

            expect(beds.length).toBeGreaterThan(1);
            expect(new Set(beds.map((block) => block.getStateName()))).toEqual(new Set(['minecraft:bed']));
        });
    });
});
