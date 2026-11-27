/**
 * The ender dragon's flight, transcribed from Java 26.3's `EnderDragon.aiStep`, its
 * `EnderDragonPhaseManager` and the `DragonPhaseInstance` classes.
 *
 * Bedrock writes the dragon's AI as eight goals across three component groups: `dragon_flying`
 * holds takeoff, charge, strafe and the holding pattern, `dragon_sitting` the landing, the
 * flame and the scan, and `dragon_death` the death. Each goal is `{"priority": n}` and nothing
 * more, so the behavior is the engine's. Here it is Java's: one phase manager per dragon, whose
 * current phase decides which goal may run. A goal runs while the manager is in one of its
 * phases and ticks the manager, which runs the phase and then flies the dragon toward the
 * phase's target the way `aiStep` does.
 *
 * A change of phase that crosses between the two groups raises the dragon's own
 * `minecraft:on_start_landing` or `minecraft:on_start_takeoff` trigger, which is what moves the
 * vanilla file from one group to the other.
 *
 * The dragon flies by its own rules, as Java's `noPhysics` dragon does: the manager moves it
 * through {@link GoalWorld.moveSelf}, and its yaw is reported in the convention every other mob
 * uses, which is Java's dragon `yRot` turned half a circle.
 *
 * The arithmetic follows Java's to the bit: `float` where Java computes in `float`, Java's table
 * sine and `atan2`, and its binary heap's order among equal costs. `dragonPhases.vectors.test.ts`
 * flies seeded fights against the ones Java flew and fails on the first tick that differs.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import { DEGREES_TO_RADIANS, javaAtan2, javaCos, javaSin, wrapDegrees, wrapDegreesFloat } from '../javaMth';
import type { GoalSupport } from '../support';
import type { NodePath, PathNode } from './dragonNodes';
import { closestDragonNode, dragonPathNodes, findDragonPath, firstDragonNode, isDone } from './dragonNodes';
import type { GoalMob } from '../world';

/** Java's `EnderDragonPhase` values, by their Java names in lower case. */
export const DRAGON_PHASES = [
    'holding_pattern',
    'strafe_player',
    'landing_approach',
    'landing',
    'takeoff',
    'sitting_flaming',
    'sitting_scanning',
    'sitting_attacking',
    'charging_player',
    'dying',
    'hover'
] as const;

/** One of {@link DRAGON_PHASES}. */
export type DragonPhaseName = (typeof DRAGON_PHASES)[number];

const isDragonPhase = (value: unknown): value is DragonPhaseName =>
    typeof value === 'string' && DRAGON_PHASES.some((phase) => phase === value);

/**
 * The dragon's saved phase: Java saves `DragonPhase`, and this keeps beside it the flame count
 * the sitting phases share and where a charge is headed, so a reload resumes the same flight.
 */
export const dragonPhaseState = defineComponentState('jsprismarine:dragon_phase', {
    phase: isDragonPhase,
    flameCount: stateField.number,
    chargeTarget: stateField.nullable(stateField.list(stateField.number))
});

/** The phases the `dragon_sitting` group's goals run; the rest belong to `dragon_flying`. */
const SITTING_GROUP_PHASES: readonly DragonPhaseName[] = [
    'landing_approach',
    'landing',
    'sitting_flaming',
    'sitting_scanning',
    'sitting_attacking'
];

/** The phases Java's `isSitting` answers true for, in which damage can make the dragon take off. */
const SITTING_PHASES: readonly DragonPhaseName[] = ['sitting_scanning', 'sitting_attacking', 'sitting_flaming'];

/**
 * Whether a dragon phase is one Java's `DragonPhaseInstance.isSitting` answers true for.
 *
 * @javaSee DragonPhaseInstance.isSitting
 */
export const isSittingDragonPhase = (phase: DragonPhaseName): boolean => SITTING_PHASES.includes(phase);

/** How much of its health a sitting dragon takes before it flies off, Java's `0.25F * getMaxHealth()`. */
const SITTING_DAMAGE_SHARE = 0.25;

const f = Math.fround;

/**
 * Java's `DragonStrafePlayerPhase.FIREBALL_CHARGE_AMOUNT`.
 *
 * @javaSource DragonStrafePlayerPhase.FIREBALL_CHARGE_AMOUNT
 * @javaVerified vectors
 */
const FIREBALL_CHARGE = 5;
/**
 * Java's `DragonChargePlayerPhase.CHARGE_RECOVERY_TIME`.
 *
 * @javaSource DragonChargePlayerPhase.CHARGE_RECOVERY_TIME
 * @javaVerified vectors
 */
const CHARGE_RECOVERY_TICKS = 10;
/**
 * Java's `DragonSittingScanningPhase.SITTING_SCANNING_IDLE_TICKS`.
 *
 * @javaSource DragonSittingScanningPhase.SITTING_SCANNING_IDLE_TICKS
 * @javaVerified vectors
 */
const SCANNING_TICKS = 100;
/** How long a scan waits before it turns to the attack, in ticks. */
const SCAN_ATTACK_DELAY = 25;
/**
 * Java's `DragonSittingAttackingPhase.ROAR_DURATION`.
 *
 * @javaSource DragonSittingAttackingPhase.ROAR_DURATION
 * @javaVerified vectors
 */
const ROAR_TICKS = 40;
/**
 * Java's `DragonSittingFlamingPhase.FLAME_DURATION`.
 *
 * @javaSource DragonSittingFlamingPhase.FLAME_DURATION
 * @javaVerified vectors
 */
const FLAME_TICKS = 200;
/**
 * Java's `DragonSittingFlamingPhase.SITTING_FLAME_ATTACKS_COUNT`.
 *
 * @javaSource DragonSittingFlamingPhase.SITTING_FLAME_ATTACKS_COUNT
 */
