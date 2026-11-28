/**
 * A typed `CommandHost` that does nothing, for tests and for a server that
 * has not wired a subsystem yet.
 *
 * Every method answers the "nothing happened" value for its return type, so a
 * test overrides only the two or three verbs the command under test calls and
 * still gets a fully typed host rather than a cast. The allow list is the
 * exception: it keeps its names, so `/allowlist` answers a run of lines as a
 * server would.
 */
import type {
    AllowListCommandHost,
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
    countItems: () => 0,
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
    getGameTime: () => 0,
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
    locateNames: () => [],
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
    criterionOf: () => undefined,
    setDisplayName: () => false,
    setDisplay: () => false,
    holders: () => [],
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
    modifyData: () => 0,
    removeData: () => 0,
    countSlots: () => 0,
    countSlotItems: () => 0,
    applyItemModifier: () => 0,
    setSlot: () => 0,
    copySlots: () => 0,
    runLoot: () => 0,
    testPredicate: () => false,
    runFunction: () => ({ result: 0, matched: false }),
    returnFromFunction: () => 0,
    schedule: () => false,
    clearSchedule: () => 0,
    randomValue: () => 0,
    resetRandomSequence: () => false
});

/**
 * An allow list held in memory, on a server that does not authenticate players online, as the
 * console capture's Bedrock Dedicated Server does not.
 */
const allowList = (): AllowListCommandHost => {
    const names: string[] = [];
    return {
        add: (name) => !names.includes(name) && names.push(name) > 0,
        remove: (name) => {
            const index = names.indexOf(name);
            if (index < 0) return false;
            names.splice(index, 1);
            return true;
        },
        entries: () => names.map((name) => ({ name, ignoresPlayerLimit: false })),
        setEnabled: (enabled) => !enabled,
        reload: () => {}
    };
};

const server = (): ServerCommandHost => ({
    allowList: allowList(),
    addOperator: () => false,
    removeOperator: () => false,
    kick: () => false,
    listPlayers: () => [],
    stop: () => {},
    reload: () => {},
    ticking: {
        rate: () => 20,
        setRate: () => {},
        tickMs: () => 0,
        measuredRate: () => 20,
        frozen: () => false,
        setFrozen: () => {},
        step: () => false,
        stopStep: () => false,
        sprint: () => {},
        stopSprint: () => false
    },
    transfer: () => false,
    recipes: () => [],
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
