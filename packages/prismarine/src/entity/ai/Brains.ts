import GoalSelector from './GoalSelector';
import { CHASE_MULTIPLIER, LOOK_DISTANCE, STROLL_MULTIPLIER, WALK_SPEED } from './Speed';
import ApproachTargetGoal from './goals/ApproachTargetGoal';
import FloatGoal from './goals/FloatGoal';
import HurtByTargetGoal from './goals/HurtByTargetGoal';
import LookAtPlayerGoal from './goals/LookAtPlayerGoal';
import MeleeAttackGoal from './goals/MeleeAttackGoal';
import NearestAttackableTargetGoal from './goals/NearestAttackableTargetGoal';
import PanicGoal from './goals/PanicGoal';
import RandomLookAroundGoal from './goals/RandomLookAroundGoal';
import RandomStrollGoal from './goals/RandomStrollGoal';
import RangedAttackGoal from './goals/RangedAttackGoal';
import { monsters, players } from './Targeting';

/**
 * The behaviour a mob is built with.
 *
 * Four of them cover nearly every mob that spawns, and a mob with something particular to do adds
 * its own goals to whichever it starts from - which is the point of goals being a list rather than
 * a state machine. Nothing here is special-cased per species; a cow and a sheep differ in what they
 * are made of, not in how they decide where to walk.
 *
 * The three fighting brains differ from each other in exactly one line - which filter they hand to
 * `NearestAttackableTargetGoal`. Everything else about hunting somebody down is shared, which is
 * what the split between choosing, approaching and swinging bought.
 *
 * The speeds themselves are in `Speed.ts`, written in blocks per second so they can be judged
 * against a player's 4.317 walking and 5.6 sprinting.
 */

/**
 * Wanders, occasionally watches a passer-by, glances about otherwise, and gets out of the water.
 *
 * The same goals a vanilla cow has, at the same relative priorities: panic, float, stroll, look at
 * player, look around. Most of a mob's life is the last two, because strolling only starts on a one
 * in a hundred and twenty roll - so an idle animal is mostly a standing animal that moves its head.
 *
 * It panics but does not fight back, which is the whole of the difference between an animal and a
 * monster here. Before the panic goal existed, being hit did nothing at all and a herd stood
 * placidly while it was slaughtered.
 */
export const wanderingBrain = (): GoalSelector =>
    new GoalSelector()
        .add(new PanicGoal())
        .add(new FloatGoal())
        .add(new RandomStrollGoal())
        .add(new LookAtPlayerGoal())
        .add(new RandomLookAroundGoal());

/**
 * The same, but it comes for you.
 *
 * Faster while pursuing than while wandering, and it watches you the whole time it is coming rather
 * than glancing - which is what makes being chased feel different from being ignored. It fights
 * back at anything that hurts it, so a skeleton's stray arrow starts a fight between two monsters
 * without anything here knowing that mobs can fight each other.
 */
export const hostileBrain = ({ range = 16, chaseSpeed = WALK_SPEED * CHASE_MULTIPLIER } = {}): GoalSelector =>
    new GoalSelector()
        .add(new FloatGoal())
        .add(new HurtByTargetGoal())
        .add(new NearestAttackableTargetGoal(players, range))
        .add(new MeleeAttackGoal())
        .add(new ApproachTargetGoal(chaseSpeed))
        .add(new RandomStrollGoal())
        .add(new LookAtPlayerGoal())
        .add(new RandomLookAroundGoal());

/**
 * Fights back, but never starts anything.
 *
 * A wolf, a polar bear, a zombie pigman: left alone they wander like any animal, and hit one and
 * it comes for you. The difference from {@link hostileBrain} is a single missing goal - there is
 * nothing looking for somebody to fight, so the only way to become its target is to hurt it.
 */
export const neutralBrain = ({ chaseSpeed = WALK_SPEED * CHASE_MULTIPLIER } = {}): GoalSelector =>
    new GoalSelector()
        .add(new FloatGoal())
        .add(new HurtByTargetGoal())
        .add(new MeleeAttackGoal())
        .add(new ApproachTargetGoal(chaseSpeed))
        .add(new RandomStrollGoal())
        .add(new LookAtPlayerGoal())
        .add(new RandomLookAroundGoal());

/**
 * Villagers and the like: they stay busier than an animal and take more interest in people.
 *
 * A brisker stroll, a longer look range and a far greater readiness to use it - a villager that
 * ignored you as thoroughly as a cow does would not read as a person.
 */
export const villagerBrain = (): GoalSelector =>
    new GoalSelector()
        .add(new PanicGoal())
        .add(new FloatGoal())
        .add(new RandomStrollGoal(WALK_SPEED * STROLL_MULTIPLIER * 1.15))
        .add(new LookAtPlayerGoal(LOOK_DISTANCE + 4, 0.12))
        .add(new RandomLookAroundGoal());

/**
 * The archers: skeletons and strays.
 *
 * The hostile brain with the swing swapped for a bow. The ranged goal outranks the approach, so a
 * skeleton that has got within bow range stops closing and starts shooting - and backs off if you
 * walk into it, which is what makes a bow dangerous rather than merely a worse sword.
 */
export const rangedBrain = ({ range = 16, chaseSpeed = WALK_SPEED * CHASE_MULTIPLIER } = {}): GoalSelector =>
    new GoalSelector()
        .add(new FloatGoal())
        .add(new HurtByTargetGoal())
        .add(new NearestAttackableTargetGoal(players, range))
        .add(new RangedAttackGoal())
        .add(new ApproachTargetGoal(chaseSpeed))
        .add(new RandomStrollGoal())
        .add(new LookAtPlayerGoal())
        .add(new RandomLookAroundGoal());

/**
 * Golems and tamed wolves: everything a hostile mob does, pointed the other way.
 *
 * One filter apart from {@link hostileBrain}, which is the point. A golem hunts monsters instead of
 * people, and that difference is a single argument rather than a second set of goals - so anything
 * that improves how mobs chase improves how they defend, for free.
 */
export const guardianBrain = ({ range = 16, chaseSpeed = WALK_SPEED * CHASE_MULTIPLIER } = {}): GoalSelector =>
    new GoalSelector()
        .add(new FloatGoal())
        .add(new HurtByTargetGoal())
        .add(new NearestAttackableTargetGoal(monsters, range))
        .add(new MeleeAttackGoal())
        .add(new ApproachTargetGoal(chaseSpeed))
        .add(new RandomStrollGoal())
        .add(new LookAtPlayerGoal())
        .add(new RandomLookAroundGoal());