const FLAME_ATTACKS = 4;
/**
 * Java's `DragonSittingFlamingPhase.WARMUP_TIME`.
 *
 * @javaSource DragonSittingFlamingPhase.WARMUP_TIME
 * @javaVerified vectors
 */
const FLAME_WARMUP = 10;
/** How far below the head the breath looks for ground before it gives up, in blocks. */
const FLAME_SEARCH_DEPTH = 384;
/** How far below the body a sitting dragon holds its head, Java's `getHeadYOffset` while sitting. */
const SITTING_HEAD_DROP = -1;

/** How long the dragon's wings and head leave others alone after it is hurt, Java's `hurtDuration`. */
const HURT_TICKS = 10;
/** A wing shoves what it meets 4 blocks a tick away from the body and 0.2 up, Java's `knockBack`. */
const WING_SHOVE = { across: 4, up: f(0.2), minimumSquared: 0.1 } as const;
/** What a wing deals a mob while the dragon flies, Java's `knockBack`. */
const WING_DAMAGE = 5;
/** What the head and the neck deal, Java's `hurt`. */
const HEAD_DAMAGE = 10;
/** The blocks the dragon passes through without breaking, and the ones it never breaks. */
const DRAGON_TRANSPARENT = 'minecraft:dragon_transparent';
const DRAGON_IMMUNE = 'minecraft:dragon_immune';

/** Java's `float` constant `180.0F / (float) Math.PI`. */
const RADIANS_TO_DEGREES = f(180 / f(Math.PI));
/** Java's `1.0E-5F`, below which `Vec3.normalize` answers the zero vector. */
const NORMALIZE_EPSILON = f(1e-5);
/** How many samples Java's `DragonFlightHistory` keeps. */
const HISTORY_LENGTH = 64;

/** An axis-aligned box. */
interface Box {
    readonly min: EntityPosition;
    readonly max: EntityPosition;
}

/** A part's box: `width` across centered on `at`, `height` up from it, grown by `grow` on each side. */
const partBox = (
    at: EntityPosition,
    width: number,
    height: number,
    grow: { readonly across: number; readonly up: number } = { across: 0, up: 0 }
): Box => ({
    min: { x: at.x - width / 2 - grow.across, y: at.y - grow.up, z: at.z - width / 2 - grow.across },
    max: { x: at.x + width / 2 + grow.across, y: at.y + height + grow.up, z: at.z + width / 2 + grow.across }
});

const inside = (box: Box, at: EntityPosition): boolean =>
    at.x >= box.min.x &&
    at.x <= box.max.x &&
    at.y >= box.min.y &&
    at.y <= box.max.y &&
    at.z >= box.min.z &&
    at.z <= box.max.z;

const ZERO: EntityPosition = { x: 0, y: 0, z: 0 };

/**
 * Java's `Vec3.normalize`.
 *
 * @javaSource Vec3.normalize
 * @javaVerified vectors
 */
const normalize = (vector: EntityPosition): EntityPosition => {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
    return length < NORMALIZE_EPSILON ? ZERO : { x: vector.x / length, y: vector.y / length, z: vector.z / length };
};

const dot = (a: EntityPosition, b: EntityPosition): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Java's `Vec3i.distToCenterSqr`: from the middle of a block to a point.
 *
 * @javaSource Vec3i.distToCenterSqr(Lnet/minecraft/core/Position;)D
 * @javaVerified vectors
 */
const distanceToCenterSquared = (block: PathNode, at: EntityPosition): number =>
    (block.x + 0.5 - at.x) ** 2 + (block.y + 0.5 - at.y) ** 2 + (block.z + 0.5 - at.z) ** 2;

const clamp = (value: number, min: number, max: number): number => (value < min ? min : Math.min(value, max));

/** The angle between the dragon's heading and a direction in the horizontal plane, Java's strafe and scan aim. */
const aimAngle = (yRot: number, aimX: number, aimZ: number): number => {
    const aim = normalize({ x: aimX, y: 0, z: aimZ });
    const heading = normalize({
        x: javaSin(f(yRot * DEGREES_TO_RADIANS)),
        y: 0,
        z: -javaCos(f(yRot * DEGREES_TO_RADIANS))
    });
    return f(f(Math.acos(f(dot(heading, aim))) * RADIANS_TO_DEGREES) + 0.5);
};

/** Where the dragon's body parts are, Java's `EnderDragonPart`s, as `aiStep` last placed them. */
interface DragonParts {
    head: EntityPosition;
    neck: EntityPosition;
    body: EntityPosition;
    wings: readonly [EntityPosition, EntityPosition];
}

/** The dragon's view of the world, which every phase reads. */
class DragonPhases {
    private phaseName: DragonPhaseName = 'holding_pattern';
    private flameCount = 0;
    private chargeTarget: EntityPosition | undefined;

    /** Java's dragon `yRot`, which faces the dragon's tail; see the module comment. */
    private yRot = 0;
    private yRotA = 0;
    /**
     * Java's dragon `yHeadRot`, which the takeoff aims by. Java's server sets it once, from the
     * yaw a new dragon is built with, and never turns it, so a dragon takes off by the heading
     * it was created facing.
     */
    private readonly yHeadRot: number;
    private velocity: EntityPosition = ZERO;
    private nodes: PathNode[] | undefined;
    private lastTick: number | undefined;
    private ticks = 0;
    /** Java's `DragonFlightHistory`: the height at the start of each of the last 64 ticks. */
    private readonly history = new Float64Array(HISTORY_LENGTH);
    private historyHead = -1;
    /** Java builds the parts at the origin, and the first tick moves them to the dragon. */
    private parts: DragonParts = { head: ZERO, neck: ZERO, body: ZERO, wings: [ZERO, ZERO] };

