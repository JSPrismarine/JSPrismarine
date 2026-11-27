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
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { GoalSupport } from '../support';
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

/**
 * Java's `EnderDragon.nodeAdjacency`: which of the 24 path nodes each node connects to, as bits.
 *
 * @javaSource EnderDragon.findClosestNode()I
 */
const NODE_ADJACENCY = [
    6146, 8197, 8202, 16404, 32808, 32848, 65696, 131392, 131712, 263424, 526848, 525313, 1581057, 3166214, 2138120,
    6373424, 4358208, 12910976, 9044480, 9706496, 15216640, 13688832, 11763712, 8257536
] as const;

/** How many path nodes ring the fountain: 12 out at 60, 8 at 40 and 4 at 20. */
const NODE_COUNT = 24;
/** The first inner node; a fight with no crystals left keeps to the inner two rings. */
const INNER_NODES = 12;

/**
 * Java's `DragonStrafePlayerPhase.FIREBALL_CHARGE_AMOUNT`.
 *
 * @javaSource DragonStrafePlayerPhase.FIREBALL_CHARGE_AMOUNT
 */
const FIREBALL_CHARGE = 5;
/**
 * Java's `DragonChargePlayerPhase.CHARGE_RECOVERY_TIME`.
 *
 * @javaSource DragonChargePlayerPhase.CHARGE_RECOVERY_TIME
 */
const CHARGE_RECOVERY_TICKS = 10;
/**
 * Java's `DragonSittingScanningPhase.SITTING_SCANNING_IDLE_TICKS`.
 *
 * @javaSource DragonSittingScanningPhase.SITTING_SCANNING_IDLE_TICKS
 */
const SCANNING_TICKS = 100;
/** How long a scan waits before it turns to the attack, in ticks. */
const SCAN_ATTACK_DELAY = 25;
/**
 * Java's `DragonSittingAttackingPhase.ROAR_DURATION`.
 *
 * @javaSource DragonSittingAttackingPhase.ROAR_DURATION
 */
const ROAR_TICKS = 40;
/**
 * Java's `DragonSittingFlamingPhase.FLAME_DURATION`.
 *
 * @javaSource DragonSittingFlamingPhase.FLAME_DURATION
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
 */
const FLAME_WARMUP = 10;
/** How far below the head the breath looks for ground before it gives up, in blocks. */
const FLAME_SEARCH_DEPTH = 384;
/** How far the dragon's head sits ahead of its body, Java's `tickPart(head, ... 6.5F ...)`. */
const HEAD_REACH = 6.5;
/** How far below the body a sitting dragon holds its head, Java's `getHeadYOffset` while sitting. */
const SITTING_HEAD_DROP = 1;

/** How long the dragon's wings and head leave others alone after it is hurt, Java's `hurtDuration`. */
const HURT_TICKS = 10;
/** How far out from the body each wing part sits, Java's `tickPart(wing, cos * 4.5F, 2.0, sin * 4.5F)`. */
const WING_REACH = 4.5;
/** How far ahead the neck part sits, Java's `tickPart(neck, ... 5.5F ...)`. */
const NECK_REACH = 5.5;
/** How far ahead of its feet the body part sits, Java's `tickPart(body, sin * 0.5F, 0.0, -cos * 0.5F)`. */
const BODY_REACH = 0.5;
/** A wing shoves what it meets 4 blocks a tick away from the body and 0.2 up, Java's `knockBack`. */
const WING_SHOVE = { across: 4, up: 0.2, minimumSquared: 0.1 } as const;
/** What a wing deals a mob while the dragon flies, Java's `knockBack`. */
const WING_DAMAGE = 5;
/** What the head and the neck deal, Java's `hurt`. */
const HEAD_DAMAGE = 10;
/** The blocks the dragon passes through without breaking, and the ones it never breaks. */
const DRAGON_TRANSPARENT = 'minecraft:dragon_transparent';
const DRAGON_IMMUNE = 'minecraft:dragon_immune';

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

