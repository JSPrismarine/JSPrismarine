/**
 * What a Java block entity holds, written the way Bedrock holds it.
 *
 * A structure template saves the whole block entity: a banner's layers, a sign's two faces, the
 * four sherds pressed into a decorated pot, the key a vault wants, the stacks already sitting in
 * a chest. Until this module existed the generator read three fields out of that compound, the
 * loot table, the spawner's mob and the end gateway's exit, and dropped the rest, so a generated
 * village stood white banners that should have been brown and blank signs that should have
 * pointed somewhere.
 *
 * The two editions disagree about shape in almost every case, which is why this is a translation
 * and not a copy. A compound the client cannot read is no better than an absent one: a client
 * drops a block entity whose tags it does not understand, so a half-translated banner is a
 * banner with no color rather than a banner with the wrong patterns.
 *
 * The vocabularies, the pattern codes and the dye indices, are in `@jsprismarine/mapping` beside
 * every other Java-to-Bedrock table. The layouts are here, next to the chunk that stores them.
 *
 * # What the templates actually carry
 *
 * Java 26.3's 1511 structure templates declare 1124 block entities once the jigsaws and the
 * structure blocks consumed during placement are set aside. The translation was written in the
 * order that census puts them in, and it stops where the census does. The furnaces, smokers and
 * blast furnaces are all cold, so their timers are left out and only their stacks carry over.
 * Every one of the 128 campfires is empty, and Bedrock numbers a campfire's four slots rather
 * than listing them, so a campfire has nothing to translate at all. No lectern holds a book and
 * no bell, skull, lectern or sculk sensor carries any content whatsoever.
 *
 * What the translation knowingly drops is reviewed and listed, in
 * {@link import('@jsprismarine/mapping').BLOCK_ENTITY_CONTENT_LOSSES}.
 */
import type { BannerLayer } from '@jsprismarine/mapping';
import {
    bedrockBannerType,
    bedrockDyeIndexOf,
    bedrockSignTextColorOf,
    isOminousBannerPattern,
    javaBannerPatternToBedrock,
    javaEntityTypeToBedrock,
    javaItemToBedrock
} from '@jsprismarine/mapping';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';

import { bedrockLootPathOf } from '../content/lootTablePaths';
import { itemStackToNbt } from '../inventory/itemNbt';
import type { StoredItemStack } from '../inventory/persistence';

/** What a translation needs that the saved block entity does not carry. */
export interface JavaBlockEntityContext {
    /**
     * The Java block the block entity sits in, for example `minecraft:white_wall_banner`.
     *
     * Only a banner needs it, and it needs it because Java keeps a banner's color in the block
     * and Bedrock keeps it in the block entity. Bedrock has one `standing_banner` where Java has
     * sixteen, so without the Java block name there is nothing to read the color off.
     */
    readonly javaBlock?: string;

    /**
     * Resolves a Java `trial_spawner` configuration reference to the compound it names.
     *
     * Java may write a trial spawner's configuration inline or as a reference into its own
     * registry, and every trial spawner in the templates writes a reference. Bedrock takes the
     * configuration inline and has no reference form, so a resolver is the only way across.
     * Absent, a referenced configuration is dropped, which is the listed loss.
     */
    readonly trialSpawnerConfig?: (reference: string) => NBTTagCompound | undefined;
}

/** The faces of a decorated pot, in the order Bedrock lists them. */
const SHERD_FACES = ['back', 'left', 'right', 'front'] as const;

/** What a face with nothing pressed into it shows, on both editions. */
const PLAIN_SHERD = 'minecraft:brick';

/** The spawner fields both editions spell the same way and store as shorts. */
const SPAWNER_SHORTS = [
    'Delay',
    'MinSpawnDelay',
    'MaxSpawnDelay',
    'SpawnCount',
    'MaxNearbyEntities',
    'RequiredPlayerRange',
    'SpawnRange'
] as const;

/** The trial spawner configuration fields Bedrock stores as 32-bit integers. */
const TRIAL_CONFIG_INTS = ['spawn_range', 'ticks_between_spawn', 'target_cooldown_length'] as const;

