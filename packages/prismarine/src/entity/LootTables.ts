import { DropTable } from '../block/DropTable';

/**
 * What each kind of mob leaves behind.
 *
 * Rolled through the very same {@link DropTable} a block's drops go through. They are the same
 * problem stated twice - a list of things, each with a count range and some with odds - and the
 * table already existed, was already tested, and already takes its chance source as an argument
 * so a roll can be made to repeat. Writing a second one for mobs would have been two things to
 * keep correct instead of one.
 *
 * Bedrock does ship entity loot tables as data, unlike its block drops - a dedicated server has
 * them under `behavior_packs/vanilla/loot_tables/entities`. They are not read from there here for
 * the same reason `EntitySize` is hand-written: `@jsprismarine/bedrock-data` carries the block and
 * item tables and no entity ones, so there is nowhere in this repo to generate them from.
 * @see https://minecraft.wiki/w/Drops#Mob_drops
 *
 * Drops that vanilla only makes when a *player* did the killing - a spider's eye, a zombie's
 * rare equipment - are not distinguished yet: this table does not know who swung. Left for when
 * something needs it rather than guessed at now.
 */

/** Nothing at all, and a deliberate entry rather than an absence - see {@link lootOf}. */
const NOTHING = new DropTable([]);

/**
 * Every mob that leaves something, by the identifier the client knows it by.
 *
 * A mob missing from here drops nothing, which is right for most of them: wolves, cats, foxes,
 * villagers and bats all leave a corpse and no items.
 */