/** One of Java's dragon path nodes. */
interface PathNode {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** A route through the nodes, Java's `Path` over them: the nodes in order and the next one to fly to. */
interface NodePath {
    readonly nodes: readonly PathNode[];
    next: number;
}

const isDone = (path: NodePath): boolean => path.next >= path.nodes.length;

const distance = (a: PathNode, b: PathNode): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Java's `Mth.wrapDegrees`.
 *
 * @javaSource Mth.wrapDegrees(D)D
 */
const wrapDegrees = (degrees: number): number => {
    const wrapped = degrees % 360;
    return wrapped >= 180 ? wrapped - 360 : wrapped < -180 ? wrapped + 360 : wrapped;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const RADIANS = Math.PI / 180;

/** The dragon's view of the world, which every phase reads. */
class DragonPhases {
    private phaseName: DragonPhaseName = 'holding_pattern';
    private flameCount = 0;
    private chargeTarget: EntityPosition | undefined;

    /** Java's dragon `yRot`, which faces the dragon's tail; see the module comment. */
    private yRot: number;
    private yRotA = 0;
    private velocity: EntityPosition = { x: 0, y: 0, z: 0 };
    private nodes: PathNode[] | undefined;
    private lastTick: number | undefined;
    private ticks = 0;

    // The fields of the phase instances, which Java keeps across a phase's runs.
    private path: NodePath | undefined;
    private targetLocation: EntityPosition | undefined;
    private clockwise = true;
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
        this.yRot = 0;
        this.begin();
    }

    /** The phase the dragon is in. */
    public get phase(): DragonPhaseName {
        this.resync();
        return this.phaseName;
    }

    /**
     * One tick of the dragon, at most once per game tick whichever of its goals asks: the
     * current phase's server tick, then a second one when the first changed the phase, as Java's
     * `aiStep` runs, then the flight toward the phase's target.
     */
    public tick(): void {
        const now = this.support.world.gameTime?.() ?? this.ticks + 1;
        if (now === this.lastTick) return;
        this.lastTick = now;
        this.ticks += 1;
        this.resync();
        this.takeSittingDamage();

        const before = this.phaseName;
        this.serverTick();
        if (this.phaseName !== before) this.serverTick();
        this.fly();
        this.touch();
        this.checkWalls();
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
                if ((here.x - target.x) ** 2 + (here.y - target.y) ** 2 + (here.z - target.z) ** 2 < 1) {
                    this.flameCount = 0;
                    this.setPhase('sitting_scanning');
                }
                return;
            }
            case 'takeoff':
                if (!this.firstTakeoffTick && this.path !== undefined) {
                    const portal = this.portal();
                    const here = this.support.position();
                    const away = Math.hypot(here.x - portal.x - 0.5, here.y - portal.y - 0.5, here.z - portal.z - 0.5);
                    if (away >= 10) this.setPhase('holding_pattern');
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
            const away =
                player === undefined
                    ? 64
                    : ((player.position().x - portal.x - 0.5) ** 2 +
                          (player.position().y - portal.y - 0.5) ** 2 +
                          (player.position().z - portal.z - 0.5) ** 2) /
                      512;
            if (
                player !== undefined &&
                (this.support.randomInt(Math.floor(away + 2)) === 0 || this.support.randomInt(crystals + 2) === 0)
            ) {
                this.support.setTarget(player);
                this.setPhase('strafe_player');
                return;
            }
        }
        this.circleOn();
    }

    /**
     * The holding pattern's and the strafe's next lap: a path from the nearest node to the next one
     * round the ring, which turns the other way one time in eight.
     */
    private circleOn(): void {
        if (this.path === undefined || isDone(this.path)) {
            const from = this.closestNode();
            let to = from;
            if (this.support.randomInt(8) === 0) {
                this.clockwise = !this.clockwise;
                to += 6;
            }
            to += this.clockwise ? 1 : -1;
            const fight = this.support.world.endCrystalsAlive?.();
            to = fight !== undefined && fight >= 0 ? ((to % 12) + 12) % 12 : ((to - 12) & 7) + 12;
            this.path = this.findPath(from, to, undefined);
            if (this.path !== undefined) this.path.next += 1;
        }
        this.toNextNode();
    }

    /** Java's `navigateToNextPathNode` for the phases that climb up to 20 blocks above each node. */
    private toNextNode(): void {
        const path = this.path;
        if (path === undefined || isDone(path)) return;
        const node = path.nodes[path.next];
        path.next += 1;
        if (node === undefined) return;
        this.targetLocation = { x: node.x, y: node.y + this.support.random() * 20, z: node.z };
    }