/** The trial spawner configuration fields Bedrock stores as floats. */
const TRIAL_CONFIG_FLOATS = [
    'total_mobs',
    'simultaneous_mobs',
    'total_mobs_added_per_player',
    'simultaneous_mobs_added_per_player'
] as const;

/**
 * The block entity types whose `Items` list is a Bedrock `Items` list too.
 *
 * A campfire is not among them on purpose: Bedrock numbers its four slots `Item1` through
 * `Item4` rather than listing them, and every campfire the templates carry is empty.
 */
const ITEM_LIST_TYPES = new Set([
    'minecraft:barrel',
    'minecraft:blast_furnace',
    'minecraft:brewing_stand',
    'minecraft:chest',
    'minecraft:chiseled_bookshelf',
    'minecraft:crafter',
    'minecraft:dispenser',
    'minecraft:dropper',
    'minecraft:furnace',
    'minecraft:hopper',
    'minecraft:shulker_box',
    'minecraft:smoker',
    'minecraft:trapped_chest'
]);

const stringAt = (nbt: NBTTagCompound, key: string): string | undefined => {
    const value = nbt.children.get(key);
    return value instanceof Types.StringVal ? value.getValue() : undefined;
};

const compoundAt = (nbt: NBTTagCompound, key: string): NBTTagCompound | undefined => {
    const value = nbt.children.get(key);
    return value instanceof NBTTagCompound ? value : undefined;
};

/** Every compound of a list tag, skipping anything in it that is not one. */
const compoundsAt = (nbt: NBTTagCompound, key: string): NBTTagCompound[] => {
    const value = nbt.children.get(key);
    if (!(value instanceof Set)) return [];

    const compounds: NBTTagCompound[] = [];
    for (const entry of value) if (entry instanceof NBTTagCompound) compounds.push(entry);
    return compounds;
};

/** A number out of whichever width the writer chose, which is not always the one Java documents. */
const numberAt = (nbt: NBTTagCompound, key: string): number | undefined => {
    const value = nbt.children.get(key);
    if (value === undefined) return undefined;

    const raw: unknown = value.getValue?.();
    if (typeof raw === 'number') return raw;
    return typeof raw === 'bigint' ? Number(raw) : undefined;
};

/**
 * The readable text of a Java text component held as NBT.
 *
 * A sign's line is a component, which is a bare string, a compound with a `text`, or a compound
 * with a `translate` key and no text to read without the client's language file. The key goes
 * through for the last of those, which is what a client without that language would show. An
 * `extra` list is appended, because that is how a component carries a line built from several
 * pieces.
 */
const componentText = (value: unknown): string => {
    if (value instanceof Types.StringVal) return value.getValue();
    if (value instanceof Set) return Array.from(value, componentText).join('');
    if (!(value instanceof NBTTagCompound)) return '';

    const own = stringAt(value, 'text') ?? stringAt(value, 'translate') ?? '';
    const extra = value.children.get('extra');
    return extra === undefined ? own : `${own}${componentText(extra)}`;
};

/** One Java item stack as this server carries a stack, or nothing for a stack naming no item. */
const storedStackOf = (java: NBTTagCompound): StoredItemStack | undefined => {
    const javaId = stringAt(java, 'id');
    if (javaId === undefined || javaId === 'minecraft:air') return undefined;

    const mapped = javaItemToBedrock(javaId);
    if (mapped.kind === 'unknown') return undefined;

    const components = compoundAt(java, 'components');
    const enchantments = components === undefined ? undefined : enchantmentsOf(components);

    return {
        name: mapped.bedrock.identifier,
        count: numberAt(java, 'count') ?? 1,
        ...(mapped.bedrock.data === undefined ? {} : { meta: mapped.bedrock.data }),
        ...(enchantments === undefined ? {} : { enchantments })
    };
};

/** The levels of a `minecraft:enchantments` component, which is a bare map of id to level. */
const enchantmentsOf = (components: NBTTagCompound): Record<string, number> | undefined => {
    const levels = compoundAt(components, 'minecraft:enchantments');
    if (levels === undefined) return undefined;

    const out: Record<string, number> = {};
    for (const [id, value] of levels.children) {
        const level = Number(value?.getValue?.() ?? 0);
        if (Number.isFinite(level) && level > 0) out[id] = level;
    }

    return Object.keys(out).length === 0 ? undefined : out;
};

