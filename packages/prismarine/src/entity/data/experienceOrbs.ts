/**
 * Experience orbs as entities of the store, transcribed from Java 26.3's `ExperienceOrb`.
 *
 * An orb is Bedrock's `minecraft:xp_orb`, and the entity overlay's definition adds the host
 * component `jsprismarine:experience_orb` with the numbers Java's class hardcodes. Its value comes
 * with its spawn data, as Java's constructor takes it, and never changes. How many orbs of that
 * value it stands for, its age and its tick count are the component's state, so a merge, a pickup
 * and a save keep them.
 *
 * Java's award splits a payout into its orb sizes and adds each to an orb of the same value near
 * the spot when the roll picks one, so a burst of kills in one place does not pile up entities.
 * On its first tick and every twentieth after, an orb draws in the orbs of its value around it
 * whose runtime ids fall in its group of forty, and it follows the nearest player within eight
 * blocks. A player standing
 * against it takes one of its orbs every second tick. It is gone after 6000 ticks.
 *
 * The body's own physics moves it: Java's gravity of 0.03, Bedrock's buoyancy in water. This
 * system adds the pull toward the player it follows before that move.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';
import { defineComponentState, stateField } from '@jsprismarine/entities/componentState';

import type { DataEntity } from './DataEntity';
import type { SpawnOptions } from './scene';
import { experienceOrbs } from './deathExperience';
import { PrismarineEntityErrors } from '@jsprismarine/errors/prismarine/entity';

/** The type of every experience orb. */
export const EXPERIENCE_ORB = 'minecraft:xp_orb';

/** The host component that makes a data entity an orb this system runs, and holds its numbers. */
export const EXPERIENCE_ORB_COMPONENT = 'jsprismarine:experience_orb';

/** One orb's state: how many orbs of its value it holds, its age and its tick count. */
const orbState = defineComponentState(EXPERIENCE_ORB_COMPONENT, {
    count: stateField.number,
    age: stateField.number,
    ticks: stateField.number
});

/**
 * The player an orb follows, by runtime id, which Java keeps in `followingPlayer` and never saves.
 * Filed under a name no component has, so the saved form leaves it out.
 */
const followState = defineComponentState(
    'jsprismarine:experience_orb_follow',
    { player: stateField.number },
    { saved: false }
);

/** The numbers of `jsprismarine:experience_orb`. */
export interface OrbTuning {
    /** Ticks an orb lasts, Java's `LIFETIME`. */
    readonly lifetime: number;
    /** How often an orb looks for orbs to merge, Java's `ENTITY_SCAN_PERIOD`. */
    readonly scanInterval: number;
    /** How near a player has to be to be followed, Java's `MAX_FOLLOW_DIST`. */
    readonly followRange: number;
    /** The height above a player's feet of its eyes, half of which an orb aims at. */
    readonly followEyeHeight: number;
    /** The pull toward a followed player at no distance, in blocks a tick. */
    readonly followPull: number;
    /** How many groups the runtime ids fall in, only orbs of one group merging, Java's `ORB_GROUPS_PER_AREA`. */
    readonly mergeGroups: number;
    /** How far past its box an orb draws others in, Java's `ORB_MERGE_DISTANCE`. */
    readonly mergeReach: number;
    /** The size of the box around an award's spot that an orb joins another in. */
    readonly awardMergeSize: number;
    /** How far past a player's box sideways an orb is taken, Java's `Player.aiStep` inflation. */
    readonly pickupReach: number;
    /** How far above and below a player's box an orb is taken. */
    readonly pickupReachVertical: number;
    /** Ticks between two orbs one player takes, Java's `Player.takeXpDelay`. */
    readonly takeDelay: number;
}

const TUNING_FIELDS = {
    lifetime: 'lifetime',
    scanInterval: 'scan_interval',
    followRange: 'follow_range',
    followEyeHeight: 'follow_eye_height',
    followPull: 'follow_pull',
    mergeGroups: 'merge_groups',
    mergeReach: 'merge_reach',
    awardMergeSize: 'award_merge_size',
    pickupReach: 'pickup_reach',
    pickupReachVertical: 'pickup_reach_vertical',
    takeDelay: 'take_delay'
} as const satisfies Record<keyof OrbTuning, string>;

const tunings = new WeakMap<object, OrbTuning>();

/**
 * The numbers a `jsprismarine:experience_orb` component declares.
 * @param params - The component's parameters.
 * @param identifier - The type that declares them, for the error.
 * @throws When the component is missing or leaves a number out, which fails the update that asked.
 */