    // The fields of the phase instances, which Java keeps across a phase's runs.
    private path: NodePath | undefined;
    private targetLocation: EntityPosition | undefined;
    /** The holding pattern's `clockwise`. */
    private clockwise = false;
    /** The strafe's own `holdingPatternClockwise`, which turns apart from the holding pattern's. */
    private strafeClockwise = false;
    private fireballCharge = 0;
    private strafeTarget: GoalMob | undefined;
    private timeSinceCharge = 0;
    private scanningTime = 0;
    private attackingTicks = 0;
    private flameTicks = 0;
    private flame: GoalMob | undefined;
    private firstTakeoffTick = true;
    private sittingDamage = 0;
    private lastHealth: number | undefined;
    private hurtTime = 0;

    public constructor(private readonly support: GoalSupport) {
        const saved = support.entity.componentState.get(dragonPhaseState);
        if (saved !== undefined) {
            this.phaseName = saved.phase;
            this.flameCount = saved.flameCount;
            const [x, y, z] = saved.chargeTarget ?? [];
            this.chargeTarget = x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined;
        }
        // Java's dragon starts with a `yRot` of 0; the fight draws one when it spawns the dragon.
        this.yHeadRot = this.yRot;
        this.begin();
    }

    /** The phase the dragon is in. */
    public get phase(): DragonPhaseName {
        this.resync();
        return this.phaseName;
    }

    /** Where the current phase flies the dragon, Java's `getFlyTargetLocation`, or undefined for nowhere. */
    public get flyTargetLocation(): EntityPosition | undefined {
        return this.flyTarget();
    }

    /** Java's dragon `yRot`, the yaw of its tail; {@link GoalWorld.moveSelf} reports it turned half a circle. */
    public get javaYRot(): number {
        return this.yRot;
    }

    /**
     * One tick of the dragon, at most once per game tick whichever of its goals asks: the
     * current phase's server tick, then a second one when the first changed the phase, as Java's
     * `aiStep` runs, then the flight toward the phase's target and the parts against the world.
     */
    public tick(): void {
        const now = this.support.world.gameTime?.() ?? this.ticks + 1;
        if (now === this.lastTick) return;
        this.lastTick = now;
        this.ticks += 1;
        this.resync();
        this.takeSittingDamage();

        this.yRot = wrapDegreesFloat(this.yRot);
        this.record(this.support.position().y);
        const before = this.phaseName;
        this.serverTick();
        if (this.phaseName !== before) this.serverTick();
        this.fly();
        this.moveParts();
    }

    /**
     * Java's `DragonFlightHistory.record` for the height.
     *
     * @javaSource DragonFlightHistory.record
     * @javaVerified vectors
     */
    private record(y: number): void {
        if (this.historyHead < 0) this.history.fill(y);
        this.historyHead = (this.historyHead + 1) % HISTORY_LENGTH;
        this.history[this.historyHead] = y;
    }

    /**
     * Java's `DragonFlightHistory.get(delay).y()`.
     *
     * @javaSource DragonFlightHistory.get(I)Lnet/minecraft/world/entity/boss/enderdragon/DragonFlightHistory$Sample;
     * @javaVerified vectors
     */
    private heightAgo(delay: number): number {
        return this.history[(this.historyHead - delay) & (HISTORY_LENGTH - 1)] ?? 0;
    }

    /**
     * Java's `EnderDragon.hurt` while a sitting phase runs: the damage adds up, and once it passes
     * a quarter of the dragon's health the dragon takes off. Read as the health it lost since the
     * last tick, since a goal sees the dragon's health and not each blow.
     *
     * @javaSource EnderDragon.hurt(Lnet/minecraft/server/level/ServerLevel;Lnet/minecraft/world/entity/boss/enderdragon/EnderDragonPart;Lnet/minecraft/world/damagesource/DamageSource;F)Z
     */
    private takeSittingDamage(): void {
        const health = this.support.entity.attributes.get('health');
        const was = this.lastHealth;
        this.lastHealth = health?.current;
        // Java's `hurtTime`, which a blow sets to 10 and every tick counts down.
        if (health !== undefined && was !== undefined && health.current < was) this.hurtTime = HURT_TICKS;
        else if (this.hurtTime > 0) this.hurtTime -= 1;
        if (health === undefined || was === undefined || !isSittingDragonPhase(this.phaseName)) return;
        if (health.current < was) this.sittingDamage += was - health.current;
        if (this.sittingDamage > SITTING_DAMAGE_SHARE * health.max) {
            this.sittingDamage = 0;
            this.setPhase('takeoff');
        }
    }

    /**
     * Java's `EnderDragonPhaseManager.setPhase`: ends the current phase and begins the next.
     *
     * @javaSource EnderDragonPhaseManager.setPhase
     * @javaVerified vectors
     */
    public setPhase(next: DragonPhaseName): void {
        if (next === this.phaseName) return;
        this.end();
        const wasSitting = SITTING_GROUP_PHASES.includes(this.phaseName);
        this.phaseName = next;
        this.begin();
        this.save();
        const sitting = SITTING_GROUP_PHASES.includes(next);
        if (sitting && !wasSitting) this.support.entity.trigger('minecraft:on_start_landing');
        if (!sitting && wasSitting) this.support.entity.trigger('minecraft:on_start_takeoff');
    }