    /**
     * Java's `DragonStrafePlayerPhase.setTarget`: a path toward the target, ending above it.
     *
     * @javaSource DragonStrafePlayerPhase.setTarget
     */
    private strafeAt(target: GoalMob): void {
        this.strafeTarget = target;
        const here = this.support.position();
        const there = target.position();
        const from = this.closestNode();
        const to = this.closestNodeTo(there);
        const x = Math.floor(there.x);
        const z = Math.floor(there.z);
        const up = Math.min(0.4 + Math.hypot(x - here.x, z - here.z) / 80 - 1, 10);
        this.path = this.findPath(from, to, { x, y: Math.floor(there.y + up), z });
        if (this.path !== undefined) {
            this.path.next += 1;
            this.toNextNode();
        }
    }

    /**
     * Java's `DragonStrafePlayerPhase.doServerTick`.
     *
     * @javaSource DragonStrafePlayerPhase.doServerTick
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
            const up = Math.min(0.4 + Math.hypot(there.x - here.x, there.z - here.z) / 80 - 1, 10);
            this.targetLocation = { x: there.x, y: there.y + up, z: there.z };
        }
        if (this.offCourse()) this.circleOn();

        const awaySquared = (there.x - here.x) ** 2 + (there.y - here.y) ** 2 + (there.z - here.z) ** 2;
        if (awaySquared >= 4096 || this.support.world.hasLineOfSight?.(target) === false) {
            if (this.fireballCharge > 0) this.fireballCharge -= 1;
            return;
        }
        this.fireballCharge += 1;
        const aimX = there.x - here.x;
        const aimZ = there.z - here.z;
        const aimLength = Math.hypot(aimX, aimZ) || 1;
        const [forwardX, forwardZ] = this.forward();
        const dot = clamp((forwardX * aimX + forwardZ * aimZ) / aimLength, -1, 1);
        const angle = (Math.acos(dot) * 180) / Math.PI + 0.5;
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
     * Java's `DragonLandingApproachPhase.findNewTarget`, and the hand-over to the landing.
     *
     * @javaSource DragonLandingApproachPhase.findNewTarget
     */
    private landingApproachTarget(): void {
        if (this.path === undefined || isDone(this.path)) {
            const from = this.closestNode();
            const portal = this.portal();
            const origin = this.fightOrigin();
            const player = this.nearestPlayerTo(portal);
            let to: number;
            if (player === undefined) to = this.closestNodeTo({ x: origin.x + 40, y: portal.y, z: origin.z });
            else {
                const at = player.position();
                const length = Math.hypot(at.x - origin.x, at.z - origin.z) || 1;
                to = this.closestNodeTo({
                    x: origin.x - ((at.x - origin.x) / length) * 40,
                    y: 105,
                    z: origin.z - ((at.z - origin.z) / length) * 40
                });
            }
            this.path = this.findPath(from, to, portal);
            if (this.path !== undefined) this.path.next += 1;
        }
        this.toNextNode();
        if (this.path !== undefined && isDone(this.path)) this.setPhase('landing');
    }

    /**
     * Java's `DragonTakeoffPhase.findNewTarget`: a path off the portal, out ahead of the dragon.
     *
     * @javaSource DragonTakeoffPhase.findNewTarget
     */
    private takeoffTarget(): void {
        const from = this.closestNode();
        const [forwardX, forwardZ] = this.forward();
        const origin = this.fightOrigin();
        let to = this.closestNodeTo({ x: origin.x + forwardX * 40, y: 105, z: origin.z + forwardZ * 40 });
        const crystals = this.support.world.endCrystalsAlive?.();
        to = crystals !== undefined && crystals <= 0 ? ((to % 12) + 12) % 12 : ((to - 12) & 7) + 12;
        this.path = this.findPath(from, to, undefined);
        const path = this.path;
        if (path === undefined) return;
        path.next += 1;
        if (!isDone(path)) this.toNextNode();
    }

