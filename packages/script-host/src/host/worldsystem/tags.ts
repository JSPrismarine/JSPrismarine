/**
 * The tags the world and system members give the objects they make, kept apart from the ones in
 * `serverObjects.ts` so the areas that add objects to `@minecraft/server` never pick the same
 * number. A tag only has to be unique among the objects one pack holds at once.
 */
export const WORLD_TAG = {
    /** `system.serverSystemInfo`. */
    systemInfo: 2001,
    /** `world.tickingAreaManager`. */
    tickingAreaManager: 2003,
    /** `world.getLootTableManager()`. */
    lootTableManager: 2004,
    /** A loot table, or a part of one; its state names the table and the part's path in it. */
    loot: 2005,
    /** `world.primitiveShapesManager`. */
    primitiveShapesManager: 2006,
    /** `world.soundDefinitionRegistry`. */
    soundDefinitionRegistry: 2007,
    /** A sound definition; its state is the sound event's id. */
    soundDefinition: 2008,
    /** A sound's duration; its state names its sound. */
    soundDuration: 2009,
    /** A biome type; its state is the biome's id. */
    biomeType: 2010,
    /** A world clock; its state is the clock's name. */
    worldClock: 2011,
    /** A clock's time marker; its state names the clock and the marker. */
    timeMarker: 2012,
    /** A dimension's point of interest manager; its state is the dimension's id. */
    poiManager: 2013,
    /** A dimension's point of interest blocks; its state is the dimension's id. */
    poiBlockManager: 2014,
    /** A point of interest block type; its state is the type's id. */
    poiBlockType: 2015,
    /** A point of interest block; its state names the dimension and the block. */
    poiBlockInstance: 2016,
    /** The `System` a ticking area's watch clears its task through. */
    watchSystem: 2017
} as const;