    /** Picks up a phase written from outside, such as a reload or a command, since the last tick. */
    private resync(): void {
        const saved = this.support.entity.componentState.get(dragonPhaseState);
        if (saved === undefined || saved.phase === this.phaseName) return;
        this.end();
        this.phaseName = saved.phase;
        this.flameCount = saved.flameCount;
        const [x, y, z] = saved.chargeTarget ?? [];
        this.chargeTarget = x !== undefined && y !== undefined && z !== undefined ? { x, y, z } : undefined;
        this.begin();
    }

    private save(): void {
        const target = this.chargeTarget;
        this.support.entity.componentState.set(dragonPhaseState, {
            phase: this.phaseName,
            flameCount: this.flameCount,
            chargeTarget: target === undefined ? null : [target.x, target.y, target.z]
        });
    }

    // The phases' `begin` and `end`.

    private begin(): void {
        switch (this.phaseName) {
            case 'holding_pattern':
            case 'landing_approach':
                this.path = undefined;
                this.targetLocation = undefined;
                return;
            case 'strafe_player': {
                this.fireballCharge = 0;
                this.targetLocation = undefined;
                this.path = undefined;
                this.strafeTarget = undefined;
                // Java's `setTarget`, which the holding pattern calls once the phase has begun.
                const target = this.support.target();
                if (target !== undefined) this.strafeAt(target);
                return;
            }
            case 'charging_player':
                this.targetLocation = this.chargeTarget;
                this.timeSinceCharge = 0;
                return;
            case 'landing':
                this.targetLocation = undefined;
                return;
            case 'takeoff':
                this.firstTakeoffTick = true;
                this.path = undefined;
                this.targetLocation = undefined;
                return;
            case 'sitting_scanning':
                this.scanningTime = 0;
                return;
            case 'sitting_attacking':
                this.attackingTicks = 0;
                return;
            case 'sitting_flaming':
                this.flameTicks = 0;
                this.flameCount += 1;
                return;
            default:
                return;
        }
    }

    private end(): void {
        if (this.phaseName === 'sitting_flaming' && this.flame !== undefined) {
            this.support.world.discard?.(this.flame);
            this.flame = undefined;
        }
    }

    // The phases' `doServerTick`.

    private serverTick(): void {
        switch (this.phaseName) {
            case 'holding_pattern':
                if (this.offCourse()) this.holdingPatternTarget();
                return;
            case 'strafe_player':
                this.strafeTick();
                return;
            case 'charging_player':
                this.chargeTick();
                return;
            case 'landing_approach':
                if (this.offCourse()) this.landingApproachTarget();
                return;
            case 'landing': {
                const portal = this.portal();
                this.targetLocation ??= { x: portal.x + 0.5, y: portal.y, z: portal.z + 0.5 };
                const here = this.support.position();
                const target = this.targetLocation;
                if ((target.x - here.x) ** 2 + (target.y - here.y) ** 2 + (target.z - here.z) ** 2 < 1) {
                    this.flameCount = 0;
                    this.setPhase('sitting_scanning');
                }
                return;
            }
            case 'takeoff':
                if (!this.firstTakeoffTick && this.path !== undefined) {
                    if (distanceToCenterSquared(this.portal(), this.support.position()) >= 100)
                        this.setPhase('holding_pattern');
                } else {
                    this.firstTakeoffTick = false;
                    this.takeoffTarget();
                }
                return;
            case 'sitting_scanning':
                this.scanTick();
                return;
            case 'sitting_attacking':
                this.attackingTicks += 1;
                if (this.attackingTicks > ROAR_TICKS) this.setPhase('sitting_flaming');
                return;
            case 'sitting_flaming':
                this.flameTick();
                return;
            default:
                return;
        }
    }

    /** Whether the phase's target is reached or out of reach: closer than 10 or further than 150. */
    private offCourse(): boolean {
        const target = this.targetLocation;
        const here = this.support.position();
        const away =
            target === undefined ? 0 : (target.x - here.x) ** 2 + (target.y - here.y) ** 2 + (target.z - here.z) ** 2;
        return away < 100 || away > 22500;
    }

    /**
     * Java's `DragonHoldingPatternPhase.findNewTarget`.
     *
     * @javaSource DragonHoldingPatternPhase.findNewTarget
     * @javaVerified vectors
     */
    private holdingPatternTarget(): void {
        if (this.path !== undefined && isDone(this.path)) {
            const portal = this.portal();
            const crystals = this.support.world.endCrystalsAlive?.() ?? 0;
            if (this.support.randomInt(crystals + 3) === 0) {
                this.setPhase('landing_approach');
                return;
            }
            const player = this.nearestPlayerTo(portal);
            const away = player === undefined ? 64 : distanceToCenterSquared(portal, player.position()) / 512;
            if (
                player !== undefined &&
                (this.support.randomInt(Math.trunc(away + 2)) === 0 || this.support.randomInt(crystals + 2) === 0)
            ) {
                this.support.setTarget(player);
                this.setPhase('strafe_player');
                return;
            }
        }
        // Java's holding pattern keeps to the outer ring whenever there is a fight, even with no
        // crystal left, while `findClosestNode` and `findPath` then keep to the inner rings.
        const crystals = this.support.world.endCrystalsAlive?.();
        this.circleOn(crystals !== undefined && crystals >= 0, 'holding');
    }

    /**
     * The holding pattern's and the strafe's next lap: a path from the nearest node to the next one
     * round the ring, which turns the other way one time in eight. Each phase keeps its own sense of
     * turn, and `outer` says whether the lap ends on the outer ring or on the middle one.
     */
    private circleOn(outer: boolean, turn: 'holding' | 'strafe'): void {
        if (this.path === undefined || isDone(this.path)) {
            const from = this.closestNode();
            let to = from;
            if (this.support.randomInt(8) === 0) {
                if (turn === 'holding') this.clockwise = !this.clockwise;
                else this.strafeClockwise = !this.strafeClockwise;
                to += 6;
            }
            to += (turn === 'holding' ? this.clockwise : this.strafeClockwise) ? 1 : -1;
            to = outer ? ((to % 12) + 12) % 12 : ((to - 12) & 7) + 12;
            this.path = this.findPath(from, to, undefined);
            if (this.path !== undefined) this.path.next += 1;
        }
        this.toNextNode();
    }

