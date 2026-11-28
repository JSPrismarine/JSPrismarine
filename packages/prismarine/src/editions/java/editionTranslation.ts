/**
 * One value in both editions' terms: the world's Bedrock id, and the id a Java Edition client
 * names it by, each way.
 *
 * `@jsprismarine/mapping` maps names and properties both ways; a translation joins that to each
 * side's numbers, Bedrock's runtime ids and Java's network ids, so a chunk going out and a block a
 * Java player places coming in go through the same pair. Each answer is remembered, both ways, so
 * a value is looked up once for as long as the server runs.
 */
import {
    bedrockBiomeToJava,
    bedrockBlockStateToJava,
    javaBlockStateToBedrock,
    javaEntityTypeToBedrock,
    javaIdentifierToBedrock,
    javaItemToBedrock
} from '@jsprismarine/mapping';
import { BLOCK_STATES, CONFIGURATION, ENTITY_TYPES, ITEMS } from '@jsprismarine/protocol/java/versions/newest';

import { blockFromContent } from '../../block/Block';
import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { ServerContent } from '../../content/ServerContent';

/** A value with a Bedrock form and a Java form, translated either way. */
export interface EditionTranslation<Bedrock, Java> {
    /** What a Java client is sent for a Bedrock value. */
    toJava(value: Bedrock): Java;
    /** What the world takes for a value a Java client sent. */
    toBedrock(value: Java): Bedrock;
}

/**
 * A translation that remembers each answer it gave, in each direction.
 * @param translation - The lookups to remember.
 * @returns The same translation, looking each value up once.
 */
export const cachedTranslation = <Bedrock, Java>(
    translation: EditionTranslation<Bedrock, Java>
): EditionTranslation<Bedrock, Java> => {
    const toJava = new Map<Bedrock, Java>();
    const toBedrock = new Map<Java, Bedrock>();
    return {
        toJava: (value) => {
            if (!toJava.has(value)) toJava.set(value, translation.toJava(value));
            return toJava.get(value)!;
        },
        toBedrock: (value) => {
            if (!toBedrock.has(value)) toBedrock.set(value, translation.toBedrock(value));
            return toBedrock.get(value)!;
        }
    };
};

/**
 * Block states: a Bedrock runtime id and a Java state id.
 *
 * A Bedrock-only block, which no Java state reaches, is sent as stone, so the ground stays solid
 * where it stands. One the content says nothing collides with, such as a pack's light or
 * decoration, is sent as Java's invisible `minecraft:light` at the block's light level, or as air
 * when it gives no light, so a Java player neither sees a stone block that is not there nor gets
 * pushed into a crawl by one. A Java state the mapping lists as a loss becomes the Bedrock
 * fallback the loss names, and one it does not know becomes air.
 * @param content - The server's content, read when a block is first sent, which says whether a
 *   Bedrock-only block collides and how much light it gives. Without it every such block is stone.
 * @returns The translation, cached.
 */
export const javaBlockTranslation = (
    content: () => ServerContent | undefined = () => undefined
): EditionTranslation<number, number> => {
    const javaAir = BLOCK_STATES.idOf('minecraft:air') ?? 0;
    const javaStone = BLOCK_STATES.idOf('minecraft:stone') ?? 1;
    const bedrockAir = () => BlockRuntimeIds.getByName('minecraft:air');
    /** What a Java client is sent for a block no Java state maps to. */
    const unmapped = (name: string, properties: Parameters<typeof blockFromContent>[2]): number => {
        const loaded = content();
        const block = loaded === undefined ? null : blockFromContent(name, loaded, properties);
        if (block === null || block.isSolid()) return javaStone;
        const level = block.getLightLevel();
        if (level <= 0) return javaAir;
        return BLOCK_STATES.idOf('minecraft:light', { level: String(level), waterlogged: 'false' }) ?? javaAir;
    };
    return cachedTranslation({
        toJava: (runtimeId) => {
            const state = BlockRuntimeIds.getState(runtimeId);
            if (state === null || state.name === 'minecraft:air') return javaAir;
            const mapped = bedrockBlockStateToJava(state.name, state.properties);
            if (mapped.kind !== 'mapped') return unmapped(state.name, state.properties);
            return BLOCK_STATES.idOf(mapped.java.name, mapped.java.properties) ?? javaStone;
        },
        toBedrock: (javaId) => {
            const java = BLOCK_STATES.stateOf(javaId);
            if (java === undefined) return bedrockAir();
            const mapped = javaBlockStateToBedrock(java.name, java.properties);
            if (mapped.kind === 'unknown') return bedrockAir();
            return BlockRuntimeIds.tryGetByState(mapped.bedrock.name, mapped.bedrock.states) ?? bedrockAir();
        }
    });
};

/** Each Java state's waterlogged form, as it is first asked for. */
const waterloggedStates = new Map<number, number>();

/**
 * A Java state with water in it: the same block with `waterlogged` true, which is how Java keeps
 * what Bedrock keeps in a block's second storage layer. A state with no `waterlogged` property
 * holds no water and stays as it is.
 * @param javaId - The Java state id.
 * @returns The waterlogged state's id.
 */
