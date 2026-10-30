import type { IntProvider } from '../carver/providers';
import { parseIntProvider } from '../carver/providers';
import { asObject, boolean, inRange, integer, number, oneOf, optional, string, stringOrList } from './json';

/** The sky a dimension renders. Replaced the `effects` field in 25w45a. */
export type DimensionSkybox = 'overworld' | 'none' | 'end';

/** The directional shading a dimension's blocks get. Replaced the `effects` field in 25w45a. */
export type DimensionCardinalLight = 'default' | 'nether';

/**
 * One `data/<namespace>/dimension_type/<name>.json` document in its 26.3 shape.
 *
 * The booleans older versions kept at the top level (`ultrawarm`, `bed_works`, `piglin_safe`,
 * `has_raids`, `natural`, `respawn_anchor_works`) moved into {@link attributes} in 1.21.11, so
 * this definition carries the physics and the clock and leaves the gameplay rules as data.
 */
export interface DimensionTypeDefinition {
    /** The lowest block y, a multiple of 16 between -2032 and 2031. */
    readonly minY: number;
    /** How many blocks the dimension spans above `minY`, a multiple of 16 between 16 and 4064. */
    readonly height: number;
    /** The ceiling for chorus fruit and portal placement; at most `height`. */
    readonly logicalHeight: number;
    /** The multiplier applied to x and z when leaving the dimension; 8 for the nether. */
    readonly coordinateScale: number;
    /** Whether sky light exists. False also disables weather. */
    readonly hasSkylight: boolean;
    /** Whether a bedrock ceiling closes the dimension, which changes respawn and map behavior. */
    readonly hasCeiling: boolean;
    /** Whether the clock never advances; replaced `fixed_time` in 25w45a. */
    readonly hasFixedTime: boolean;
    /** Whether the ender dragon fight runs here. */
    readonly hasEnderDragonFight: boolean;
    /** Light added to every block, 0 to 1. */
    readonly ambientLight: number;
    /** The light test a monster spawn has to pass. */
    readonly monsterSpawnLightLevel: IntProvider;
    /** The block light a monster spawn position may have at most. */
    readonly monsterSpawnBlockLightLimit: number;
    /** The block tag, or since 26.2 the block id, that burns forever. Kept as written. */
    readonly infiniburn: string;
    /** The sky the client renders. Defaults to `overworld`. */
    readonly skybox: DimensionSkybox;
    /** The directional block shading. Defaults to `default`. */
    readonly cardinalLight: DimensionCardinalLight;
    /** The clock `/time` and sleeping act on; absent for the nether. */
    readonly defaultClock?: string;
    /** The timeline ids or tags that run in this dimension. Kept as written. */
    readonly timelines: readonly string[];
    /** Environment attributes keyed by attribute id. Values stay as parsed JSON. */
    readonly attributes: ReadonlyMap<string, unknown>;
}

/** Java's bounds for `min_y` and `height`, from `DimensionType`. */
const MIN_Y_MIN = -2032;
const MIN_Y_MAX = 2031;
const HEIGHT_MIN = 16;
const HEIGHT_MAX = 4064;
const MAX_Y_EXCLUSIVE = 2032;
const COORDINATE_SCALE_MIN = 1e-5;
const COORDINATE_SCALE_MAX = 3e7;

const SKYBOXES: readonly DimensionSkybox[] = ['overworld', 'none', 'end'];
const CARDINAL_LIGHTS: readonly DimensionCardinalLight[] = ['default', 'nether'];

/**
 * Reads one `dimension_type` JSON document.
 *
 * `min_y`, `height`, `logical_height`, `coordinate_scale`, `has_skylight`, `has_ceiling`,
 * `ambient_light`, `monster_spawn_light_level`, `monster_spawn_block_light_limit` and
 * `infiniburn` are required, as in Java. `has_fixed_time` and `has_ender_dragon_fight` default
 * to false, `skybox` to `overworld`, `cardinal_light` to `default`, `timelines` and `attributes`
 * to empty, and `default_clock` stays absent.
 *
 * @param path - Where the document came from, for error messages.
 * @throws When a required field is missing, a field has the wrong shape, or the vertical bounds
 *   fall outside Java's limits.
 */
export const parseDimensionType = (json: unknown, path = '<dimension_type>'): DimensionTypeDefinition => {
    const raw = asObject(json, path);

    const minY = inRange(integer(raw['min_y'], `${path}.min_y`), `${path}.min_y`, MIN_Y_MIN, MIN_Y_MAX);
    const height = inRange(integer(raw['height'], `${path}.height`), `${path}.height`, HEIGHT_MIN, HEIGHT_MAX);
    if (minY % 16 !== 0) throw new RangeError(`${path}.min_y has to be a multiple of 16, got ${minY}`);
    if (height % 16 !== 0) throw new RangeError(`${path}.height has to be a multiple of 16, got ${height}`);
    if (minY + height > MAX_Y_EXCLUSIVE) {
        throw new RangeError(`${path}: min_y + height has to be at most ${MAX_Y_EXCLUSIVE}, got ${minY + height}`);
    }
    const logicalHeight = inRange(
        integer(raw['logical_height'], `${path}.logical_height`),
        `${path}.logical_height`,
        0,
        height
    );
    const coordinateScale = number(raw['coordinate_scale'], `${path}.coordinate_scale`);
    if (coordinateScale < COORDINATE_SCALE_MIN || coordinateScale > COORDINATE_SCALE_MAX) {
        throw new RangeError(
            `${path}.coordinate_scale has to be between ${COORDINATE_SCALE_MIN} and ${COORDINATE_SCALE_MAX}, got ${coordinateScale}`
        );
    }

    const timelines = optional(raw['timelines'], [] as readonly string[], (value) => {
        const read = stringOrList(value, `${path}.timelines`);
        return typeof read === 'string' ? [read] : read;
    });

    const attributes = new Map<string, unknown>(
        Object.entries(optional(raw['attributes'], {}, (value) => asObject(value, `${path}.attributes`)))
    );

    const defaultClock = optional(raw['default_clock'], undefined, (value) => string(value, `${path}.default_clock`));

    return {
        minY,
        height,
        logicalHeight,
        coordinateScale,
        hasSkylight: boolean(raw['has_skylight'], `${path}.has_skylight`),
        hasCeiling: boolean(raw['has_ceiling'], `${path}.has_ceiling`),
        hasFixedTime: optional(raw['has_fixed_time'], false, (value) => boolean(value, `${path}.has_fixed_time`)),
        hasEnderDragonFight: optional(raw['has_ender_dragon_fight'], false, (value) =>
            boolean(value, `${path}.has_ender_dragon_fight`)
        ),
        ambientLight: number(raw['ambient_light'], `${path}.ambient_light`),
        monsterSpawnLightLevel: parseIntProvider(raw['monster_spawn_light_level'], `${path}.monster_spawn_light_level`),
        monsterSpawnBlockLightLimit: inRange(
            integer(raw['monster_spawn_block_light_limit'], `${path}.monster_spawn_block_light_limit`),
            `${path}.monster_spawn_block_light_limit`,
            0,
            15
        ),
        infiniburn: string(raw['infiniburn'], `${path}.infiniburn`),
        skybox: optional(raw['skybox'], 'overworld', (value) => oneOf(value, `${path}.skybox`, SKYBOXES)),
        cardinalLight: optional(raw['cardinal_light'], 'default', (value) =>
            oneOf(value, `${path}.cardinal_light`, CARDINAL_LIGHTS)
        ),
        ...(defaultClock === undefined ? {} : { defaultClock }),
        timelines,
        attributes
    };
};