    /**
     * Java's `navigateToNextPathNode` for the phases that climb up to 20 blocks above each node,
     * in Java's `float` sum of the node's height and the draw.
     */
    private toNextNode(): void {
        const path = this.path;
        if (path === undefined || isDone(path)) return;
        const node = path.nodes[path.next];
        path.next += 1;
        if (node === undefined) return;
        this.targetLocation = { x: node.x, y: f(node.y + f(this.support.random() * 20)), z: node.z };
    }

    /** Java's `0.4F + distance / 80.0 - 1.0`, capped at 10: how far above its target a strafe aims. */
    private strafeLift(dx: number, dz: number): number {
        return Math.min(f(0.4) + Math.sqrt(dx * dx + dz * dz) / 80 - 1, 10);
    }

    /**
     * Java's `DragonStrafePlayerPhase.setTarget`: a path toward the target, ending above it.
     *
     * @javaSource DragonStrafePlayerPhase.setTarget
     * @javaVerified vectors
     */
    private strafeAt(target: GoalMob): void {
        this.strafeTarget = target;
        const here = this.support.position();
        const there = target.position();
        const from = this.closestNode();
        const to = this.closestNodeTo(there);
        const x = Math.floor(there.x);
        const z = Math.floor(there.z);
        const up = this.strafeLift(x - here.x, z - here.z);
        this.path = this.findPath(from, to, { x, y: Math.floor(there.y + up), z });
        if (this.path !== undefined) {
            this.path.next += 1;
            this.toNextNode();
        }
    }

    /**
     * Java's `DragonStrafePlayerPhase.doServerTick`. Java strafes a target until it is gone; this
     * also gives up on a dead one, since a Bedrock player keeps its entity through a respawn.
     *
     * @javaSource DragonStrafePlayerPhase.doServerTick
     * @javaVerified vectors
     */
    private strafeTick(): void {
        const target = this.strafeTarget;
        if (target === undefined || (target.health?.() ?? 1) <= 0) {
            this.setPhase('holding_pattern');
            return;
        }
        const here = this.support.position();
        const there = target.position();
        if (this.path !== undefined && isDone(this.path)) {
            const up = this.strafeLift(there.x - here.x, there.z - here.z);
            this.targetLocation = { x: there.x, y: there.y + up, z: there.z };
        }
        if (this.offCourse()) {
            const crystals = this.support.world.endCrystalsAlive?.();
            this.circleOn(crystals !== undefined && crystals > 0, 'strafe');
        }

        const awaySquared = (here.x - there.x) ** 2 + (here.y - there.y) ** 2 + (here.z - there.z) ** 2;
        if (awaySquared >= 4096 || this.support.world.hasLineOfSight?.(target) === false) {
            if (this.fireballCharge > 0) this.fireballCharge -= 1;
            return;
        }
        this.fireballCharge += 1;
        const angle = aimAngle(this.yRot, there.x - here.x, there.z - here.z);
        if (this.fireballCharge >= FIREBALL_CHARGE && angle >= 0 && angle < 10) {
            this.support.world.shoot?.(target, 'minecraft:dragon_fireball');
            this.fireballCharge = 0;
            if (this.path !== undefined) this.path.next = this.path.nodes.length;
            this.setPhase('holding_pattern');
        }
    }

    /**
     * Java's `DragonChargePlayerPhase.doServerTick`, whose recovery count runs on both the
     * post-increment that checks it and the miss that follows in the same tick.
     *
     * @javaSource DragonChargePlayerPhase.doServerTick
     * @javaVerified vectors
     */
    private chargeTick(): void {
        if (this.targetLocation === undefined) {
            this.setPhase('holding_pattern');
            return;
        }
        if (this.timeSinceCharge > 0) {
            const recovered = this.timeSinceCharge;
            this.timeSinceCharge += 1;
            if (recovered >= CHARGE_RECOVERY_TICKS) {
                this.chargeTarget = undefined;
                this.setPhase('holding_pattern');
                return;
            }
        }
        if (this.offCourse()) this.timeSinceCharge += 1;
    }

    /**
     * Java's `DragonLandingApproachPhase.findNewTarget`, and the hand-over to the landing. Java
     * aims by the player's direction from the world's origin rather than from the fight's.
     *
     * @javaSource DragonLandingApproachPhase.findNewTarget
     * @javaVerified vectors
     */
    private landingApproachTarget(): void {
        if (this.path === undefined || isDone(this.path)) {
            const from = this.closestNode();
            const portal = this.portal();
            const player = this.nearestPlayerTo(portal);
            let to: number;
            if (player === undefined) to = this.closestNodeTo({ x: 40, y: portal.y, z: 0 });
            else {
                const at = player.position();
                const aim = normalize({ x: at.x, y: 0, z: at.z });
                to = this.closestNodeTo({ x: -aim.x * 40, y: 105, z: -aim.z * 40 });
            }
            this.path = this.findPath(from, to, portal);
            if (this.path !== undefined) this.path.next += 1;
        }
        this.toNextNode();
        if (this.path !== undefined && isDone(this.path)) this.setPhase('landing');
    }