export const javaWaterloggedOf = (javaId: number): number => {
    const known = waterloggedStates.get(javaId);
    if (known !== undefined) return known;
    const state = BLOCK_STATES.stateOf(javaId);
    const waterlogged =
        state === undefined || !('waterlogged' in state.properties)
            ? javaId
            : (BLOCK_STATES.idOf(state.name, { ...state.properties, waterlogged: 'true' }) ?? javaId);
    waterloggedStates.set(javaId, waterlogged);
    return waterlogged;
};

/** The biome registry a Java client was configured with, in network id order. */
export const JAVA_BIOMES: readonly string[] =
    CONFIGURATION.registries.find(({ registry }) => registry === 'minecraft:worldgen/biome')?.entries ?? [];

/**
 * Biomes: a Bedrock biome id and a Java biome's network id, its index in the configured registry.
 * A biome either edition lacks becomes plains.
 * @returns The translation, cached.
 */
export const javaBiomeTranslation = (): EditionTranslation<number, number> => {
    const javaPlains = Math.max(0, JAVA_BIOMES.indexOf('minecraft:plains'));
    const bedrockPlains = (): number => {
        const plains = bedrockBiomeToJava('minecraft:plains');
        return plains.kind === 'unknown' ? 1 : plains.bedrock.id;
    };
    return cachedTranslation({
        toJava: (biome) => {
            const mapped = bedrockBiomeToJava(biome);
            const index = mapped.kind === 'mapped' ? JAVA_BIOMES.indexOf(mapped.java) : -1;
            return index === -1 ? javaPlains : index;
        },
        toBedrock: (javaBiome) => {
            const name = JAVA_BIOMES[javaBiome];
            const mapped = name === undefined ? undefined : javaIdentifierToBedrock('biome', name);
            if (mapped?.kind !== 'mapped' && mapped?.kind !== 'passthrough') return bedrockPlains();
            const bedrock = bedrockBiomeToJava(mapped.bedrock);
            return bedrock.kind === 'unknown' ? bedrockPlains() : bedrock.bedrock.id;
        }
    });
};

/**
 * Entity types: a Bedrock identifier and a Java entity type's network id, or undefined for a type
 * no Java entity shows as. The inverse comes from the forward mapping: each Java type's Bedrock
 * identifier, read over the whole registry once; a Bedrock type the mapping never names is looked
 * for under its own name.
 * @returns The translation, cached.
 */
export const javaEntityTranslation = (): EditionTranslation<string, number | undefined> => {
    let byBedrock: Map<string, number> | undefined;
    const inverse = (): Map<string, number> => {
        if (byBedrock !== undefined) return byBedrock;
        byBedrock = new Map();
        for (let id = 0; id < ENTITY_TYPES.size; id++) {
            const name = ENTITY_TYPES.nameOf(id)!;
            const mapped = javaEntityTypeToBedrock(name);
            const bedrock = mapped.kind === 'mapped' || mapped.kind === 'passthrough' ? mapped.bedrock : undefined;
            if (bedrock !== undefined && !byBedrock.has(bedrock)) byBedrock.set(bedrock, id);
        }
        return byBedrock;
    };
    return cachedTranslation({
        toJava: (bedrock) => inverse().get(bedrock) ?? ENTITY_TYPES.idOf(bedrock),
        toBedrock: (javaId) => {
            const name = javaId === undefined ? undefined : ENTITY_TYPES.nameOf(javaId);
            const mapped = name === undefined ? undefined : javaEntityTypeToBedrock(name);
            return mapped?.kind === 'mapped' || mapped?.kind === 'passthrough' ? mapped.bedrock : '';
        }
    });
};

/**
 * Items: a Bedrock identifier and a Java item's network id, or undefined for an item no Java item
 * shows as. As with entity types, the inverse is the forward mapping read over the whole registry
 * once, where an item Java has under the same identifier wins over the others that map onto it. A
 * Java item the mapping lists as a loss becomes the Bedrock fallback the loss names.
 * @returns The translation, cached.
 */
export const javaItemTranslation = (): EditionTranslation<string, number | undefined> => {
    let byBedrock: Map<string, number> | undefined;
    const bedrockOf = (javaName: string): string | undefined => {
        const mapped = javaItemToBedrock(javaName);
        return mapped.kind === 'unknown' ? undefined : mapped.bedrock.identifier;
    };
    const inverse = (): Map<string, number> => {
        if (byBedrock !== undefined) return byBedrock;
        byBedrock = new Map();
        for (let id = 0; id < ITEMS.size; id++) {
            const name = ITEMS.nameOf(id)!;
            const bedrock = bedrockOf(name);
            if (bedrock !== undefined && (bedrock === name || !byBedrock.has(bedrock))) byBedrock.set(bedrock, id);
        }
        return byBedrock;
    };
    return cachedTranslation({
        toJava: (bedrock) => inverse().get(bedrock) ?? ITEMS.idOf(bedrock),
        toBedrock: (javaId) => {
            const name = javaId === undefined ? undefined : ITEMS.nameOf(javaId);
            return (name === undefined ? undefined : bedrockOf(name)) ?? 'minecraft:air';
        }
    });
};