const tuningOf = (params: unknown, identifier: string): OrbTuning => {
    if (!isRecord(params))
        throw new PrismarineEntityErrors.MissingItemComponent({ identifier, itemComponent: EXPERIENCE_ORB_COMPONENT });
    const cached = tunings.get(params);
    if (cached !== undefined) return cached;

    const tuning: Record<string, number> = {};
    for (const [field, key] of Object.entries(TUNING_FIELDS)) {
        const value = params[key];
        if (typeof value !== 'number')
            throw new PrismarineEntityErrors.ItemComponentFieldNotNumber({
                itemComponent: EXPERIENCE_ORB_COMPONENT,
                key
            });
        tuning[field] = value;
    }
    const read: OrbTuning = {
        lifetime: tuning['lifetime']!,
        scanInterval: tuning['scanInterval']!,
        followRange: tuning['followRange']!,
        followEyeHeight: tuning['followEyeHeight']!,
        followPull: tuning['followPull']!,
        mergeGroups: tuning['mergeGroups']!,
        mergeReach: tuning['mergeReach']!,
        awardMergeSize: tuning['awardMergeSize']!,
        pickupReach: tuning['pickupReach']!,
        pickupReachVertical: tuning['pickupReachVertical']!,
        takeDelay: tuning['takeDelay']!
    };
    tunings.set(params, read);
    return read;
};

/**
 * The numbers an orb's definition declares.
 * @throws When the component leaves a number out, which fails the update that asked.
 */
export const orbTuningOf = (entity: DataEntity): OrbTuning =>
    tuningOf(entity.instance.componentParams(EXPERIENCE_ORB_COMPONENT), entity.identifier);

/** Whether a data entity is an orb this system runs. */
export const isExperienceOrb = (entity: DataEntity): boolean => entity.instance.hasComponent(EXPERIENCE_ORB_COMPONENT);

/** One orb as the rest of the server reads it. */
export interface OrbView {
    /** The points each of its orbs is worth. */
    readonly value: number;
    /** How many orbs of that value it holds. */
    readonly count: number;
    /** Ticks since it appeared or last took in an award. */
    readonly age: number;
    /** Ticks it has run, Java's `tickCount`, which paces the merge scan. */
    readonly ticks: number;
}

/**
 * The points an orb's spawn data gives each of its orbs. An orb spawned with none, as a pack's
 * `/summon` does, is worth nothing, as Java's `DEFAULT_VALUE` is.
 */
export const orbValueOf = (spawnData: Readonly<Record<string, unknown>> | undefined): number => {
    const value = spawnData?.['value'];
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
};

/** An orb's value and state, or undefined for an entity that is no orb. */
export const orbViewOf = (entity: DataEntity): OrbView | undefined => {
    if (!isExperienceOrb(entity)) return undefined;
    const state = entity.instance.componentState.get(orbState);
    return {
        value: orbValueOf(entity.spawnData),
        count: state?.count ?? 1,
        age: state?.age ?? 0,
        ticks: state?.ticks ?? 0
    };
};

const writeView = (entity: DataEntity, view: OrbView): void =>
    entity.instance.componentState.set(orbState, { count: view.count, age: view.age, ticks: view.ticks });

/** A player as an orb reads one: where its feet are and the box it stands in. */
export interface OrbTaker {
    readonly id: number;
    readonly position: EntityPosition;
    readonly width: number;
    readonly height: number;
    /** A spectator is never followed and takes nothing. */
    readonly spectator?: boolean;
}

/** What {@link ExperienceOrbs} needs from the runtime and the server behind it. */
export interface ExperienceOrbsHost {
    /** Creates one entity of the store, as `EntityRuntime.spawn` does. */
    spawn(identifier: string, at: EntityPosition, options: SpawnOptions): DataEntity | undefined;
    /**
     * The `jsprismarine:experience_orb` parameters of the orb type, which an award reads before
     * any orb exists. Undefined when no loaded pack gives the orb the component.
     */
    typeParams(): unknown;
    /** The entities whose boxes cross an axis-aligned box, in ascending runtime id order. */
    withinBox(min: EntityPosition, max: EntityPosition): readonly DataEntity[];
    /** The living players of the dimension this tick. */
    players(): readonly OrbTaker[];
    /** The level clock, which a player's take delay counts. */
    tick(): number;
    /** A random float in [0, 1). */
    random(): number;
    /** A random integer in [0, bound). */
    randomInt(bound: number): number;
    /** Takes an entity out of the store. */
    remove(id: number, reason: string): void;
    /**
     * Gives a player one orb's points: Mending repairs what it can and the rest is experience.
     * @param playerId - The player's runtime id.
     * @param orbId - The orb's runtime id.
     * @param value - The points of one orb.
     */
    take(playerId: number, orbId: number, value: number): void;
}