    /**
     * Java's `DragonTakeoffPhase.findNewTarget`: a path off the portal toward the node opposite the
     * dragon's head, which Java's `getHeadLookVector` tilts up the closer the dragon is to the
     * portal. It ends on the outer ring while crystals stand and on the middle ring once none do.
     *
     * @javaSource DragonTakeoffPhase.findNewTarget
     * @javaVerified vectors
     */
    private takeoffTarget(): void {
        const from = this.closestNode();
        const portal = this.portal();
        const lift = Math.max(f(f(Math.sqrt(distanceToCenterSquared(portal, this.support.position()))) / 4), 1);
        const look = this.viewVector(f(f(-f(6 / lift) * 1.5) * 5), this.yHeadRot);
        let to = this.closestNodeTo({ x: -look.x * 40, y: 105, z: -look.z * 40 });
        const crystals = this.support.world.endCrystalsAlive?.();
        to = crystals !== undefined && crystals > 0 ? ((to % 12) + 12) % 12 : ((to - 12) & 7) + 12;
        this.path = this.findPath(from, to, undefined);
        const path = this.path;
        if (path === undefined) return;
        path.next += 1;
        if (!isDone(path)) this.toNextNode();
    }

    /**
     * Java's `Entity.calculateViewVector`.
     *
     * @javaSource Entity.calculateViewVector
     * @javaVerified vectors
     */
    private viewVector(xRot: number, yRot: number): EntityPosition {
        const pitch = f(xRot * DEGREES_TO_RADIANS);
        const yaw = f(-yRot * DEGREES_TO_RADIANS);
        const xCos = javaCos(pitch);
        return { x: f(javaSin(yaw) * xCos), y: -javaSin(pitch), z: f(javaCos(yaw) * xCos) };
    }

    /**
     * Java's `DragonSittingScanningPhase.doServerTick`.
     *
     * @javaSource DragonSittingScanningPhase.doServerTick
     * @javaVerified vectors
     */
    private scanTick(): void {
        this.scanningTime += 1;
        const here = this.support.position();
        const target = this.support
            .players(20)
            .find((player) => Math.abs(player.position().y - here.y) <= 10 && this.support.isAttackable(player));
        if (target !== undefined) {
            if (this.scanningTime > SCAN_ATTACK_DELAY) {
                this.setPhase('sitting_attacking');
                return;
            }
            const there = target.position();
            const angle = aimAngle(this.yRot, there.x - here.x, there.z - here.z);
            if (angle < 0 || angle > 10) {
                const head = this.parts.head;
                const dx = there.x - head.x;
                const dz = there.z - head.z;
                const turn = clamp(wrapDegrees(180 - javaAtan2(dx, dz) * RADIANS_TO_DEGREES - this.yRot), -100, 100);
                this.yRotA = f(this.yRotA * f(0.8));
                const reach = f(f(Math.sqrt(dx * dx + dz * dz)) + 1);
                this.yRotA = f(this.yRotA + f(f(turn) * f(f(f(0.7) / Math.min(reach, 40)) / reach)));
                this.yRot = f(this.yRot + this.yRotA);
            }
        } else if (this.scanningTime >= SCANNING_TICKS) {
            const charge = this.support.players(150).find((player) => this.support.isAttackable(player));
            this.setPhase('takeoff');
            if (charge !== undefined) {
                const at = charge.position();
                this.chargeTarget = { x: at.x, y: at.y, z: at.z };
                this.setPhase('charging_player');
            }
        }
    }

    /**
     * Java's `DragonSittingFlamingPhase.doServerTick`: the breath ten ticks in, the end at 200.
     *
     * @javaSource DragonSittingFlamingPhase.doServerTick
     * @javaVerified vectors
     */
    private flameTick(): void {
        this.flameTicks += 1;
        if (this.flameTicks >= FLAME_TICKS) {
            this.setPhase(this.flameCount >= FLAME_ATTACKS ? 'takeoff' : 'sitting_scanning');
            return;
        }
        if (this.flameTicks !== FLAME_WARMUP) return;
        const here = this.support.position();
        const head = this.parts.head;
        const out = normalize({ x: head.x - here.x, y: 0, z: head.z - here.z });
        const x = head.x + (out.x * 5) / 2;
        const z = head.z + (out.z * 5) / 2;
        // Java walks down from the head through empty blocks, and gives up at the bottom of the world.
        const top = head.y + 0.5;
        const view = this.support.navigation();
        let y = top;
        if (view !== undefined) {
            const empty = (at: EntityPosition): boolean => (view.blockAt(at) ?? 'minecraft:air') === 'minecraft:air';
            for (let steps = 0; empty({ x, y, z }); steps += 1) {
                y -= 1;
                if (steps >= FLAME_SEARCH_DEPTH) {
                    y = top;
                    break;
                }
            }
        }
        this.flame = this.support.world.spawn?.(
            'minecraft:area_effect_cloud',
            { x, y: Math.floor(y) + 1, z },
            undefined,
            {
                owned: true,
                data: {
                    radius: 5,
                    duration: 200,
                    potion_duration_scale: 0.25,
                    particle: 'dragon_breath',
                    effects: [{ id: 'minecraft:instant_damage', amplifier: 0 }]
                }
            }
        );
    }

    // The flight.

    /** The point the current phase flies toward, Java's `getFlyTargetLocation`. */
    private flyTarget(): EntityPosition | undefined {
        switch (this.phaseName) {
            case 'holding_pattern':
            case 'strafe_player':
            case 'charging_player':
            case 'landing_approach':
            case 'landing':
            case 'takeoff':
                return this.targetLocation;
            default:
                return undefined;
        }
    }