/** A Bedrock item compound for one Java stack, with its slot when the stack sits in one. */
const stackToNbt = (java: NBTTagCompound, slot?: number): NBTTagCompound | undefined => {
    const stored = storedStackOf(java);
    return stored === undefined ? undefined : itemStackToNbt(stored, slot);
};

/** The Bedrock identifier for a Java entity type, taking a reviewed loss's substitute. */
const bedrockEntityTypeOf = (javaId: string): string | undefined => {
    const mapped = javaEntityTypeToBedrock(javaId);
    switch (mapped.kind) {
        case 'mapped':
        case 'passthrough':
            return mapped.bedrock;
        case 'loss':
            return mapped.loss.bedrockFallback;
        case 'unknown':
            return undefined;
    }
};

/** The dye color word out of a Java banner block name, which is where Java keeps it. */
const bannerColorOf = (javaBlock: string | undefined): string | undefined => {
    if (javaBlock === undefined) return undefined;

    const name = javaBlock.replace(/^[^:]*:/, '');
    for (const suffix of ['_wall_banner', '_banner']) {
        if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
    }

    return undefined;
};

/**
 * A banner's color, its layers and whether it is the ominous one.
 *
 * The color comes from the block rather than from the compound, and Bedrock's index runs
 * backwards from Java's. A banner that is the ominous one is written as `Type` alone: Bedrock
 * draws all eight of its layers from that field and refuses patterns beside it, so sending both
 * is how a raid banner comes out blank.
 */
const translateBanner = (bedrock: NBTTagCompound, java: NBTTagCompound, context: JavaBlockEntityContext): void => {
    const color = bannerColorOf(context.javaBlock);
    bedrock.addValue('Base', new Types.NumberVal(bedrockDyeIndexOf(color ?? '') ?? 0));

    const layers: BannerLayer[] = [];
    for (const entry of compoundsAt(java, 'patterns')) {
        const pattern = stringAt(entry, 'pattern');
        const dye = stringAt(entry, 'color');
        if (pattern !== undefined && dye !== undefined) layers.push({ pattern, color: dye });
    }

    if (isOminousBannerPattern(layers)) {
        bedrock.addValue('Type', new Types.NumberVal(bedrockBannerType.ominous));
        return;
    }

    const patterns = new Set<NBTTagCompound>();
    for (const layer of layers) {
        const code = javaBannerPatternToBedrock(layer.pattern);
        const index = bedrockDyeIndexOf(layer.color);
        // A layer naming a pattern Bedrock has no code for, which is a datapack's own. Bedrock
        // draws patterns from its client assets and has nowhere to put one, so the layer goes
        // rather than the banner.
        if (code === undefined || index === undefined) continue;

        const entry = new NBTTagCompound('');
        entry.addValue('Color', new Types.NumberVal(index));
        entry.addValue('Pattern', new Types.StringVal(code));
        patterns.add(entry);
    }

    if (patterns.size > 0) bedrock.addValue('Patterns', patterns);
};

/**
 * One face of a sign.
 *
 * Java keeps four text components; Bedrock keeps one string with the lines separated by
 * newlines, and reads trailing newlines as empty lines rather than as absent ones, so they come
 * off. The glow flag is called `IgnoreLighting` on the Bedrock side, which names what it does to
 * the renderer rather than what the player did with a glow ink sac.
 */
const translateSignFace = (java: NBTTagCompound, name: string): NBTTagCompound => {
    const face = new NBTTagCompound(name);

    const messages = java.children.get('messages');
    const lines = messages instanceof Set ? Array.from(messages, componentText) : [];
    face.addValue('Text', new Types.StringVal(lines.join('\n').replace(/\n+$/, '')));

    const color = stringAt(java, 'color');
    const argb = color === undefined ? undefined : bedrockSignTextColorOf(color);
    if (argb !== undefined) face.addValue('SignTextColor', new Types.NumberVal(argb));

    face.addValue('IgnoreLighting', new Types.ByteVal(numberAt(java, 'has_glowing_text') === 1 ? 1 : 0));

    return face;
};

