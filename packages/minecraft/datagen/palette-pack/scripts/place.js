/**
 * Puts one of every block type into the world, so that the save carries their network states.
 *
 * A saved sub chunk stores its palette as NBT: a block's name and the states that go with it,
 * in the form the *network* uses. That is the half of the catalogue the Script API cannot be
 * asked for - it reports a flattened block's legacy properties as well, and from inside the
 * game there is no way to tell which of them the wire carries.
 *
 * Placed at a fixed height in a square around the origin, inside a ticking area added first:
 * a block cannot be written into a chunk nobody has loaded, and at server start nothing is.
 *
 * Placed three times, in three settings, because a block placed where it cannot stand pops
 * before the world is saved and is then simply not in the catalogue. Which blocks those are
 * depends on the tick order and changed from one run to the next - seventeen went missing
 * once, seven another time. Every block is happy in at least one of the three:
 *
 * - on stone, under a roof two blocks up: most of them, and doors, whose upper half goes in
 *   the gap;
 * - on farmland: the stems, which grow on nothing else, and the flowers, which do not mind;
 * - on stone directly under a roof: the vines, which hang, and the buttons, which by default
 *   are attached to the block above them;
 * - on stone with a stone block to the west of each: the wall fans, which attach to a side,
 *   and had been losing theirs to whatever neighbour the grid happened to give them.
 *
 * The extractor merges by name, so a block that survived anywhere is in.
 */

import { system, world, BlockTypes, BlockPermutation } from '@minecraft/server';

const line = (s) => console.warn(`PALETTE ${s}`);

/** High enough to be above the terrain of any generator, low enough to be a legal height. */
const Y = 100;
const SIDE = 40;
const ORIGIN = -20;

/** Ticks to wait: one for the world to exist, one for the ticking area to have loaded. */
const BEFORE_AREA = 40;
const BEFORE_PLACING = 200;

/** The settings, each a strip of rows south of the previous one. */
const SETTINGS = [
    { floor: 'minecraft:stone', roof: 2, spacing: 1 },
    { floor: 'minecraft:farmland', roof: 2, spacing: 1 },
    { floor: 'minecraft:stone', roof: 1, spacing: 1 },
    { floor: 'minecraft:stone', roof: 2, spacing: 2 }
];
const ROOF = 'minecraft:stone';
const WALL = 'minecraft:stone';

/** How many rows a setting takes: the types, in columns `spacing` apart, plus a margin. */
const rows = (setting) => Math.ceil(BlockTypes.getAll().length / Math.floor(SIDE / setting.spacing)) + 2;

system.runTimeout(() => {
    try {
        const depth = SETTINGS.reduce((sum, setting) => sum + rows(setting), 0);
        world
            .getDimension('overworld')
            .runCommand(
                `tickingarea add ${ORIGIN - 4} 0 ${ORIGIN - 4} ${ORIGIN + SIDE + 4} 255 ${ORIGIN + depth + 4} palette`
            );
        line('TICKINGAREA added');
    } catch (e) {
        line(`TICKINGAREA failed ${e}`);
    }
}, BEFORE_AREA);

system.runTimeout(() => {
    const overworld = world.getDimension('overworld');
    const types = BlockTypes.getAll();
    let placed = 0;
    let failed = 0;

    let zOrigin = ORIGIN;
    for (const setting of SETTINGS) {
        const columns = Math.floor(SIDE / setting.spacing);

        for (let z = zOrigin - 1; z <= zOrigin + rows(setting); z++) {
            for (let x = ORIGIN - 1; x <= ORIGIN + SIDE; x++) {
                overworld.getBlock({ x, y: Y - 1, z })?.setPermutation(BlockPermutation.resolve(setting.floor));
                overworld.getBlock({ x, y: Y + setting.roof, z })?.setPermutation(BlockPermutation.resolve(ROOF));
            }
        }

        types.forEach((type, i) => {
            const x = ORIGIN + (i % columns) * setting.spacing;
            const z = zOrigin + Math.floor(i / columns);
            try {
                const block = overworld.getBlock({ x, y: Y, z });
                if (!block) throw new Error('unloaded');
                const permutation = BlockPermutation.resolve(type.id);
                if (setting.spacing > 1) {
                    overworld.getBlock({ x: x - 1, y: Y, z })?.setPermutation(BlockPermutation.resolve(WALL));
                }
                block.setPermutation(permutation);

                // A door is two blocks and pops as one. The upper half goes above it, with the
                // bit that says so, where the roof leaves room for it.
                if (setting.roof > 1 && 'upper_block_bit' in permutation.getAllStates()) {
                    overworld
                        .getBlock({ x, y: Y + 1, z })
                        ?.setPermutation(BlockPermutation.resolve(type.id, { upper_block_bit: true }));
                }
                placed++;
            } catch (e) {
                failed++;
                if (failed <= 5) line(`ERR ${type.id} @${x},${Y},${z} ${e}`);
            }
        });

        zOrigin += rows(setting);
    }

    line(`PLACED ok=${placed} failed=${failed} types=${types.length}`);
}, BEFORE_PLACING);