    /** Java's `getFlySpeed`, a `float`, which bounds how steeply the dragon climbs or dives. */
    private flySpeed(): number {
        return this.phaseName === 'charging_player' ? 3 : this.phaseName === 'landing' ? 1.5 : f(0.6);
    }

    /** Java's `getTurnSpeed`, in `float`. */
    private turnSpeed(): number {
        const moving = f(f(Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2)) + 1);
        const capped = Math.min(moving, 40);
        return this.phaseName === 'landing' ? f(capped / moving) : f(f(f(0.7) / capped) / moving);
    }

    /**
     * Java's `EnderDragon.aiStep` flight: climb, turn, thrust along the heading, move and drag.
     *
     * @javaSource EnderDragon.aiStep
     * @javaVerified vectors
     */
    private fly(): void {
        const target = this.flyTarget();
        const here = this.support.position();
        if (target === undefined) {
            this.place(here);
            return;
        }
        const dx = target.x - here.x;
        let dy = target.y - here.y;
        const dz = target.z - here.z;
        const awaySquared = dx * dx + dy * dy + dz * dz;
        const rise = this.flySpeed();
        const across = Math.sqrt(dx * dx + dz * dz);
        if (across > 0) dy = clamp(dy / across, -rise, rise);
        this.velocity = { ...this.velocity, y: this.velocity.y + dy * 0.01 };
        this.yRot = wrapDegreesFloat(this.yRot);

        const aim = normalize({ x: target.x - here.x, y: target.y - here.y, z: target.z - here.z });
        const radians = f(this.yRot * DEGREES_TO_RADIANS);
        const facing = normalize({ x: javaSin(radians), y: this.velocity.y, z: -javaCos(radians) });
        const alignment = Math.max(f(f(f(dot(facing, aim)) + 0.5) / 1.5), 0);
        if (Math.abs(dx) > NORMALIZE_EPSILON || Math.abs(dz) > NORMALIZE_EPSILON) {
            const toward = f(f(180 - f(f(javaAtan2(dx, dz)) * RADIANS_TO_DEGREES)) - this.yRot);
            const turn = clamp(wrapDegreesFloat(toward), -50, 50);
            this.yRotA = f(this.yRotA * f(0.8));
            this.yRotA = f(this.yRotA + f(turn * this.turnSpeed()));
            this.yRot = f(this.yRot + f(this.yRotA * f(0.1)));
        }
        const closeness = f(2 / (awaySquared + 1));
        // Java's `moveRelative` along (0, 0, -1), turned by the new yaw.
        const thrust = f(f(0.06) * f(f(alignment * closeness) + f(1 - closeness)));
        const turned = f(this.yRot * DEGREES_TO_RADIANS);
        this.velocity = {
            x: this.velocity.x + thrust * javaSin(turned),
            y: this.velocity.y,
            z: this.velocity.z - thrust * javaCos(turned)
        };
        const moved = { x: here.x + this.velocity.x, y: here.y + this.velocity.y, z: here.z + this.velocity.z };
        const slide = 0.8 + (0.15 * (dot(normalize(this.velocity), facing) + 1)) / 2;
        this.velocity = { x: this.velocity.x * slide, y: this.velocity.y * f(0.91), z: this.velocity.z * slide };
        this.place(moved);
    }

    // The dragon's parts against the world.

    /**
     * Java's `EnderDragon.aiStep` once the dragon has moved: the body and the wings move to it,
     * the wings and the head and the neck where they were strike what they touch, then the head
     * and the neck move, tilted by how the dragon climbed over the last ten ticks, and the head,
     * the neck and the body break through blocks.
     *
     * @javaSource EnderDragon.aiStep
     * @javaVerified vectors
     */
    private moveParts(): void {
        const here = this.support.position();
        const tilt = f(f(f(this.heightAgo(5) - this.heightAgo(10)) * 10) * DEGREES_TO_RADIANS);
        const tiltCos = javaCos(tilt);
        const tiltSin = javaSin(tilt);
        const yaw = f(this.yRot * DEGREES_TO_RADIANS);
        const sin = javaSin(yaw);
        const cos = javaCos(yaw);
        const at = (x: number, y: number, z: number): EntityPosition => ({
            x: here.x + x,
            y: here.y + y,
            z: here.z + z
        });
        this.parts.body = at(f(sin * 0.5), 0, f(-cos * 0.5));
        this.parts.wings = [at(f(cos * 4.5), 2, f(sin * 4.5)), at(f(cos * -4.5), 2, f(sin * -4.5))];
        this.touch();

        const headYaw = f(yaw - f(this.yRotA * f(0.01)));
        const headSin = javaSin(headYaw);
        const headCos = javaCos(headYaw);
        const drop = isSittingDragonPhase(this.phaseName)
            ? SITTING_HEAD_DROP
            : f(this.heightAgo(5) - this.heightAgo(0));
        const reach = (length: number): EntityPosition =>
            at(f(f(headSin * length) * tiltCos), f(drop + f(tiltSin * length)), f(f(-headCos * length) * tiltCos));
        this.parts.head = reach(6.5);
        this.parts.neck = reach(5.5);
        this.checkWalls();
    }

    /**
     * Java's `EnderDragon.knockBack` and `hurt` unless the dragon was hurt in the last 10 ticks:
     * each wing shoves every living thing near it away from the body, and while the dragon flies
     * hurts it for 5, and the head and the neck hurt every living thing they touch for 10. A
     * player in creative or spectator is left alone.
     *
     * @javaSource EnderDragon.aiStep
     */
    private touch(): void {
        if (this.hurtTime > 0) return;
        const living = this.support
            .mobs(16)
            .filter((mob) =>
                mob.identifier?.() === 'minecraft:player'
                    ? this.support.isAttackable(mob)
                    : mob.health?.() !== undefined
            );
        const sitting = isSittingDragonPhase(this.phaseName);
        const body = this.parts.body;
        for (const wing of this.parts.wings) {
            const reach = partBox(wing, 4, 2, { across: 4, up: 2 });
            const shoved = { min: { ...reach.min, y: reach.min.y - 2 }, max: { ...reach.max, y: reach.max.y - 2 } };
            for (const mob of living) {
                const at = mob.position();
                if (!inside(shoved, at)) continue;
                const dx = at.x - body.x;
                const dz = at.z - body.z;
                const away = Math.max(dx * dx + dz * dz, WING_SHOVE.minimumSquared);
                this.support.world.pushMob?.(mob, {
                    x: (dx / away) * WING_SHOVE.across,
                    y: WING_SHOVE.up,
                    z: (dz / away) * WING_SHOVE.across
                });
                if (!sitting) this.support.world.attack?.(mob, WING_DAMAGE);
            }
        }
        const bitten = [
            partBox(this.parts.head, 1, 1, { across: 1, up: 1 }),
            partBox(this.parts.neck, 3, 3, { across: 1, up: 1 })
        ];
        for (const mob of living)
            if (bitten.some((box) => inside(box, mob.position()))) this.support.world.attack?.(mob, HEAD_DAMAGE);
    }

    /**
     * Java's `EnderDragon.checkWalls` over its head, neck and body: with `mobGriefing` on, every
     * block in them but air, the `minecraft:dragon_transparent` blocks and the
     * `minecraft:dragon_immune` ones is removed, dropping nothing.
     *
     * @javaSource EnderDragon.checkWalls
     */
    private checkWalls(): void {
        if (this.support.world.gameRule?.('mobGriefing') === false) return;
        const world = this.support.world;
        if (world.blockAt === undefined || world.setBlock === undefined || world.blockHasTag === undefined) return;
        const parts = [partBox(this.parts.head, 1, 1), partBox(this.parts.neck, 3, 3), partBox(this.parts.body, 5, 3)];
        for (const { min, max } of parts)
            for (let x = Math.floor(min.x); x <= Math.floor(max.x); x += 1)
                for (let y = Math.floor(min.y); y <= Math.floor(max.y); y += 1)
                    for (let z = Math.floor(min.z); z <= Math.floor(max.z); z += 1) {
                        const at = { x, y, z };
                        const block = world.blockAt(at)?.identifier;
                        if (block === undefined || block === 'minecraft:air') continue;
                        if (world.blockHasTag(at, DRAGON_TRANSPARENT) || world.blockHasTag(at, DRAGON_IMMUNE)) continue;
                        world.setBlock(at, 'minecraft:air');
                    }
    }

    /** Puts the dragon where the flight took it, facing the way it flies. */
    private place(at: EntityPosition): void {
        this.support.world.moveSelf?.(at, wrapDegrees(this.yRot + 180), 0);
    }

    // The fight's geometry.

    /**
     * The fight's origin, Java's `EnderDragon.getFightOrigin`.
     *
     * @javaSource EnderDragon.getFightOrigin
     */
    private fightOrigin(): EntityPosition {
        return this.support.world.fightOrigin?.() ?? ZERO;
    }

    /**
     * The block above the top of the exit portal, Java's `getHeightmapPos(MOTION_BLOCKING_NO_LEAVES,
     * EnderDragonFight.getPodiumLocation(fightOrigin))`.
     */
    private portal(): PathNode {
        const origin = this.fightOrigin();
        const x = Math.floor(origin.x);
        const z = Math.floor(origin.z);
        return { x, y: this.support.world.surfaceY?.(x, z) ?? Math.floor(origin.y), z };
    }

    /** The attackable player nearest a position, Java's `getNearestPlayer` over the arena. */
    private nearestPlayerTo(at: PathNode): GoalMob | undefined {
        let best: GoalMob | undefined;
        let bestAway = Number.POSITIVE_INFINITY;
        for (const player of this.support.players(512)) {
            if (!this.support.isAttackable(player)) continue;
            const there = player.position();
            const away = (there.x - at.x) ** 2 + (there.y - at.y) ** 2 + (there.z - at.z) ** 2;
            if (away < bestAway) {
                best = player;
                bestAway = away;
            }
        }
        return best;
    }

    /** Java's 24 path nodes over this world's ground, built on first use. */
    private pathNodes(): PathNode[] {
        this.nodes ??= dragonPathNodes((x, z) => this.support.world.surfaceY?.(x, z));
        return this.nodes;
    }

    /** The first node a search may use, which the fight's crystals decide. */
    private firstNode(): number {
        return firstDragonNode(this.support.world.endCrystalsAlive?.());
    }

    /** Java's `findClosestNode()`, from where the dragon is. */
    private closestNode(): number {
        return this.closestNodeTo(this.support.position());
    }

    /** Java's `findClosestNode(x, y, z)`. */
    private closestNodeTo(at: EntityPosition): number {
        return closestDragonNode(this.pathNodes(), at, this.firstNode());
    }

    /** The path search over this dragon's nodes, {@link findDragonPath}. */
    private findPath(from: number, to: number, last: PathNode | undefined): NodePath | undefined {
        return findDragonPath(this.pathNodes(), from, to, last, this.firstNode());
    }
}

const managers = new WeakMap<GoalSupport['entity'], DragonPhases>();

/** The one phase manager of the dragon a goal runs on, which all its phase goals share. */
export const dragonPhasesOf = (support: GoalSupport): DragonPhases => {
    const known = managers.get(support.entity);
    if (known !== undefined) return known;
    const created = new DragonPhases(support);
    managers.set(support.entity, created);
    return created;
};