/** Both faces of a sign, and whether honeycomb has sealed it. */
const translateSign = (bedrock: NBTTagCompound, java: NBTTagCompound): void => {
    for (const [javaKey, bedrockKey] of [
        ['front_text', 'FrontText'],
        ['back_text', 'BackText']
    ] as const) {
        const face = compoundAt(java, javaKey);
        if (face !== undefined) bedrock.addChild(translateSignFace(face, bedrockKey));
    }

    bedrock.addValue('IsWaxed', new Types.ByteVal(numberAt(java, 'is_waxed') === 1 ? 1 : 0));
};

/**
 * A decorated pot's four sherds and whatever is inside it.
 *
 * Java names the faces and Bedrock orders them, back, left, right and front, so the order here
 * is the whole of the translation: a pot whose faces are listed in any other order shows the
 * wrong sherd on the wrong side. A face with nothing pressed into it is a brick on both
 * editions, and Bedrock wants all four listed rather than the decorated ones.
 */
const translateDecoratedPot = (bedrock: NBTTagCompound, java: NBTTagCompound): void => {
    const sherds = compoundAt(java, 'sherds');
    if (sherds !== undefined) {
        const list = new Set<Types.StringVal>();
        for (const face of SHERD_FACES) {
            const stack = compoundAt(sherds, face);
            const javaId = stack === undefined ? undefined : stringAt(stack, 'id');
            const mapped = javaId === undefined ? undefined : javaItemToBedrock(javaId);
            list.add(
                new Types.StringVal(
                    mapped === undefined || mapped.kind === 'unknown' ? PLAIN_SHERD : mapped.bedrock.identifier
                )
            );
        }
        bedrock.addValue('sherds', list);
    }

    const item = compoundAt(java, 'item');
    // A pot holds one stack and numbers no slot, so the compound carries no `Slot`.
    const stack = item === undefined ? undefined : stackToNbt(item);
    if (stack !== undefined) {
        stack.setName('item');
        bedrock.addChild(stack);
    }
};

/** Every filled slot of a container, as Bedrock's own `Items` list. */
const translateItems = (bedrock: NBTTagCompound, java: NBTTagCompound): void => {
    const items = new Set<NBTTagCompound>();
    for (const [index, entry] of compoundsAt(java, 'Items').entries()) {
        const stack = stackToNbt(entry, numberAt(entry, 'Slot') ?? index);
        if (stack !== undefined) items.add(stack);
    }

    if (items.size > 0) bedrock.addValue('Items', items);
};

/**
 * A vault's configuration.
 *
 * Both editions keep a vault's loot table inside its own `config` rather than at the top level,
 * and Bedrock wants the pack-relative path a behavior pack would name. The key is a whole item
 * stack on both sides, in each edition's own stack shape, and the two ranges are doubles in Java
 * and floats in Bedrock.
 */
const translateVault = (bedrock: NBTTagCompound, java: NBTTagCompound): void => {
    const javaConfig = compoundAt(java, 'config');
    if (javaConfig === undefined) return;

    const config = new NBTTagCompound('config');

    for (const key of ['loot_table', 'override_loot_table_to_display'] as const) {
        const table = stringAt(javaConfig, key);
        if (table !== undefined) config.addValue(key, new Types.StringVal(bedrockLootPathOf(table)));
    }

    const keyItem = compoundAt(javaConfig, 'key_item');
    const stack = keyItem === undefined ? undefined : stackToNbt(keyItem);
    if (stack !== undefined) {
        stack.setName('key_item');
        config.addChild(stack);
    }

    for (const key of ['activation_range', 'deactivation_range'] as const) {
        const range = numberAt(javaConfig, key);
        if (range !== undefined) config.addValue(key, new Types.FloatVal(range));
    }

    bedrock.addChild(config);
};

/**
 * An item frame's held stack, as Bedrock's `ItemFrame` block entity keeps it.
 *
 * Java saves the frame as an entity, so the compound here is the entity's: the stack under
 * `Item`, a byte `ItemRotation` and a float `ItemDropChance`. Bedrock keeps the same three names
 * on the block entity and reads the last two as floats. The drop chance is written whether or
 * not Java states it, because Java's default is 1 and an absent float reads as 0, which is a
 * frame that drops nothing when broken.
 */
