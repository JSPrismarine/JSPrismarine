import BinaryStream from '@jsprismarine/binaryutils';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';
import type { JavaBlockEntityContext } from './javaBlockEntityContent';
import { applyJavaBlockEntityContent } from './javaBlockEntityContent';

/**
 * The contents of a Java block entity, against the bytes a Bedrock client would receive.
 *
 * Every case here is a compound a Java 26.3 structure template actually carries, copied out of
 * the templates rather than invented, and every assertion is made against the compound after it
 * has been through the network encoding a `BlockActorDataPacket` uses. That is the point of the
 * round trip: a tag written at the wrong width encodes at the wrong width, and a client reading
 * a short where a float belongs drops the whole block entity rather than the one field.
 */

/** A compound after the round trip through network NBT, which is what a client is sent. */
const onTheWire = (tags: NBTTagCompound): NBTTagCompound => {
    const out = new BinaryStream();
    const writer = new NBTWriter(out, ByteOrder.LITTLE_ENDIAN);
    writer.setUseVarint(true);
    writer.writeCompound(tags);

    const reader = new NBTReader(new BinaryStream(out.getBuffer()), ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(true);
    return reader.parse();
};

/** The Bedrock compound for one Java block entity, as a client would read it back. */
const translated = (java: NBTTagCompound, context: JavaBlockEntityContext = {}): NBTTagCompound => {
    const bedrock = new NBTTagCompound('');
    bedrock.addValue('x', new Types.NumberVal(0));
    bedrock.addValue('y', new Types.NumberVal(64));
    bedrock.addValue('z', new Types.NumberVal(0));

    applyJavaBlockEntityContent(bedrock, java, context);

    return onTheWire(bedrock);
};

/** A compound with a name, built from entries, the way the template reader hands one over. */
const compound = (name: string, entries: Readonly<Record<string, unknown>>): NBTTagCompound => {
    const nbt = new NBTTagCompound(name);
    for (const [key, value] of Object.entries(entries)) {
        if (value instanceof NBTTagCompound) nbt.addChild(value);
        else nbt.addValue(key, value);
    }
    return nbt;
};

const str = (value: string): Types.StringVal => new Types.StringVal(value);
const int = (value: number): Types.NumberVal => new Types.NumberVal(value);
const byte = (value: number): Types.ByteVal => new Types.ByteVal(value);

/** One banner layer as a Java template writes one. */
const layer = (pattern: string, color: string): NBTTagCompound =>
    compound('', { pattern: str(`minecraft:${pattern}`), color: str(color) });

/** Every `{ Color, Pattern }` of a translated banner, in list order. */
const patternsOf = (bedrock: NBTTagCompound): { Color: unknown; Pattern: unknown }[] =>
    Array.from(bedrock.getList('Patterns', false) ?? [], (entry: NBTTagCompound) => ({
        Color: entry.children.get('Color'),
        Pattern: entry.children.get('Pattern')
    }));

describe('a banner', () => {
    it('takes its base color off the block, counted backwards from Java', () => {
        const java = compound('', { id: str('minecraft:banner'), patterns: new Set() });

        // The 77 brown wall banners of a village; Java numbers brown 12 and Bedrock 3.
        const bedrock = translated(java, { javaBlock: 'minecraft:brown_wall_banner' });
        expect(bedrock.children.get('Base')).toBeInstanceOf(Types.NumberVal);
        expect(bedrock.getNumber('Base', -1)).toBe(3);

        expect(translated(java, { javaBlock: 'minecraft:white_wall_banner' }).getNumber('Base', -1)).toBe(15);
        expect(translated(java, { javaBlock: 'minecraft:black_banner' }).getNumber('Base', -1)).toBe(0);
    });

    it('writes the village banner layers as codes, innermost first', () => {
        // The eight magenta wall banners of a village, black triangles top and bottom.
        const java = compound('', {
            id: str('minecraft:banner'),
            patterns: new Set([layer('triangle_top', 'black'), layer('triangle_bottom', 'black')])
        });

        const bedrock = translated(java, { javaBlock: 'minecraft:magenta_wall_banner' });

        expect(bedrock.getNumber('Base', -1)).toBe(13);
        expect(patternsOf(bedrock)).toEqual([
            { Color: int(0), Pattern: str('tt') },
            { Color: int(0), Pattern: str('bt') }
        ]);
        expect(bedrock.has('Type')).toBe(false);
    });

    it('writes a raid banner as a type and no patterns at all', () => {
        // The 16 white wall banners of a pillager outpost. Bedrock draws all eight layers from
        // `Type` and refuses patterns beside it, so sending both is how one comes out blank.
        const java = compound('', {
            id: str('minecraft:banner'),
            patterns: new Set([
                layer('rhombus', 'cyan'),
                layer('stripe_bottom', 'light_gray'),
                layer('stripe_center', 'gray'),
                layer('border', 'light_gray'),
                layer('stripe_middle', 'black'),
                layer('half_horizontal', 'light_gray'),
                layer('circle', 'light_gray'),
                layer('border', 'black')
            ])
        });

        const bedrock = translated(java, { javaBlock: 'minecraft:white_wall_banner' });

        expect(bedrock.children.get('Type')).toEqual(int(1));
        expect(bedrock.has('Patterns')).toBe(false);
        expect(bedrock.getNumber('Base', -1)).toBe(15);
    });

    it('drops a layer naming a pattern Bedrock cannot draw, and keeps the banner', () => {
        const java = compound('', {
            id: str('minecraft:banner'),
            patterns: new Set([compound('', { pattern: str('example:spiral'), color: str('red') })])
        });

        const bedrock = translated(java, { javaBlock: 'minecraft:light_gray_wall_banner' });

        expect(bedrock.getNumber('Base', -1)).toBe(7);
        expect(bedrock.has('Patterns')).toBe(false);
    });
});

describe('a sign', () => {
    /** The village signpost, which is the one template sign with anything written on it. */
    const signpost = (): NBTTagCompound =>
        compound('', {
            id: str('minecraft:sign'),
            allow_op_features: byte(1),
            front_text: compound('front_text', {
                color: str('black'),
                has_glowing_text: byte(0),
                messages: new Set([
                    compound('', { text: str('') }),
                    compound('', { text: str('<----') }),
                    compound('', { text: str('---->') }),
                    compound('', { text: str('') })
                ])
            }),
            back_text: compound('back_text', {
                color: str('black'),
                has_glowing_text: byte(0),
                messages: new Set([
                    compound('', { text: str('') }),
                    compound('', { text: str('') }),
                    compound('', { text: str('') }),
                    compound('', { text: str('') })
                ])
            })
        });

    it('joins the four lines into one string and drops the trailing blanks', () => {
        const front = translated(signpost()).getCompound('FrontText', false);

        expect(front).not.toBeNull();
        // Bedrock reads a trailing newline as an empty line rather than as an absent one.
        expect(front?.getString('Text', '')).toBe('\n<----\n---->');
    });

    it('leaves a blank face blank rather than four newlines', () => {
        expect(translated(signpost()).getCompound('BackText', false)?.getString('Text', '')).toBe('');
    });

    it('writes the text color as one packed ARGB integer', () => {
        const front = translated(signpost()).getCompound('FrontText', false);

        expect(front?.children.get('SignTextColor')).toBeInstanceOf(Types.NumberVal);
        expect(front?.getNumber('SignTextColor', 0)).toBe(-16777216);
    });

    it('spells the glow flag the way the Bedrock renderer names it', () => {
        const glowing = signpost();
        glowing.getCompound('front_text', false)?.addValue('has_glowing_text', byte(1));

        const front = translated(glowing).getCompound('FrontText', false);
        expect(front?.children.get('IgnoreLighting')).toEqual(byte(1));
        expect(translated(signpost()).getCompound('FrontText', false)?.children.get('IgnoreLighting')).toEqual(byte(0));
    });

    it('records that nothing has waxed it', () => {
        expect(translated(signpost()).children.get('IsWaxed')).toEqual(byte(0));
    });

    it('reads a line built out of several pieces', () => {
        const java = compound('', {
            id: str('minecraft:sign'),
            front_text: compound('front_text', {
                messages: new Set([
                    compound('', { text: str('Welcome '), extra: new Set([compound('', { text: str('home') })]) })
                ])
            })
        });

        expect(translated(java).getCompound('FrontText', false)?.getString('Text', '')).toBe('Welcome home');
    });
});

describe('a decorated pot', () => {
    /** A trial chamber corridor pot: one flow sherd on the back, bricks on the other three. */
    const corridorPot = (): NBTTagCompound =>
        compound('', {
            id: str('minecraft:decorated_pot'),
            LootTable: str('minecraft:pots/trial_chambers/corridor'),
            sherds: compound('sherds', {
                back: compound('back', { id: str('minecraft:flow_pottery_sherd') }),
                front: compound('front', { id: str('minecraft:brick') }),
                left: compound('left', { id: str('minecraft:brick') }),
                right: compound('right', { id: str('minecraft:brick') })
            })
        });

    it('lists the four faces in Bedrock order, back then left then right then front', () => {
        const java = compound('', {
            id: str('minecraft:decorated_pot'),
            sherds: compound('sherds', {
                back: compound('back', { id: str('minecraft:flow_pottery_sherd') }),
                front: compound('front', { id: str('minecraft:guster_pottery_sherd') }),
                left: compound('left', { id: str('minecraft:scrape_pottery_sherd') }),
                right: compound('right', { id: str('minecraft:skull_pottery_sherd') })
            })
        });

        expect(
            Array.from(translated(java).getList('sherds', false) ?? [], (v: Types.StringVal) => v.getValue())
        ).toEqual([
            'minecraft:flow_pottery_sherd',
            'minecraft:scrape_pottery_sherd',
            'minecraft:skull_pottery_sherd',
            'minecraft:guster_pottery_sherd'
        ]);
    });

    it('writes the list as plain strings rather than stacks', () => {
        for (const entry of translated(corridorPot()).getList('sherds', false) ?? []) {
            expect(entry).toBeInstanceOf(Types.StringVal);
        }
    });

    it('leaves the loot table the caller already wrote alone', () => {
        const bedrock = new NBTTagCompound('');
        bedrock.addValue('LootTable', str('loot_tables/pots/trial_chambers/corridor.json'));
        applyJavaBlockEntityContent(bedrock, corridorPot());

        expect(bedrock.getString('LootTable', '')).toBe('loot_tables/pots/trial_chambers/corridor.json');
    });

    it('keeps the stack a pot already holds, with no slot number', () => {
        const java = compound('', {
            id: str('minecraft:decorated_pot'),
            item: compound('item', { id: str('minecraft:string'), count: int(3) })
        });

        const item = translated(java).getCompound('item', false);

        expect(item?.getString('Name', '')).toBe('minecraft:string');
        expect(item?.children.get('Count')).toEqual(byte(3));
        expect(item?.has('Slot')).toBe(false);
    });
});

describe('a container', () => {
    it('writes a stack as Bedrock names one, with its slot', () => {
        // The golden apple in an igloo's chest.
        const java = compound('', {
            id: str('minecraft:chest'),
            Items: new Set([compound('', { id: str('minecraft:golden_apple'), count: int(1), Slot: byte(13) })])
        });

        const items = Array.from(translated(java).getList('Items', false) ?? []) as NBTTagCompound[];

        expect(items).toHaveLength(1);
        expect(items[0]?.getString('Name', '')).toBe('minecraft:golden_apple');
        expect(items[0]?.children.get('Count')).toEqual(byte(1));
        expect(items[0]?.children.get('Slot')).toEqual(byte(13));
        expect(items[0]?.children.get('Damage')).toBeInstanceOf(Types.ShortVal);
    });

    it('keeps both ender pearls of a mansion trapped chest in their own slots', () => {
        const java = compound('', {
            id: str('minecraft:trapped_chest'),
            Items: new Set([
                compound('', { id: str('minecraft:ender_pearl'), count: int(1), Slot: byte(11) }),
                compound('', { id: str('minecraft:ender_pearl'), count: int(1), Slot: byte(15) })
            ])
        });

        const slots = Array.from(translated(java).getList('Items', false) ?? [], (entry: NBTTagCompound) =>
            entry.getByte('Slot', -1)
        );

        expect(slots.sort()).toEqual([11, 15]);
    });

    it('carries an enchantment on a stack a chest holds', () => {
        const java = compound('', {
            id: str('minecraft:chest'),
            Items: new Set([
                compound('', {
                    id: str('minecraft:iron_axe'),
                    count: int(1),
                    Slot: byte(10),
                    components: compound('components', {
                        'minecraft:enchantments': compound('minecraft:enchantments', {
                            'minecraft:efficiency': int(1)
                        })
                    })
                })
            ])
        });

        const stack = Array.from(translated(java).getList('Items', false) ?? [])[0] as NBTTagCompound;

        expect(stack.getCompound('tag', false)?.getList('ench', false)?.size).toBe(1);
    });

    it('writes no list for a container the template left empty', () => {
        const java = compound('', { id: str('minecraft:barrel'), Items: new Set() });

        expect(translated(java).has('Items')).toBe(false);
    });

    it('leaves a campfire alone, because Bedrock numbers its slots instead', () => {
        const java = compound('', { id: str('minecraft:campfire'), Items: new Set() });

        expect(translated(java).has('Items')).toBe(false);
    });
});

describe('a vault', () => {
    /** The ominous vault of a trial chamber, which is one of the two the templates declare. */
    const ominousVault = (): NBTTagCompound =>
        compound('', {
            id: str('minecraft:vault'),
            config: compound('config', {
                loot_table: str('minecraft:chests/trial_chambers/reward_ominous'),
                key_item: compound('key_item', { id: str('minecraft:ominous_trial_key'), count: int(1) })
            })
        });

    it('keeps the loot table inside the config, as a pack-relative path', () => {
        const config = translated(ominousVault()).getCompound('config', false);

        expect(config?.getString('loot_table', '')).toBe('loot_tables/chests/trial_chambers/reward_ominous.json');
    });

    it('writes the key as a Bedrock stack', () => {
        const key = translated(ominousVault()).getCompound('config', false)?.getCompound('key_item', false);

        expect(key?.getString('Name', '')).toBe('minecraft:ominous_trial_key');
        expect(key?.children.get('Count')).toEqual(byte(1));
    });

    it('narrows the two ranges from doubles to floats', () => {
        const java = ominousVault();
        java.getCompound('config', false)?.addValue('activation_range', new Types.DoubleVal(4));
        java.getCompound('config', false)?.addValue('deactivation_range', new Types.DoubleVal(4.5));

        const config = translated(java).getCompound('config', false);

        expect(config?.children.get('activation_range')).toBeInstanceOf(Types.FloatVal);
        expect(config?.getFloat('deactivation_range', 0)).toBeCloseTo(4.5, 5);
    });
});

describe('a trial spawner', () => {
    /** The breeze spawner of a trial chamber, which names both configurations by reference. */
    const breezeSpawner = (): NBTTagCompound =>
        compound('', {
            id: str('minecraft:trial_spawner'),
            normal_config: str('minecraft:trial_chamber/breeze/normal'),
            ominous_config: str('minecraft:trial_chamber/breeze/ominous')
        });

    /** The configuration that reference names, as Java's own data file writes it. */
    const breezeConfig = (): NBTTagCompound =>
        compound('', {
            simultaneous_mobs: new Types.FloatVal(1),
            simultaneous_mobs_added_per_player: new Types.FloatVal(0.5),
            total_mobs: new Types.FloatVal(2),
            total_mobs_added_per_player: new Types.FloatVal(1),
            ticks_between_spawn: int(20),
            spawn_potentials: new Set([
                compound('', {
                    weight: int(1),
                    data: compound('data', { entity: compound('entity', { id: str('minecraft:breeze') }) })
                })
            ])
        });

    const resolving = (): JavaBlockEntityContext => ({ trialSpawnerConfig: () => breezeConfig() });

    it('drops a configuration nothing resolves, and keeps the spawner', () => {
        const bedrock = translated(breezeSpawner());

        expect(bedrock.has('normal_config')).toBe(false);
        expect(bedrock.has('ominous_config')).toBe(false);
    });

    it('inlines both configurations once a resolver answers', () => {
        const bedrock = translated(breezeSpawner(), resolving());

        expect(bedrock.getCompound('normal_config', false)).not.toBeNull();
        expect(bedrock.getCompound('ominous_config', false)).not.toBeNull();
    });

    it('writes the mob counts as floats and the rates as integers', () => {
        const config = translated(breezeSpawner(), resolving()).getCompound('normal_config', false);

        expect(config?.children.get('total_mobs')).toBeInstanceOf(Types.FloatVal);
        expect(config?.getFloat('total_mobs', 0)).toBeCloseTo(2, 5);
        expect(config?.getFloat('simultaneous_mobs_added_per_player', 0)).toBeCloseTo(0.5, 5);
        expect(config?.children.get('ticks_between_spawn')).toBeInstanceOf(Types.NumberVal);
        expect(config?.getNumber('ticks_between_spawn', 0)).toBe(20);
    });

    it('states the spawn interval even when Java left it out, because the defaults differ', () => {
        const silent = breezeConfig();
        silent.remove('ticks_between_spawn');

        const config = translated(breezeSpawner(), { trialSpawnerConfig: () => silent }).getCompound(
            'normal_config',
            false
        );

        // Java defaults to 40 and Bedrock to 20, so a silent config would run at twice the rate.
        expect(config?.getNumber('ticks_between_spawn', 0)).toBe(40);
    });

    it('names the mob it spawns as a Bedrock identifier', () => {
        const potentials = translated(breezeSpawner(), resolving())
            .getCompound('normal_config', false)
            ?.getList('spawn_potentials', false);

        const entry = Array.from(potentials ?? [])[0] as NBTTagCompound;
        expect(entry.getCompound('data', false)?.getCompound('entity', false)?.getString('id', '')).toBe(
            'minecraft:breeze'
        );
    });

    it('rewrites an ejected loot table into a pack-relative path', () => {
        const withLoot = breezeConfig();
        withLoot.addValue(
            'loot_tables_to_eject',
            new Set([compound('', { weight: int(1), data: str('minecraft:spawners/trial_chamber/key') })])
        );

        const ejected = translated(breezeSpawner(), { trialSpawnerConfig: () => withLoot })
            .getCompound('normal_config', false)
            ?.getList('loot_tables_to_eject', false);

        expect((Array.from(ejected ?? [])[0] as NBTTagCompound).getString('data', '')).toBe(
            'loot_tables/spawners/trial_chamber/key.json'
        );
    });

    it('takes a configuration Java wrote inline without a resolver', () => {
        const java = compound('', { id: str('minecraft:trial_spawner') });
        java.addChild(
            (() => {
                const inline = breezeConfig();
                inline.setName('normal_config');
                return inline;
            })()
        );

        expect(translated(java).getCompound('normal_config', false)?.getFloat('total_mobs', 0)).toBeCloseTo(2, 5);
    });
});

describe('a monster spawner', () => {
    /** The magma cube spawner of a bastion, which is one of the two the templates declare. */
    const magmaCubeSpawner = (): NBTTagCompound =>
        compound('', {
            id: str('minecraft:mob_spawner'),
            Delay: new Types.ShortVal(0),
            MinSpawnDelay: new Types.ShortVal(200),
            MaxSpawnDelay: new Types.ShortVal(800),
            SpawnCount: new Types.ShortVal(4),
            MaxNearbyEntities: new Types.ShortVal(6),
            RequiredPlayerRange: new Types.ShortVal(16),
            SpawnRange: new Types.ShortVal(4),
            SpawnData: compound('SpawnData', { entity: compound('entity', { id: str('minecraft:magma_cube') }) }),
            SpawnPotentials: new Set([
                compound('', {
                    weight: int(1),
                    data: compound('data', { entity: compound('entity', { id: str('minecraft:magma_cube') }) })
                })
            ])
        });

    it('lifts the mob out of the two levels Java buries it under', () => {
        expect(translated(magmaCubeSpawner()).getString('EntityIdentifier', '')).toBe('minecraft:magma_cube');
    });

    it('keeps all seven rate fields as shorts', () => {
        const bedrock = translated(magmaCubeSpawner());

        for (const key of [
            'Delay',
            'MinSpawnDelay',
            'MaxSpawnDelay',
            'SpawnCount',
            'MaxNearbyEntities',
            'RequiredPlayerRange',
            'SpawnRange'
        ]) {
            expect(bedrock.children.get(key)).toBeInstanceOf(Types.ShortVal);
        }
        expect(bedrock.getShort('MaxSpawnDelay', 0)).toBe(800);
    });

    it('flattens a spawn potential onto the two tags Bedrock reads', () => {
        const entry = Array.from(translated(magmaCubeSpawner()).getList('SpawnPotentials', false) ?? [])[0] as
            NBTTagCompound | undefined;

        expect(entry?.getString('TypeId', '')).toBe('minecraft:magma_cube');
        expect(entry?.getNumber('Weight', 0)).toBe(1);
    });
});

describe('a comparator', () => {
    it('carries the output signal across under the name both editions use', () => {
        const java = compound('', { id: str('minecraft:comparator'), OutputSignal: int(7) });

        const bedrock = translated(java);
        expect(bedrock.children.get('OutputSignal')).toBeInstanceOf(Types.NumberVal);
        expect(bedrock.getNumber('OutputSignal', -1)).toBe(7);
    });
});

describe('a block entity with nothing to translate', () => {
    it('leaves the compound exactly as the caller built it', () => {
        for (const type of ['minecraft:bell', 'minecraft:lectern', 'minecraft:sculk_sensor', 'minecraft:skull']) {
            const bedrock = new NBTTagCompound('');
            bedrock.addValue('id', str('Bell'));
            applyJavaBlockEntityContent(bedrock, compound('', { id: str(type) }));

            expect(Array.from(bedrock.children.keys())).toEqual(['id']);
        }
    });

    it('does nothing for a compound with no type at all', () => {
        const bedrock = new NBTTagCompound('');
        applyJavaBlockEntityContent(bedrock, new NBTTagCompound(''));

        expect(bedrock.children.size).toBe(0);
    });
});