/** The experience orbs of one runtime, and the system that runs each of them once a tick. */
export class ExperienceOrbs {
    /** The tick each player last took an orb, by runtime id. */
    private readonly lastTaken = new Map<number, number>();

    public constructor(private readonly host: ExperienceOrbsHost) {}

    /**
     * Drops a payout as orbs at a spot, Java's `ExperienceOrb.award`: the payout split into the
     * largest orb sizes that fit, each added to an orb of the same value near the spot when the
     * roll picks one and spawned as a new orb with a random toss otherwise.
     * @returns The orbs spawned, without those an award joined.
     */
    public award(at: EntityPosition, points: number): DataEntity[] {
        const params = this.host.typeParams();
        const tuning = params === undefined ? undefined : tuningOf(params, EXPERIENCE_ORB);
        const spawned: DataEntity[] = [];
        for (const value of experienceOrbs(points)) {
            if (tuning !== undefined && this.joinExisting(at, value, tuning)) continue;
            const orb = this.spawn(at, value);
            if (orb !== undefined) spawned.push(orb);
        }
        return spawned;
    }

    /**
     * Spawns one orb of a value at a spot with Java's random toss: up to 0.2 blocks a tick
     * sideways each way and up to 0.4 up.
     */
    public spawn(at: EntityPosition, value: number): DataEntity | undefined {
        const yaw = this.host.random() * 360;
        const toss = {
            x: (this.host.random() * 0.2 - 0.1) * 2,
            y: this.host.random() * 0.2 * 2,
            z: (this.host.random() * 0.2 - 0.1) * 2
        };
        return this.host.spawn(EXPERIENCE_ORB, at, {
            yaw,
            data: { value },
            prepare: (orb) => {
                orb.body.velocity = toss;
            }
        });
    }

    /**
     * One orb's tick, in Java's order: merges on the scan tick, the follow, a pickup by a player
     * against it, and the age. The body's physics moves it after this.
     */
    public update(orb: DataEntity): void {
        const tuning = orbTuningOf(orb);
        let view = orbViewOf(orb);
        if (view === undefined) return;
        view = { ...view, ticks: view.ticks + 1 };
        // Java's `tickCount % 20 == 1`, counted from the first tick so an interval of 1 scans every tick.
        if ((view.ticks - 1) % tuning.scanInterval === 0) view = this.scanForMerges(orb, view, tuning);
        this.follow(orb, tuning);
        view = this.pickUp(orb, view, tuning);
        if (view.count <= 0) {
            this.host.remove(orb.id, 'picked_up');
            return;
        }
        view = { ...view, age: view.age + 1 };
        if (view.age >= tuning.lifetime) {
            this.host.remove(orb.id, 'despawn');
            return;
        }
        writeView(orb, view);
    }

    /**
     * Adds one orb to an orb of the same value whose box crosses the box around the spot, Java's
     * `tryMergeToExisting`: a roll picks one group of forty, and the first such orb in it takes
     * the award and starts its age over.
     */
    private joinExisting(at: EntityPosition, value: number, tuning: OrbTuning): boolean {
        const seed = this.host.randomInt(tuning.mergeGroups);
        const half = tuning.awardMergeSize / 2;
        const found = this.host
            .withinBox(
                { x: at.x - half, y: at.y - half, z: at.z - half },
                { x: at.x + half, y: at.y + half, z: at.z + half }
            )
            .find(
                (orb) =>
                    orb.removed === undefined &&
                    orbViewOf(orb)?.value === value &&
                    sameGroup(orb.id, seed, tuning.mergeGroups)
            );
        const view = found === undefined ? undefined : orbViewOf(found);
        if (found === undefined || view === undefined) return false;
        writeView(found, { ...view, count: view.count + 1, age: 0 });
        return true;
    }