const translateItemFrame = (bedrock: NBTTagCompound, java: NBTTagCompound): void => {
    const item = compoundAt(java, 'Item');
    const stack = item === undefined ? undefined : stackToNbt(item);
    if (stack !== undefined) {
        stack.setName('Item');
        bedrock.addChild(stack);
    }

    bedrock.addValue('ItemRotation', new Types.FloatVal(numberAt(java, 'ItemRotation') ?? 0));
    bedrock.addValue('ItemDropChance', new Types.FloatVal(numberAt(java, 'ItemDropChance') ?? 1));
};

/**
 * One trial spawner configuration, inline.
 *
 * The field names survive; the widths and the loot table spellings do not. `ticks_between_spawn`
 * is written whether or not Java states it, because the two editions default it differently, 40
 * on one side and 20 on the other, and a silent default is a spawner running at twice the rate
 * it should. `target_cooldown_length` moves in from Java's root, which is where Java keeps it.
 */
const translateTrialConfig = (javaConfig: NBTTagCompound, javaRoot: NBTTagCompound, name: string): NBTTagCompound => {
    const config = new NBTTagCompound(name);

    for (const key of TRIAL_CONFIG_INTS) {
        const value =
            numberAt(javaConfig, key) ?? (key === 'target_cooldown_length' ? numberAt(javaRoot, key) : undefined);
        if (value !== undefined) config.addValue(key, new Types.NumberVal(value));
    }
    if (!config.has('ticks_between_spawn')) config.addValue('ticks_between_spawn', new Types.NumberVal(40));

    for (const key of TRIAL_CONFIG_FLOATS) {
        const value = numberAt(javaConfig, key);
        if (value !== undefined) config.addValue(key, new Types.FloatVal(value));
    }

    const potentials = new Set<NBTTagCompound>();
    for (const entry of compoundsAt(javaConfig, 'spawn_potentials')) {
        const javaType = compoundAt(compoundAt(entry, 'data') ?? entry, 'entity');
        const type = javaType === undefined ? undefined : stringAt(javaType, 'id');
        const bedrockType = type === undefined ? undefined : bedrockEntityTypeOf(type);
        if (bedrockType === undefined) continue;

        const potential = new NBTTagCompound('');
        potential.addValue('weight', new Types.NumberVal(numberAt(entry, 'weight') ?? 1));
        const data = new NBTTagCompound('data');
        const actor = new NBTTagCompound('entity');
        actor.addValue('id', new Types.StringVal(bedrockType));
        data.addChild(actor);
        potential.addChild(data);
        potentials.add(potential);
    }
    if (potentials.size > 0) config.addValue('spawn_potentials', potentials);

    const ejected = new Set<NBTTagCompound>();
    for (const entry of compoundsAt(javaConfig, 'loot_tables_to_eject')) {
        const table = stringAt(entry, 'data');
        if (table === undefined) continue;

        const row = new NBTTagCompound('');
        row.addValue('weight', new Types.NumberVal(numberAt(entry, 'weight') ?? 1));
        row.addValue('data', new Types.StringVal(bedrockLootPathOf(table)));
        ejected.add(row);
    }
    if (ejected.size > 0) config.addValue('loot_tables_to_eject', ejected);

    const ominousDrops = stringAt(javaConfig, 'items_to_drop_when_ominous');
    if (ominousDrops !== undefined) {
        config.addValue('items_to_drop_when_ominous', new Types.StringVal(bedrockLootPathOf(ominousDrops)));
    }

    return config;
};

/**
 * A trial spawner's two configurations.
 *
 * Java writes each one inline or as a reference into its own registry, and every trial spawner
 * in the structure templates writes a reference. Bedrock has no reference form, so a reference
 * needs resolving before it can be written and is dropped when nothing resolves it, which is the
 * listed loss.
 */
const translateTrialSpawner = (
    bedrock: NBTTagCompound,
    java: NBTTagCompound,
    context: JavaBlockEntityContext
): void => {
    const range = numberAt(java, 'required_player_range');
    if (range !== undefined) bedrock.addValue('required_player_range', new Types.NumberVal(range));

    for (const key of ['normal_config', 'ominous_config'] as const) {
        const inline = compoundAt(java, key);
        const reference = stringAt(java, key);
        const resolved = inline ?? (reference === undefined ? undefined : context.trialSpawnerConfig?.(reference));
        if (resolved !== undefined) bedrock.addChild(translateTrialConfig(resolved, java, key));
    }
};

