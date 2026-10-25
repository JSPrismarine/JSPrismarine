/**
 * A typed `CommandHost` that does nothing, for tests and for a server that
 * has not wired a subsystem yet.
 *
 * Every method answers the "nothing happened" value for its return type, so a
 * test overrides only the two or three verbs the command under test calls and
 * still gets a fully typed host rather than a cast.
 */
import type {
    CommandHost,
    DataCommandHost,
    EntityCommandHost,
    EntityRef,
    Rotation,
    ScoreboardCommandHost,
    ServerCommandHost,
    Vector3,
    WorldCommandHost
} from './host';

/** Per-group overrides for {@link testCommandHost}. */
export interface TestCommandHostOverrides {
    readonly entities?: Partial<EntityCommandHost>;
    readonly world?: Partial<WorldCommandHost>;
    readonly scoreboard?: Partial<ScoreboardCommandHost>;
    readonly data?: Partial<DataCommandHost>;
    readonly server?: Partial<ServerCommandHost>;
}

const entities = (): EntityCommandHost => ({
    select: () => [],
    related: () => [],
    summon: () => undefined,
    kill: () => false,
    damage: () => false,
    teleport: () => false,
    ride: () => false,
    setGameMode: () => false,
    giveItem: () => 0,
    clearItems: () => 0,
    addEffect: () => false,
    clearEffect: () => 0,
    enchant: () => false,
    changeExperience: () => 0,
    queryExperience: () => 0,
    addTag: () => false,
    removeTag: () => false,
    listTags: () => [],
    getAttributeBase: () => undefined,
    setAttributeBase: () => false,
    getAttributeValue: () => undefined,
    addAttributeModifier: () => false,
    removeAttributeModifier: () => false,
    getAttributeModifier: () => undefined
});

const world = (): WorldCommandHost => ({
    getBlock: () => undefined,
    setBlock: () => false,
    fill: () => 0,
    clone: () => 0,
    compareRegions: () => 0,
    getTime: () => 0,
    setTime: () => {},
    addTime: () => 0,
    getWeather: () => 'clear',
    setWeather: () => {},
    getGameRule: () => undefined,
    setGameRule: () => false,
    getDifficulty: () => 'normal',
    setDifficulty: () => false,
    setWorldSpawn: () => false,
    setSpawnPoint: () => false,
    locate: () => undefined,
    place: () => false,
    particle: () => false,
    playSound: () => 0,
    stopSound: () => 0,
    spreadPlayers: () => 0,
    heightmap: () => 0,
    getBiome: () => undefined,
    isLoaded: () => false,
    dimensions: () => ['minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end']
});

const scoreboard = (): ScoreboardCommandHost => ({
    addObjective: () => false,
    removeObjective: () => false,
    listObjectives: () => [],
    setDisplay: () => false,
    getScore: () => undefined,
    setScore: () => 0,
    addScore: () => 0,
    resetScore: () => false,
    listScores: () => ({}),
    operation: () => undefined,
    enableTrigger: () => false
});

const data = (): DataCommandHost => ({
    getData: () => undefined,
    countData: () => 0,
    mergeData: () => false,
    modifyData: () => false,
    removeData: () => false,
    applyItemModifier: () => 0,
    setSlot: () => 0,
    copySlots: () => 0,
    runLootTable: () => 0,
    testPredicate: () => false,
    runFunction: () => 0,
    schedule: () => false,
    clearSchedule: () => 0,
    randomValue: () => 0,
    resetRandomSequence: () => false
});

const server = (): ServerCommandHost => ({
    addOperator: () => false,
    removeOperator: () => false,
    kick: () => false,
    listPlayers: () => [],
    stop: () => {},
    reload: () => {},
    transfer: () => false,
    recipes: () => 0,
    sendMessage: () => {},
    sendTitle: () => {},
    shakeCamera: () => 0,
    setFog: () => 0,
    playAnimation: () => 0,
    usage: () => []
});

/**
 * Builds a `CommandHost` whose every verb reports that nothing happened.
 *
 * @param overrides - Replacements, merged per group, so a test can name one
 *   method without restating the other fifty.
 */
export const testCommandHost = (overrides: TestCommandHostOverrides = {}): CommandHost => ({
    entities: { ...entities(), ...overrides.entities },
    world: { ...world(), ...overrides.world },
    scoreboard: { ...scoreboard(), ...overrides.scoreboard },
    data: { ...data(), ...overrides.data },
    server: { ...server(), ...overrides.server }
});

/** Builds an entity reference with sensible defaults, for tests. */
export const testEntity = (overrides: Partial<EntityRef> = {}): EntityRef => {
    const position: Vector3 = overrides.position ?? { x: 0, y: 64, z: 0 };
    const rotation: Rotation = overrides.rotation ?? { yaw: 0, pitch: 0 };
    return {
        id: overrides.id ?? 'entity-1',
        type: overrides.type ?? 'minecraft:player',
        name: overrides.name ?? 'Steve',
        isPlayer: overrides.isPlayer ?? true,
        position,
        rotation,
        dimension: overrides.dimension ?? 'minecraft:overworld'
    };
};
