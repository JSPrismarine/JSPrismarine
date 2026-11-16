import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

/** Java's navigation, path costs, and pushability, read after the entity registers its goals. */
export interface JavaEntityNavigation {
    /** The Java class that owns the entity's path navigation. */
    readonly navigationClass: string;
    /** Whether Java's goal registrations enabled floating through liquid. */
    readonly canFloat: boolean;
    /** Whether the navigator can follow paths on solid ground. */
    readonly canNavigateGround: boolean;
    /** Whether Java's node evaluator routes through closed wooden doors, which the mob opens. */
    readonly canOpenDoors?: boolean;
    /** Whether Java's node evaluator routes through open doors. */
    readonly canPassDoors?: boolean;
    /** Whether Java's node evaluator treats fences and walls as a step rather than a wall. */
    readonly canWalkOverFences?: boolean;
    /** The Java move-control class the mob turns and steers with. */
    readonly moveControlClass?: string;
    /** The degrees a `SmoothSwimmingMoveControl` turns the body each tick, present only for one. */
    readonly maxTurnY?: number;
    /** Whether Java lets this living entity push and be pushed by other entities. */
    readonly pushable: boolean;
    /** Java's per-path-type cost, with negative values marking blocked terrain. */
    readonly pathfindingMalus: Readonly<Record<string, number>>;
}

/** Java mob navigation data keyed by the Java entity identifier. */
export type JavaNavigationSource = Readonly<Record<string, JavaEntityNavigation>>;

const bedrockKeyedSources = new WeakMap<JavaNavigationSource, ReadonlyMap<string, JavaEntityNavigation>>();

/** Builds a source's Bedrock-keyed view on first use and keeps it. */
const bedrockKeyed = (source: JavaNavigationSource): ReadonlyMap<string, JavaEntityNavigation> => {
    const cached = bedrockKeyedSources.get(source);
    if (cached !== undefined) return cached;

    const byBedrock = new Map<string, JavaEntityNavigation>();
    const ambiguous = new Set<string>();
    for (const [javaIdentifier, navigation] of Object.entries(source)) {
        const mapped = javaEntityTypeToBedrock(javaIdentifier);
        if (mapped.kind !== 'mapped' || mapped.bedrock === javaIdentifier) continue;
        if (ambiguous.has(mapped.bedrock)) continue;
        if (byBedrock.has(mapped.bedrock)) {
            byBedrock.delete(mapped.bedrock);
            ambiguous.add(mapped.bedrock);
            continue;
        }
        byBedrock.set(mapped.bedrock, navigation);
    }

    bedrockKeyedSources.set(source, byBedrock);
    return byBedrock;
};

/** Java's navigation for the entity a Bedrock identifier spawns, when the dump has that type. */
export const javaEntityNavigation = (
    identifier: string,
    source: JavaNavigationSource | undefined
): JavaEntityNavigation | undefined =>
    source === undefined ? undefined : (source[identifier] ?? bedrockKeyed(source).get(identifier));

/** How far `MoveControl.tick` and `FlyingMoveControl.tick` turn a mob toward its waypoint each tick. */
export const JAVA_MOVE_CONTROL_TURN = 90;

/**
 * The move controls that set a mob's heading themselves rather than turn it by a step: the vex
 * faces its target outright, the phantom steers along its own circle and the ghast leaves the
 * heading to its look goals.
 */
const SELF_STEERING_MOVE_CONTROLS = ['$VexMoveControl', '$PhantomMoveControl', '$GhastMoveControl'];

/**
 * The most degrees Java's move control turns the mob's body toward its waypoint in one tick.
 *
 * Every Java move control turns the body by `rotlerp(yaw, target, 90)` but three:
 * `SmoothSwimmingMoveControl` turns it by its own `maxTurnY`, 10 for the axolotl, the dolphin,
 * the frog, the nautilus and the tadpole, and the vex, phantom and ghast controls set the heading
 * outright.
 * @returns The turn in degrees, or undefined when the mob's control sets its heading without a limit.
 */
export const javaMoveControlTurn = (navigation: JavaEntityNavigation): number | undefined => {
    if (navigation.maxTurnY !== undefined) return navigation.maxTurnY;
    const moveControl = navigation.moveControlClass;
    if (moveControl === undefined) return undefined;
    return SELF_STEERING_MOVE_CONTROLS.some((suffix) => moveControl.endsWith(suffix))
        ? undefined
        : JAVA_MOVE_CONTROL_TURN;
};