/**
 * A monster spawner's mob and its rates.
 *
 * Java buries the mob two levels down and Bedrock names it at the top; the seven rate fields are
 * spelled the same on both sides and stored as shorts on both sides, so they carry across as
 * they are.
 */
const translateMobSpawner = (bedrock: NBTTagCompound, java: NBTTagCompound): void => {
    const entity = compoundAt(compoundAt(java, 'SpawnData') ?? java, 'entity');
    const javaType = entity === undefined ? undefined : stringAt(entity, 'id');
    const type = javaType === undefined ? undefined : bedrockEntityTypeOf(javaType);
    if (type !== undefined) bedrock.addValue('EntityIdentifier', new Types.StringVal(type));

    for (const key of SPAWNER_SHORTS) {
        const value = numberAt(java, key);
        if (value !== undefined) bedrock.addValue(key, new Types.ShortVal(value));
    }

    const potentials = new Set<NBTTagCompound>();
    for (const entry of compoundsAt(java, 'SpawnPotentials')) {
        const actor = compoundAt(compoundAt(entry, 'data') ?? entry, 'entity');
        const id = actor === undefined ? undefined : stringAt(actor, 'id');
        const bedrockType = id === undefined ? undefined : bedrockEntityTypeOf(id);
        if (bedrockType === undefined) continue;

        const potential = new NBTTagCompound('');
        potential.addValue('TypeId', new Types.StringVal(bedrockType));
        potential.addValue('Weight', new Types.NumberVal(numberAt(entry, 'weight') ?? 1));
        potentials.add(potential);
    }
    if (potentials.size > 0) bedrock.addValue('SpawnPotentials', potentials);
};

/** The translators that need more than a copy, by Java block entity type. */
const TRANSLATORS: Readonly<
    Record<string, (bedrock: NBTTagCompound, java: NBTTagCompound, context: JavaBlockEntityContext) => void>
> = {
    'minecraft:banner': translateBanner,
    'minecraft:decorated_pot': (bedrock, java) => translateDecoratedPot(bedrock, java),
    'minecraft:hanging_sign': (bedrock, java) => translateSign(bedrock, java),
    'minecraft:item_frame': (bedrock, java) => translateItemFrame(bedrock, java),
    'minecraft:mob_spawner': (bedrock, java) => translateMobSpawner(bedrock, java),
    'minecraft:sign': (bedrock, java) => translateSign(bedrock, java),
    'minecraft:trial_spawner': translateTrialSpawner,
    'minecraft:vault': (bedrock, java) => translateVault(bedrock, java)
};

/**
 * Writes a Java block entity's contents into the Bedrock compound being built for it.
 *
 * The compound is added to rather than replaced, so whatever the caller already put there, the
 * `id`, the position and a generated container's loot table, stays where it is.
 *
 * @param bedrock - The Bedrock block entity compound, which is mutated.
 * @param java - The block entity as a Java structure template saved it.
 * @param context - What the saved compound does not carry: the Java block, and a resolver for a
 *   trial spawner's configuration references.
 */
export const applyJavaBlockEntityContent = (
    bedrock: NBTTagCompound,
    java: NBTTagCompound,
    context: JavaBlockEntityContext = {}
): void => {
    const javaType = stringAt(java, 'id');
    if (javaType === undefined) return;

    TRANSLATORS[javaType]?.(bedrock, java, context);

    // A comparator names its output the same on both sides, and the containers all keep their
    // stacks in a list spelled the same way. Neither needs a translator of its own; what the
    // stacks inside the list need is the item translation every stack gets.
    if (javaType === 'minecraft:comparator') {
        const signal = numberAt(java, 'OutputSignal');
        if (signal !== undefined) bedrock.addValue('OutputSignal', new Types.NumberVal(signal));
    }

    if (ITEM_LIST_TYPES.has(javaType)) translateItems(bedrock, java);
};
