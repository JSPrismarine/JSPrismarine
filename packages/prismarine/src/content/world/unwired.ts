/**
 * The adapter the server uses before any subsystem has supplied a real one.
 *
 * Every member throws {@link NotWiredError} naming the subsystem that owes
 * it. That is deliberate: content can be built, behavior families registered
 * and the registries read with no world at all, and the first hook that
 * actually touches the world says which subsystem is missing rather than
 * reading air out of an empty map.
 */
import { CONTENT_AREAS, notWired } from './notWired';
import type { ContentLevelFacts, ServerWorldAdapter, ServerWorldSource } from './adapter';

/** What {@link unwiredWorld} needs to answer without a world behind it. */
export interface UnwiredWorldOptions {
    /** The dimension the adapter reports, defaulting to `minecraft:overworld`. */
    readonly dimension?: string;
    /** The world seed the adapter reports, defaulting to zero. */
    readonly seed?: bigint;
}

/** The overworld bounds, which are the ones a dimensionless caller means. */
const OVERWORLD = { minY: -64, maxY: 320, seaLevel: 63 } as const;

/**
 * An adapter whose every member throws.
 *
 * The four facts a dimension knows about itself without a world behind it,
 * its identifier, its bounds and its seed, are answered rather than thrown,
 * because a caller that only reads them is asking a question the server can
 * honestly answer and failing it would hide the members that genuinely are
 * missing.
 */
export const unwiredWorld = (options: UnwiredWorldOptions = {}): ServerWorldAdapter => {
    const level: ContentLevelFacts = {
        dimension: options.dimension ?? 'minecraft:overworld',
        minY: OVERWORLD.minY,
        maxY: OVERWORLD.maxY,
        hasSkyLight: true,
        seaLevel: OVERWORLD.seaLevel,
        seed: options.seed ?? 0n,
        gameTime: notWired('level.gameTime', CONTENT_AREAS.world),
        dayTime: notWired('level.dayTime', CONTENT_AREAS.world),
        difficulty: notWired('level.difficulty', CONTENT_AREAS.world),
        weather: notWired('level.weather', CONTENT_AREAS.world),
        isRainingAt: notWired('level.isRainingAt', CONTENT_AREAS.world),
        spawnPosition: notWired('level.spawnPosition', CONTENT_AREAS.world),
        gameRule: notWired('level.gameRule', CONTENT_AREAS.world)
    };

    return {
        level,
        blocks: {
            get: notWired('blocks.get', CONTENT_AREAS.blocksAndItems),
            set: notWired('blocks.set', CONTENT_AREAS.blocksAndItems),
            notifyNeighbors: notWired('blocks.notifyNeighbors', CONTENT_AREAS.blocksAndItems),
            data: notWired('blocks.data', CONTENT_AREAS.blocksAndItems),
            setData: notWired('blocks.setData', CONTENT_AREAS.blocksAndItems),
            light: notWired('blocks.light', CONTENT_AREAS.world),
            power: notWired('blocks.power', CONTENT_AREAS.blocksAndItems),
            isLoaded: notWired('blocks.isLoaded', CONTENT_AREAS.world),
            surfaceY: notWired('blocks.surfaceY', CONTENT_AREAS.world),
            biome: notWired('blocks.biome', CONTENT_AREAS.world),
            biomeTags: notWired('blocks.biomeTags', CONTENT_AREAS.world)
        },
        entities: {
            at: notWired('entities.at', CONTENT_AREAS.entities),
            near: notWired('entities.near', CONTENT_AREAS.entities),
            players: notWired('entities.players', CONTENT_AREAS.entities),
            spawn: notWired('entities.spawn', CONTENT_AREAS.entities),
            remove: notWired('entities.remove', CONTENT_AREAS.entities),
            drop: notWired('entities.drop', CONTENT_AREAS.entities),
            countOfType: notWired('entities.countOfType', CONTENT_AREAS.entities)
        },
        effects: {
            playSound: notWired('effects.playSound', CONTENT_AREAS.network),
            spawnParticle: notWired('effects.spawnParticle', CONTENT_AREAS.network),
            emitGameEvent: notWired('effects.emitGameEvent', CONTENT_AREAS.network)
        },
        ticks: {
            schedule: notWired('ticks.schedule', CONTENT_AREAS.world),
            isScheduled: notWired('ticks.isScheduled', CONTENT_AREAS.world),
            runsThisTick: notWired('ticks.runsThisTick', CONTENT_AREAS.world)
        },
        random: {
            nextFloat: notWired('random.nextFloat', CONTENT_AREAS.world),
            nextInt: notWired('random.nextInt', CONTENT_AREAS.world)
        }
    };
};

/** A {@link ServerWorldSource} that hands {@link unwiredWorld} out for every dimension. */
export const unwiredWorldSource = (options: UnwiredWorldOptions = {}): ServerWorldSource => {
    const cache = new Map<string, ServerWorldAdapter>();
    return {
        at: (dimension) => {
            const existing = cache.get(dimension);
            if (existing) return existing;
            const created = unwiredWorld({ ...options, dimension });
            cache.set(dimension, created);
            return created;
        }
    };
};
