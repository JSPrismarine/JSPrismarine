import type {
    EntityActuator,
    EntityFlag,
    EntityInstance,
    EntityMeasure,
    EntityPosition,
    FilterContext,
    FilterWorldView
} from '@jsprismarine/entities';
import { evaluateFilter } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';

import { Navigator } from './navigator';
import type { NavigationProfile } from './navigation/profile';
import { navigationProfile } from './navigation/profile';
import type { NavigationView } from './navigation/view';
import { distanceBetween, horizontalDistance } from './navigation/view';
import type { GoalEvent, TargetEntityType } from './params';
import type { GoalMob, GoalWorld } from './world';
import { emptyGoalWorld } from './world';

/**
 * Everything the 170 goals have in common, behind one object.
 *
 * A goal implementation never touches `EntityInstance`, `EntityActuator` or
 * {@link GoalWorld} directly. It asks this for what it needs, which keeps each
 * goal to its own condition and its own effect, and keeps the seams in one
 * place when the server grows a member.
 */
export class GoalSupport {
    /** Moves the entity, pathing with the A* finder when the world has a view. */
    public readonly navigator: Navigator;

    public constructor(
        /** The entity the goal runs on. */
        public readonly entity: EntityInstance,
        /** The world seam, which answers nothing when the server supplied none. */
        public readonly world: GoalWorld = emptyGoalWorld
    ) {
        this.navigator = new Navigator({
            actuator: entity.actuator,
            navigation: () => this.navigation(),
            profile: () => this.profile()
        });
    }

    /** Moves, looks and jumps; undefined when the caller supplied no actuator. */
    public get actuator(): EntityActuator | undefined {
        return this.entity.actuator;
    }

    /** The blocks around the entity, or undefined when the world answers none. */
    public navigation(): NavigationView | undefined {
        return this.world.navigation?.();
    }

    /** The path finder's rules for this entity, from its `minecraft:navigation.*` component. */
    public profile(): NavigationProfile {
        return navigationProfile(this.entity);
    }

    /** Where the entity is, or the origin when no actuator answers. */
    public position(): EntityPosition {
        return this.actuator?.position() ?? { x: 0, y: 0, z: 0 };
    }

    /** The straight-line distance from the entity to a position. */
    public distanceTo(position: EntityPosition): number {
        return distanceBetween(this.position(), position);
    }

    /** The distance from the entity to a position, ignoring height. */
    public horizontalDistanceTo(position: EntityPosition): number {
        return horizontalDistance(this.position(), position);
    }

    /** The next value of the entity's random source, in [0, 1). */
    public random(): number {
        return this.entity.random.next();
    }

    /** Whether a chance in [0, 1] comes up this tick. */
    public chance(probability: number): boolean {
        if (probability >= 1) return true;
        if (probability <= 0) return false;
        return this.random() < probability;
    }

    /** A whole number in `[min, max]`, which is how the duration ranges are drawn. */
    public between(min: number, max: number): number {
        if (max <= min) return Math.round(min);
        return Math.round(min + this.random() * (max - min));
    }

    /** One of the entity's own boolean facts, such as `in_water` or `is_sitting`. */
    public flag(name: EntityFlag): boolean {
        return this.entity.filterContext().self.flag?.(name) === true;
    }

    /** One of the entity's own numeric facts, such as `actor_health`. */
    public measure(name: EntityMeasure): number | undefined {
        return this.entity.filterContext().self.measure?.(name);
    }

    /** The world facts the time, weather and difficulty tests read. */
    public worldView(): FilterWorldView | undefined {
        return this.entity.filterContext().world;
    }

    /** Time of day in ticks, in [0, 24000), or undefined when nothing answers. */
    public timeOfDay(): number | undefined {
        return this.worldView()?.timeOfDay?.();
    }

    /** Whether it is night, which the sleep, nap and village goals gate on. */
    public isNight(): boolean {
        const time = this.timeOfDay();
        return time !== undefined && (time >= 13000 || time < 1000);
    }

    /** Whether it is raining or thundering now. */
    public isRaining(): boolean {
        const weather = this.worldView()?.weather?.();
        return weather === 'rain' || weather === 'thunder' || weather === 'precipitation';
    }

    /** Evaluates a filter with the entity as `self` and an optional other entity as `other`. */
    public matches(filter: Filter | undefined, other?: GoalMob): boolean {
        if (filter === undefined) return true;
        return evaluateFilter(filter, this.contextWith(other));
    }