    /**
     * Java's `DragonSittingScanningPhase.doServerTick`.
     *
     * @javaSource DragonSittingScanningPhase.doServerTick
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
            const aimX = there.x - here.x;
            const aimZ = there.z - here.z;
            const aimLength = Math.hypot(aimX, aimZ) || 1;
            const [forwardX, forwardZ] = this.forward();
            const dot = clamp((forwardX * aimX + forwardZ * aimZ) / aimLength, -1, 1);
            const angle = (Math.acos(dot) * 180) / Math.PI + 0.5;
            if (angle < 0 || angle > 10) {
                const head = this.head();
                const dx = there.x - head.x;
                const dz = there.z - head.z;
                const turn = clamp(wrapDegrees(180 - (Math.atan2(dx, dz) * 180) / Math.PI - this.yRot), -100, 100);
                this.yRotA *= 0.8;
                const reach = Math.hypot(dx, dz) + 1;
                this.yRotA += turn * (0.7 / Math.min(reach, 40) / reach);
                this.yRot += this.yRotA;
                this.place(here);
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
     */
    private flameTick(): void {
        this.flameTicks += 1;
        if (this.flameTicks >= FLAME_TICKS) {
            this.setPhase(this.flameCount >= FLAME_ATTACKS ? 'takeoff' : 'sitting_scanning');
            return;
        }
        if (this.flameTicks !== FLAME_WARMUP) return;
        const here = this.support.position();
        const head = this.head();
        const outX = head.x - here.x;
        const outZ = head.z - here.z;
        const length = Math.hypot(outX, outZ) || 1;
        const x = head.x + (outX / length) * 2.5;
        const z = head.z + (outZ / length) * 2.5;
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

    /** Java's `getFlySpeed`, which bounds how steeply the dragon climbs or dives. */
    private flySpeed(): number {
        return this.phaseName === 'charging_player' ? 3 : this.phaseName === 'landing' ? 1.5 : 0.6;
    }

    /** Java's `getTurnSpeed`. */
    private turnSpeed(): number {
        const moving = Math.hypot(this.velocity.x, this.velocity.z) + 1;
        const capped = Math.min(moving, 40);
        return this.phaseName === 'landing' ? capped / moving : 0.7 / capped / moving;
    }

    /**
     * Java's `EnderDragon.aiStep` flight: climb, turn, thrust along the heading, move and drag.
     *
     * @javaSource EnderDragon.aiStep
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
        const across = Math.hypot(dx, dz);
        if (across > 0) dy = clamp(dy / across, -rise, rise);
        this.velocity = { ...this.velocity, y: this.velocity.y + dy * 0.01 };
        this.yRot = wrapDegrees(this.yRot);

        const reach = Math.sqrt(awaySquared) || 1;
        const facing = this.normalized({
            x: Math.sin(this.yRot * RADIANS),
            y: this.velocity.y,
            z: -Math.cos(this.yRot * RADIANS)
        });
        const alignment = Math.max(
            ((facing.x * dx + facing.y * (target.y - here.y) + facing.z * dz) / reach + 0.5) / 1.5,
            0
        );
        if (Math.abs(dx) > 1e-5 || Math.abs(dz) > 1e-5) {
            const turn = clamp(wrapDegrees(180 - (Math.atan2(dx, dz) * 180) / Math.PI - this.yRot), -50, 50);
            this.yRotA *= 0.8;
            this.yRotA += turn * this.turnSpeed();
            this.yRot += this.yRotA * 0.1;
        }
        const closeness = 2 / (awaySquared + 1);
        const thrust = 0.06 * (alignment * closeness + (1 - closeness));
        this.velocity = {
            x: this.velocity.x + thrust * Math.sin(this.yRot * RADIANS),
            y: this.velocity.y,
            z: this.velocity.z - thrust * Math.cos(this.yRot * RADIANS)
        };
        const moved = { x: here.x + this.velocity.x, y: here.y + this.velocity.y, z: here.z + this.velocity.z };
        const heading = this.normalized(this.velocity);
        const drag = 0.8 + (0.15 * (heading.x * facing.x + heading.y * facing.y + heading.z * facing.z + 1)) / 2;
        this.velocity = { x: this.velocity.x * drag, y: this.velocity.y * 0.91, z: this.velocity.z * drag };
        this.place(moved);
    }

    // The dragon's parts against the world.

    /**
     * Java's `EnderDragon.aiStep` once the dragon has moved, unless it was hurt in the last 10
     * ticks: each wing shoves every living thing near it away from the body, and while the
     * dragon flies hurts it for 5, and the head and the neck hurt every living thing
     * they touch for 10. A player in creative or spectator is left alone.
     *
     * @javaSource EnderDragon.aiStep
     */
    private touch(): void {
        if (this.hurtTime > 0) return;
        const here = this.support.position();
        const sin = Math.sin(this.yRot * RADIANS);
        const cos = Math.cos(this.yRot * RADIANS);
        const living = this.support
            .mobs(16)
            .filter((mob) =>
                mob.identifier?.() === 'minecraft:player'
                    ? this.support.isAttackable(mob)
                    : mob.health?.() !== undefined
            );
        const sitting = isSittingDragonPhase(this.phaseName);
        const body = { x: here.x + sin * BODY_REACH, z: here.z - cos * BODY_REACH };
        for (const side of [1, -1]) {
            const wing = { x: here.x + cos * WING_REACH * side, y: here.y + 2, z: here.z + sin * WING_REACH * side };
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
        const [forwardX, forwardZ] = this.forward();
        const head = this.head();
        const neck = { x: here.x + forwardX * NECK_REACH, y: head.y, z: here.z + forwardZ * NECK_REACH };
        const bitten = [partBox(head, 1, 1, { across: 1, up: 1 }), partBox(neck, 3, 3, { across: 1, up: 1 })];
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
        const here = this.support.position();
        const [forwardX, forwardZ] = this.forward();
        const head = this.head();
        const parts = [
            partBox(head, 1, 1),
            partBox({ x: here.x + forwardX * NECK_REACH, y: head.y, z: here.z + forwardZ * NECK_REACH }, 3, 3),
            partBox({ x: here.x + forwardX * BODY_REACH, y: here.y, z: here.z + forwardZ * BODY_REACH }, 5, 3)
        ];
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

    private normalized(vector: EntityPosition): EntityPosition {
        const length = Math.hypot(vector.x, vector.y, vector.z);
        return length < 1e-4
            ? { x: 0, y: 0, z: 0 }
            : { x: vector.x / length, y: vector.y / length, z: vector.z / length };
    }

    /** The dragon's horizontal heading, Java's `(sin yRot, -cos yRot)`. */
    private forward(): readonly [number, number] {
        return [Math.sin(this.yRot * RADIANS), -Math.cos(this.yRot * RADIANS)];
    }

    /** Where the dragon's head is, Java's head part position, held low while it sits. */
    private head(): EntityPosition {
        const here = this.support.position();
        const [forwardX, forwardZ] = this.forward();
        const sitting = SITTING_GROUP_PHASES.includes(this.phaseName) && this.phaseName !== 'landing_approach';
        return {
            x: here.x + forwardX * HEAD_REACH,
            y: here.y + (sitting ? -SITTING_HEAD_DROP : 0),
            z: here.z + forwardZ * HEAD_REACH
        };
    }

    // The fight's geometry.

    /**
     * The fight's origin, Java's `EnderDragon.getFightOrigin`.
     *
     * @javaSource EnderDragon.getFightOrigin
     */
    private fightOrigin(): EntityPosition {
        return this.support.world.fightOrigin?.() ?? { x: 0, y: 0, z: 0 };
    }

    /**
     * The block above the top of the exit portal, Java's `getHeightmapPos(MOTION_BLOCKING_NO_LEAVES,
     * EndPodiumFeature.getLocation(fightOrigin))`.
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

    /**
     * Java's 24 path nodes, built on first use: 12 on a ring of 60 around the fountain, 8 on a ring
     * of 40 ten blocks higher and 4 on a ring of 20, each 5 blocks over the ground and never below
     * ten blocks above sea level.
     */
    private pathNodes(): PathNode[] {
        if (this.nodes !== undefined) return this.nodes;
        const origin = this.fightOrigin();
        const floor = (this.support.world.seaLevel?.() ?? 63) + 10;
        const nodes: PathNode[] = [];
        for (let index = 0; index < NODE_COUNT; index += 1) {
            let lift = 5;
            let radius: number;
            let angle: number;
            if (index < 12) {
                radius = 60;
                angle = 2 * (-Math.PI + 0.2617994 * index);
            } else if (index < 20) {
                radius = 40;
                angle = 2 * (-Math.PI + 0.3926991 * (index - 12));
                lift += 10;
            } else {
                radius = 20;
                angle = 2 * (-Math.PI + 0.7853982 * (index - 20));
            }
            const x = Math.floor(origin.x) + Math.floor(radius * Math.cos(angle));
            const z = Math.floor(origin.z) + Math.floor(radius * Math.sin(angle));
            const ground = this.support.world.surfaceY?.(x, z) ?? floor;
            nodes.push({ x, y: Math.max(floor, ground + lift), z });
        }
        this.nodes = nodes;
        return nodes;
    }

    /** The first node a search may use: the inner rings only, once no crystal is left or with no fight. */
    private firstNode(): number {
        const crystals = this.support.world.endCrystalsAlive?.();
        return crystals === undefined || crystals === 0 ? INNER_NODES : 0;
    }

    /** Java's `findClosestNode()`, from where the dragon is. */
    private closestNode(): number {
        return this.closestNodeTo(this.support.position());
    }

    /** Java's `findClosestNode(x, y, z)`. */
    private closestNodeTo(at: EntityPosition): number {
        const nodes = this.pathNodes();
        const from = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
        let best = 10000;
        let closest = 0;
        for (let index = this.firstNode(); index < NODE_COUNT; index += 1) {
            const node = nodes[index];
            if (node === undefined) continue;
            const away = (node.x - from.x) ** 2 + (node.y - from.y) ** 2 + (node.z - from.z) ** 2;
            if (away < best) {
                best = away;
                closest = index;
            }
        }
        return closest;
    }

    /**
     * Java's `EnderDragon.findPath`: A* over the node graph from one node to another, ending at
     * `last` when one is given. A search that cannot reach its end goes as near as it can.
     *
     * @javaSource EnderDragon.findPath
     */
    private findPath(from: number, to: number, last: PathNode | undefined): NodePath | undefined {
        const nodes = this.pathNodes();
        const start = nodes[from];
        const end = nodes[to];
        if (start === undefined || end === undefined) return undefined;
        const lowest = this.firstNode();
        const cameFrom = new Map<number, number>();
        const cost = new Map<number, number>([[from, 0]]);
        const score = new Map<number, number>([[from, distance(start, end)]]);
        const open = new Set<number>([from]);
        const closed = new Set<number>();
        let closest = from;

        const route = (tail: number): NodePath => {
            const indices = [tail];
            let at = cameFrom.get(tail);
            while (at !== undefined) {
                indices.unshift(at);
                at = cameFrom.get(at);
            }
            const route = indices.flatMap((index) => nodes[index] ?? []);
            return { nodes: last === undefined ? route : [...route, last], next: 0 };
        };

        while (open.size > 0) {
            let current = -1;
            let lowestScore = Number.POSITIVE_INFINITY;
            for (const index of open) {
                const value = score.get(index) ?? Number.POSITIVE_INFINITY;
                if (value < lowestScore) {
                    lowestScore = value;
                    current = index;
                }
            }
            open.delete(current);
            const node = nodes[current];
            if (node === undefined) break;
            if (current === to) return route(current);
            const nearest = nodes[closest];
            if (nearest !== undefined && distance(node, end) < distance(nearest, end)) closest = current;
            closed.add(current);

            for (let next = lowest; next < NODE_COUNT; next += 1) {
                if (((NODE_ADJACENCY[current] ?? 0) & (1 << next)) === 0 || closed.has(next)) continue;
                const neighbor = nodes[next];
                if (neighbor === undefined) continue;
                const reached = (cost.get(current) ?? 0) + distance(node, neighbor);
                if (open.has(next) && reached >= (cost.get(next) ?? Number.POSITIVE_INFINITY)) continue;
                cameFrom.set(next, current);
                cost.set(next, reached);
                score.set(next, reached + distance(neighbor, end));
                open.add(next);
            }
        }
        return closest === from ? undefined : route(closest);
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