export const MOB_LOOT: Readonly<Record<string, DropTable>> = {
    // Livestock. The meat is certain and the by-product is not, which is why keeping animals is
    // worth more than hunting them.
    'minecraft:cow': new DropTable([
        { name: 'minecraft:beef', min: 1, max: 3 },
        { name: 'minecraft:leather', min: 0, max: 2 }
    ]),
    'minecraft:mooshroom': new DropTable([
        { name: 'minecraft:beef', min: 1, max: 3 },
        { name: 'minecraft:leather', min: 0, max: 2 }
    ]),
    'minecraft:pig': new DropTable([{ name: 'minecraft:porkchop', min: 1, max: 3 }]),
    'minecraft:sheep': new DropTable([
        { name: 'minecraft:mutton', min: 1, max: 2 },
        // Always white: this server does not model a sheep's colour, so the one wool it can
        // honestly name is the default one.
        { name: 'minecraft:white_wool', min: 1, max: 1 }
    ]),
    'minecraft:chicken': new DropTable([
        { name: 'minecraft:chicken', min: 1, max: 1 },
        { name: 'minecraft:feather', min: 0, max: 2 }
    ]),
    'minecraft:rabbit': new DropTable([
        { name: 'minecraft:rabbit', min: 0, max: 1 },
        { name: 'minecraft:rabbit_hide', min: 0, max: 1 },
        { name: 'minecraft:rabbit_foot', oneIn: 10 }
    ]),
    'minecraft:horse': new DropTable([{ name: 'minecraft:leather', min: 0, max: 2 }]),
    'minecraft:donkey': new DropTable([{ name: 'minecraft:leather', min: 0, max: 2 }]),
    'minecraft:mule': new DropTable([{ name: 'minecraft:leather', min: 0, max: 2 }]),
    'minecraft:llama': new DropTable([{ name: 'minecraft:leather', min: 0, max: 2 }]),

    // The water.
    'minecraft:squid': new DropTable([{ name: 'minecraft:ink_sac', min: 1, max: 3 }]),
    'minecraft:cod': new DropTable([{ name: 'minecraft:cod', min: 1, max: 1 }]),
    'minecraft:salmon': new DropTable([{ name: 'minecraft:salmon', min: 1, max: 1 }]),
    'minecraft:dolphin': new DropTable([{ name: 'minecraft:cod', min: 0, max: 1 }]),
    'minecraft:polar_bear': new DropTable([{ name: 'minecraft:cod', min: 0, max: 2 }]),

    // The undead.
    'minecraft:zombie': new DropTable([{ name: 'minecraft:rotten_flesh', min: 0, max: 2 }]),
    'minecraft:husk': new DropTable([{ name: 'minecraft:rotten_flesh', min: 0, max: 2 }]),
    'minecraft:drowned': new DropTable([{ name: 'minecraft:rotten_flesh', min: 0, max: 2 }]),
    'minecraft:zombie_villager': new DropTable([{ name: 'minecraft:rotten_flesh', min: 0, max: 2 }]),
    'minecraft:zombie_villager_v2': new DropTable([{ name: 'minecraft:rotten_flesh', min: 0, max: 2 }]),
    'minecraft:zombie_pigman': new DropTable([
        { name: 'minecraft:rotten_flesh', min: 0, max: 1 },
        { name: 'minecraft:gold_nugget', min: 0, max: 1 }
    ]),
    'minecraft:skeleton': new DropTable([
        { name: 'minecraft:bone', min: 0, max: 2 },
        { name: 'minecraft:arrow', min: 0, max: 2 }
    ]),
    'minecraft:stray': new DropTable([
        { name: 'minecraft:bone', min: 0, max: 2 },
        { name: 'minecraft:arrow', min: 0, max: 2 }
    ]),
    'minecraft:wither_skeleton': new DropTable([
        { name: 'minecraft:bone', min: 0, max: 2 },
        { name: 'minecraft:coal', min: 0, max: 1 }
    ]),

    // The rest of the night shift.
    'minecraft:creeper': new DropTable([{ name: 'minecraft:gunpowder', min: 0, max: 2 }]),
    'minecraft:spider': new DropTable([
        { name: 'minecraft:string', min: 0, max: 2 },
        { name: 'minecraft:spider_eye', min: 0, max: 1 }
    ]),
    'minecraft:cave_spider': new DropTable([
        { name: 'minecraft:string', min: 0, max: 2 },
        { name: 'minecraft:spider_eye', min: 0, max: 1 }
    ]),
    'minecraft:enderman': new DropTable([{ name: 'minecraft:ender_pearl', min: 0, max: 1 }]),
    'minecraft:slime': new DropTable([{ name: 'minecraft:slime_ball', min: 0, max: 2 }]),
    'minecraft:magma_cube': new DropTable([{ name: 'minecraft:magma_cream', min: 0, max: 1 }]),
    'minecraft:blaze': new DropTable([{ name: 'minecraft:blaze_rod', min: 0, max: 1 }]),
    'minecraft:ghast': new DropTable([
        { name: 'minecraft:ghast_tear', min: 0, max: 1 },
        { name: 'minecraft:gunpowder', min: 0, max: 2 }
    ]),
    'minecraft:phantom': new DropTable([{ name: 'minecraft:phantom_membrane', min: 0, max: 1 }]),
    'minecraft:guardian': new DropTable([
        { name: 'minecraft:prismarine_shard', min: 0, max: 2 },
        { name: 'minecraft:cod', min: 0, max: 1 }
    ]),
    'minecraft:elder_guardian': new DropTable([
        { name: 'minecraft:prismarine_shard', min: 0, max: 2 },
        { name: 'minecraft:prismarine_crystals', min: 0, max: 1 }
    ]),
    'minecraft:hoglin': new DropTable([
        { name: 'minecraft:porkchop', min: 2, max: 4 },
        { name: 'minecraft:leather', min: 0, max: 1 }
    ]),
    'minecraft:zoglin': new DropTable([{ name: 'minecraft:rotten_flesh', min: 1, max: 3 }]),
    'minecraft:piglin': new DropTable([{ name: 'minecraft:gold_nugget', min: 0, max: 1 }]),
    'minecraft:endermite': NOTHING,
    'minecraft:silverfish': NOTHING,

    // Built rather than born: they give back roughly what they cost.
    'minecraft:iron_golem': new DropTable([{ name: 'minecraft:iron_ingot', min: 3, max: 5 }]),
    'minecraft:snow_golem': new DropTable([{ name: 'minecraft:snowball', min: 0, max: 15 }])
};

/**
 * What a mob of this type leaves behind.
 * @param {string} type - The entity identifier, as `Entity.getType` reports it.
 * @returns {DropTable | null} Its table, or null for a mob that drops nothing.
 */
export const lootOf = (type: string): DropTable | null => MOB_LOOT[type] ?? null;

export default MOB_LOOT;