    /** The mobs within the radius, nearest first, or none when the world answers none. */
    public mobs(radius: number): readonly GoalMob[] {
        return this.world.mobs?.(radius) ?? [];
    }

    /** The players within the radius, nearest first. */
    public players(radius: number): readonly GoalMob[] {
        return this.world.players?.(radius) ?? [];
    }

    /** The nearest player within the radius, or undefined when there is none. */
    public nearestPlayer(radius: number): GoalMob | undefined {
        return this.players(radius)[0];
    }

    /** The entity's attack target. */
    public target(): GoalMob | undefined {
        return this.world.target?.();
    }

    /** Sets the entity's attack target and fires `minecraft:on_target_acquired`. */
    public setTarget(mob: GoalMob | undefined): void {
        this.world.setTarget?.(mob);
    }

    /** Whether the entity can see the mob; true when the world does not answer. */
    public canSee(mob: GoalMob): boolean {
        return this.world.canSee?.(mob) ?? true;
    }

    /** Whether Java's combat target rules allow this mob to be selected or retained. */
    public isAttackable(mob: GoalMob): boolean {
        return this.world.isAttackable?.(mob) ?? true;
    }

    /** The nearest entry accepted target, after applying Java's combat target rules. */
    public findAttackTarget(
        entries: readonly TargetEntityType[],
        radius: number,
        candidates: readonly GoalMob[] = this.mobs(radius)
    ): GoalMob | undefined {
        for (const mob of candidates) {
            if (!this.isAttackable(mob)) continue;
            if (this.entryFor(entries, mob) !== undefined) return mob;
        }
        return undefined;
    }

    /**
     * Finds the first mob an `entity_types` table accepts.
     *
     * The table's own `max_dist` bounds each entry, the goal's `within_radius`
     * bounds the search, and `must_see` is checked against
     * {@link GoalSupport.canSee}.
     */
    public findTarget(
        entries: readonly TargetEntityType[],
        radius: number,
        candidates?: readonly GoalMob[]
    ): GoalMob | undefined {
        if (entries.length === 0) return undefined;
        const mobs = candidates ?? this.mobs(radius);
        for (const mob of mobs) {
            const entry = this.entryFor(entries, mob);
            if (entry === undefined) continue;
            return mob;
        }
        return undefined;
    }

    /** The `entity_types` entry that accepts the mob, or undefined when none does. */
    public entryFor(entries: readonly TargetEntityType[], mob: GoalMob): TargetEntityType | undefined {
        for (const entry of entries) {
            if (this.distanceTo(mob.position()) > entry.maxDistance) continue;
            if (entry.mustSee && !this.canSee(mob)) continue;
            if (!this.matches(entry.filters, mob)) continue;
            return entry;
        }
        return undefined;
    }

    /** Whether any entry of an `entity_types` table accepts the mob. */
    public accepts(entries: readonly TargetEntityType[], mob: GoalMob): boolean {
        return this.entryFor(entries, mob) !== undefined;
    }

    /**
     * Fires one of a goal's event hooks.
     *
     * A hook aimed at `self` runs through `EntityInstance.fire`, so its
     * effects land on the entity's next tick like every other event. A hook
     * aimed at another subject goes to {@link GoalWorld.trigger}, because
     * routing an event to another entity is the server's job.
     */
    public fire(hook: GoalEvent | undefined, other?: GoalMob): void {
        if (hook === undefined) return;
        if (hook.filters !== undefined && !this.matches(hook.filters, other)) return;
        if (hook.target === 'self') {
            this.entity.fire(hook.event);
            return;
        }
        if (this.world.trigger === undefined) {
            this.report(`${hook.event} is aimed at ${hook.target}, which nothing routes`);
            return;
        }
        this.world.trigger(hook.event, hook.target);
    }

    /** Fires every hook of a list, which the goals that write `on_reach` as an array need. */
    public fireAll(hooks: readonly GoalEvent[], other?: GoalMob): void {
        for (const hook of hooks) this.fire(hook, other);
    }

    /** Plays one of the entity's sound events. */
    public playSound(name: string | undefined): void {
        if (name !== undefined) this.world.playSound?.(name);
    }

    /** Points the entity's head at a position. */
    public lookAt(position: EntityPosition): void {
        this.actuator?.lookAt(position);
    }

    /** Records something the goal met and could not carry out. */
    public report(message: string): void {
        this.world.report?.(message);
    }

    /** The filter context with another entity bound to `other`. */
    private contextWith(other: GoalMob | undefined): FilterContext {
        const context = this.entity.filterContext();
        return other === undefined ? context : { ...context, other: other.view() };
    }
}
