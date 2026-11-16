/**
 * Java's chicken jockey, which `Zombie.finalizeSpawn` assembles as a baby zombie spawns.
 *
 * Bedrock's zombies carry `minecraft:behavior.find_mount`, a goal that walks a baby zombie to a
 * chicken at any time. Java has no such goal: a baby zombie gets its chicken when it spawns or
 * never. On a 0.05 roll it climbs onto the first chicken with no rider and no vehicle near it;
 * otherwise, on a second 0.05 roll, a chicken spawns under it.
 */
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

/** The chicken a jockey rides. */
export const CHICKEN = 'minecraft:chicken';

/**
 * The Java entity types whose class is `Zombie` or extends it, so `Zombie.finalizeSpawn` runs as
 * they spawn, by Bedrock identifier.
 */
export const CHICKEN_JOCKEY_RIDERS: ReadonlySet<string> = new Set(
    [
        'minecraft:zombie',
        'minecraft:husk',
        'minecraft:drowned',
        'minecraft:zombie_villager',
        'minecraft:zombified_piglin'
    ]
        .map(javaEntityTypeToBedrock)
        .flatMap((mapped) => (mapped.kind === 'mapped' ? [mapped.bedrock] : []))
);

/** The chance of each of `Zombie.finalizeSpawn`'s two rolls: `random.nextFloat() < 0.05`. */
export const CHICKEN_JOCKEY_CHANCE = 0.05;

/**
 * How far `Zombie.finalizeSpawn` inflates the baby's box to look for a chicken:
 * `getBoundingBox().inflate(5.0, 3.0, 5.0)`.
 */
export const CHICKEN_SEARCH = { horizontal: 5, vertical: 3 } as const;

/** What the rolls reach in the world. */
export interface ChickenJockeyHost<Chicken> {
    /** Java's `random.nextFloat()` for the baby. */
    nextFloat(): number;
    /** The chickens in the search box with no rider and no vehicle, in the order Java lists them. */
    freeChickens(): readonly Chicken[];
    /** Spawns an adult chicken where the baby stands, or answers undefined when none can spawn. */
    spawnChicken(): Chicken | undefined;
    /** Seats the baby on the chicken. */
    mount(chicken: Chicken): void;
}

/**
 * Runs `Zombie.finalizeSpawn`'s jockey rolls for a baby zombie that has just spawned.
 *
 * The second roll runs only when the first fails, so a baby whose first roll wins with no free
 * chicken near it stays on foot.
 *
 * @returns The chicken the baby rides, or undefined when it rides none.
 */
export const assembleChickenJockey = <Chicken>(host: ChickenJockeyHost<Chicken>): Chicken | undefined => {
    if (host.nextFloat() < CHICKEN_JOCKEY_CHANCE) {
        const [chicken] = host.freeChickens();
        if (chicken !== undefined) host.mount(chicken);
        return chicken;
    }
    if (host.nextFloat() >= CHICKEN_JOCKEY_CHANCE) return undefined;
    const chicken = host.spawnChicken();
    if (chicken !== undefined) host.mount(chicken);
    return chicken;
};
