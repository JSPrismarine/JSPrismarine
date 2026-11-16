import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import { bodySchema, numberAt } from '../params';
import type { GoalSupport } from '../support';
import type { GoalMob, SchoolMembership } from '../world';

/**
 * Java's fish schools: `AbstractSchoolingFish` and `FollowFlockLeaderGoal`, which cod, salmon and
 * tropical fish run.
 *
 * Every so often a fish that neither leads nor follows looks at the fish of its own type within 8
 * blocks. If one of them leads a school with room left, that one leads; otherwise this fish does.
 * The leader takes every free fish of the list into its school, up to its maximum size, and each
 * follower paths to it every 10 ticks until it is more than 11 blocks away. A follower does no
 * random swimming of its own. Bedrock writes the school as `minecraft:flocking`, whose
 * `high_flock_limit` is the largest school.
 */

/** How far a fish looks for others of its kind, from the box `FollowFlockLeaderGoal.canUse` inflates by 8. */
const SCHOOL_SEARCH_RANGE = 8;

/** How far a follower keeps after its leader, from `AbstractSchoolingFish.inRangeOfLeader` (121, squared). */
const LEADER_RANGE = 11;

/** Selector updates between a follower's paths to its leader: `adjustedTickDelay(10)` of a goal ticked every other tick. */
const REPATH_UPDATES = 5;

/** What `minecraft:flocking` declares that Java's school reads. */
interface SchoolParams {
    /** The most fish a school holds, its leader included: `AbstractSchoolingFish.getMaxSchoolSize`. */
    readonly maxSchoolSize: number;
}

/** Java's `FollowFlockLeaderGoal.nextStartTick`: `reducedTickDelay(200 + nextInt(200) % 20)`. */
const nextStartTick = (support: GoalSupport): number => Math.ceil((200 + (support.randomInt(200) % 20)) / 2);

/** Whether a fish follows a leader, Java's `isFollower`. */
const isFollower = (school: SchoolMembership): boolean => school.leader !== undefined;

/** Whether a fish leads a school, Java's `hasFollowers`. */
const hasFollowers = (school: SchoolMembership): boolean => school.size > 1;

/** Java's `startFollowing`: the fish joins the leader's school. */
const startFollowing = (school: SchoolMembership, leader: SchoolMembership): void => {
    school.leader = leader;
    leader.size += 1;
};

/** Java's `stopFollowing`: the fish leaves its leader's school. */
const stopFollowing = (school: SchoolMembership): void => {
    if (school.leader !== undefined) school.leader.size -= 1;
    school.leader = undefined;
};

/**
 * Whether a mob lies inside the box Java searches, the fish's own box inflated by `range` on every
 * side, measured from the fish's position.
 */
const insideBox = (support: GoalSupport, mob: GoalMob, range: number): boolean => {
    const here = support.position();
    const there = mob.position();
    return (
        Math.abs(there.x - here.x) <= range &&
        Math.abs(there.y - here.y) <= range &&
        Math.abs(there.z - here.z) <= range
    );
};

/**
 * `minecraft:flocking`, run as Java's `FollowFlockLeaderGoal`. It holds no control flags, as Java's
 * holds none, so it runs beside the swimming goals; the random swim goals stand down for a fish
 * that follows a leader, which is Java's `AbstractSchoolingFish.canRandomSwim`.
 */
export const flocking = goal<SchoolParams>({
    name: 'minecraft:flocking',
    controlFlags: [],
    schema: bodySchema((body) => ({ maxSchoolSize: Math.max(1, Math.floor(numberAt(body, 'high_flock_limit', 8))) })),
    create: (params, support) => {
        let startIn = nextStartTick(support);
        let repath = 0;
        const own = (): SchoolMembership | undefined => support.world.school?.();
        const canBeFollowed = (school: SchoolMembership): boolean =>
            hasFollowers(school) && school.size < params.maxSchoolSize;
        /** The leader this fish follows, when it is a fish within Java's range of it. */
        const leaderMob = (school: SchoolMembership): GoalMob | undefined =>
            school.leader === undefined
                ? undefined
                : support.mobs(LEADER_RANGE).find((mob) => mob.school?.() === school.leader);

        /**
         * Java's `AbstractSchoolingFish.tick` for a leader: one tick in 200 it counts the fish of
         * its type in its box, and with none left it leads a school of one again. The selector
         * asks every other tick, so each ask stands for two of Java's ticks.
         */
        const dissolveIfAlone = (school: SchoolMembership): void => {
            if (!hasFollowers(school) || support.randomInt(100) !== 1) return;
            const type = support.entity.type.identifier;
            const company = support
                .mobs(SCHOOL_SEARCH_RANGE * Math.sqrt(3))
                .some((mob) => mob.identifier?.() === type && insideBox(support, mob, SCHOOL_SEARCH_RANGE));
            if (!company) school.size = 1;
        };

        return {
            canStart: () => {
                const school = own();
                if (school === undefined) return false;
                dissolveIfAlone(school);
                if (hasFollowers(school)) return false;
                if (isFollower(school)) return true;
                if (startIn > 0) {
                    startIn -= 1;
                    return false;
                }
                startIn = nextStartTick(support);

                // The fish of this type in the box, this fish first, as Java's list includes it.
                const type = support.entity.type.identifier;
                const schools: SchoolMembership[] = [school];
                for (const mob of support.mobs(SCHOOL_SEARCH_RANGE * Math.sqrt(3))) {
                    const other = mob.school?.();
                    if (other === undefined || mob.identifier?.() !== type) continue;
                    if (!insideBox(support, mob, SCHOOL_SEARCH_RANGE)) continue;
                    if (canBeFollowed(other) || !isFollower(other)) schools.push(other);
                }
                const leader = schools.find(canBeFollowed) ?? school;
                // `addFollowers`: limit before the leader is filtered out, as Java's stream does.
                const joining = schools
                    .filter((other) => !isFollower(other))
                    .slice(0, Math.max(0, params.maxSchoolSize - leader.size))
                    .filter((other) => other !== leader);
                for (const other of joining) startFollowing(other, leader);
                return isFollower(school);
            },
            canContinue: () => {
                const school = own();
                return school !== undefined && isFollower(school) && leaderMob(school) !== undefined;
            },
            start: () => {
                repath = 0;
            },
            tick: () => {
                if ((repath -= 1) > 0) {
                    support.navigator.tick();
                    return;
                }
                repath = REPATH_UPDATES;
                const school = own();
                const leader = school === undefined ? undefined : leaderMob(school);
                if (leader !== undefined) support.navigator.moveTo(leader.position(), 1);
            },
            stop: () => {
                const school = own();
                if (school !== undefined) stopFollowing(school);
                support.navigator.stop();
            }
        };
    }
});

/** The goals Bedrock writes as components rather than as `minecraft:behavior.*` entries. */
export const componentGoals: readonly RegisterableGoal[] = [flocking];