    /**
     * Draws in the orbs of this one's value whose boxes cross its own grown by the merge reach and
     * whose runtime ids share its group, Java's `scanForMerges`: their counts add up, the younger
     * age stays, and they leave the store.
     */
    private scanForMerges(orb: DataEntity, start: OrbView, tuning: OrbTuning): OrbView {
        let view = start;
        const { x, y, z } = orb.position;
        const { width, height } = orb.facts.box;
        const reach = tuning.mergeReach;
        const nearby = this.host.withinBox(
            { x: x - width / 2 - reach, y: y - reach, z: z - width / 2 - reach },
            { x: x + width / 2 + reach, y: y + height + reach, z: z + width / 2 + reach }
        );
        for (const other of nearby) {
            if (other === orb || other.removed !== undefined) continue;
            const theirs = orbViewOf(other);
            if (theirs === undefined || theirs.value !== view.value) continue;
            if (!sameGroup(other.id, orb.id, tuning.mergeGroups)) continue;
            view = { ...view, count: view.count + theirs.count, age: Math.min(view.age, theirs.age) };
            this.host.remove(other.id, 'merged');
        }
        return view;
    }

    /**
     * Pulls the orb toward the player it follows, Java's `followNearbyPlayer`: it keeps following
     * a player who stays within the range and is no spectator, and otherwise picks the nearest
     * within it. The pull aims at half the player's eye height, and is stronger the nearer the
     * player.
     */
    private follow(orb: DataEntity, tuning: OrbTuning): void {
        const players = this.host.players();
        const at = orb.position;
        const range = tuning.followRange;
        const previous = orb.instance.componentState.get(followState)?.player;
        let target = players.find((player) => player.id === previous);
        if (target === undefined || target.spectator === true || squaredDistance(target.position, at) > range * range) {
            target = undefined;
            let nearest = range * range;
            for (const player of players) {
                const distance = squaredDistance(player.position, at);
                if (player.spectator === true || distance >= nearest) continue;
                nearest = distance;
                target = player;
            }
        }
        if (target === undefined) {
            orb.instance.componentState.clear(followState);
            return;
        }
        orb.instance.componentState.set(followState, { player: target.id });

        const toward = {
            x: target.position.x - at.x,
            y: target.position.y + tuning.followEyeHeight / 2 - at.y,
            z: target.position.z - at.z
        };
        const length = Math.hypot(toward.x, toward.y, toward.z);
        // Java's `Vec3.normalize` leaves a vector shorter than 1e-5 at zero.
        if (length < 1e-5) return;
        const closeness = 1 - length / range;
        const pull = (closeness * closeness * tuning.followPull) / length;
        const velocity = orb.body.velocity;
        orb.body.velocity = {
            x: velocity.x + toward.x * pull,
            y: velocity.y + toward.y * pull,
            z: velocity.z + toward.z * pull
        };
    }

    /**
     * Gives one of the orb's orbs to each player whose box, grown by the pickup reach, crosses the
     * orb's and who has waited out the take delay since the last orb it took, Java's
     * `Player.touch` and `ExperienceOrb.playerTouch`.
     */
    private pickUp(orb: DataEntity, start: OrbView, tuning: OrbTuning): OrbView {
        let view = start;
        const tick = this.host.tick();
        for (const player of this.host.players()) {
            if (view.count <= 0) break;
            if (player.spectator === true || !this.touches(orb, player, tuning)) continue;
            const last = this.lastTaken.get(player.id);
            if (last !== undefined && tick - last < tuning.takeDelay) continue;
            this.lastTaken.set(player.id, tick);
            this.host.take(player.id, orb.id, view.value);
            view = { ...view, count: view.count - 1 };
        }
        return view;
    }

    /** Whether a player's box grown by the pickup reach strictly crosses the orb's box. */
    private touches(orb: DataEntity, player: OrbTaker, tuning: OrbTuning): boolean {
        const { x, y, z } = orb.position;
        const { width, height } = orb.facts.box;
        const half = player.width / 2 + tuning.pickupReach;
        const feet = player.position.y - tuning.pickupReachVertical;
        const head = player.position.y + player.height + tuning.pickupReachVertical;
        return (
            x - width / 2 < player.position.x + half &&
            x + width / 2 > player.position.x - half &&
            z - width / 2 < player.position.z + half &&
            z + width / 2 > player.position.z - half &&
            y < head &&
            y + height > feet
        );
    }
}

/**
 * Whether two runtime ids fall in the same of `groups` merge groups, Java's `canMerge` test
 * `(id - seed) % 40 == 0`.
 */
const sameGroup = (id: number, seed: number, groups: number): boolean => (id - seed) % groups === 0;

const squaredDistance = (left: EntityPosition, right: EntityPosition): number =>
    (left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2;
