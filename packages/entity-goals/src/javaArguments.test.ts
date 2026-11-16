import { describe, expect, it } from 'vitest';

import type { JavaGoalContext, JavaGoalEntry } from './javaArguments';
import { JAVA_TRANSLATED_GOALS, javaGoalBody, matchingJavaGoals } from './javaArguments';

const goal = (name: string, params: JavaGoalEntry['params'], extra: Partial<JavaGoalEntry> = {}): JavaGoalEntry => ({
    goal: name,
    classes: [name],
    selector: 'goal',
    priority: 1,
    params,
    calls: [],
    ...extra
});

const classOf = (...entities: string[]) => ({ class: 'net/minecraft/world/entity/Some', entities });

/** A context whose entity filter names the Java types it was asked for, so a test can read them back. */
const context: JavaGoalContext = {
    self: 'minecraft:zombie',
    attribute: (name) => ({ 'minecraft:follow_range': 35, 'minecraft:tempt_range': 10 })[name],
    entityFilter: (entities) => (entities.length === 0 ? undefined : { types: [...entities].sort() }),
    items: (predicate) => [...(predicate.itemTags ?? []).map((tag) => `${tag}#member`), ...(predicate.items ?? [])]
};

describe('javaGoalBody', () => {
    it('lists every goal it translates by component name', () => {
        expect(JAVA_TRANSLATED_GOALS).toContain('minecraft:behavior.look_at_player');
        expect(JAVA_TRANSLATED_GOALS.every((name) => name.startsWith('minecraft:behavior.'))).toBe(true);
    });

    it('finds the Java goals that stand for a Bedrock goal, and none for one it does not translate', () => {
        const float = goal('FloatGoal', {});
        expect(matchingJavaGoals('minecraft:behavior.float', [float, goal('PanicGoal', {})])).toEqual([float]);
        expect(matchingJavaGoals('minecraft:behavior.float', [])).toEqual([]);
        expect(matchingJavaGoals('minecraft:behavior.not_a_goal', [float])).toBeUndefined();
    });

    it('matches no Java goal for a Bedrock goal no Java class has, such as walking to a mount', () => {
        expect(matchingJavaGoals('minecraft:behavior.find_mount', [goal('FloatGoal', {})])).toEqual([]);
        const look = goal('RandomLookAroundGoal', {});
        expect(matchingJavaGoals('minecraft:behavior.random_look_around', [look])).toEqual([look]);
    });

    it("leaves a body alone when the mob's Java class registers no matching goal", () => {
        const body = { priority: 7, look_distance: 6 };
        expect(javaGoalBody('minecraft:behavior.look_at_player', body, [], context)).toBe(body);
        expect(javaGoalBody('minecraft:behavior.not_a_goal', body, [goal('LookAtPlayerGoal', {})], context)).toBe(body);
    });

    it("looks as far and as often as Java's player look goal, and holds the look for the goal's own time", () => {
        const java = [
            goal('LookAtPlayerGoal', { lookAtType: classOf('minecraft:player'), lookDistance: 8, probability: 0.02 }),
            goal('LookAtPlayerGoal', { lookAtType: classOf('minecraft:cow'), lookDistance: 3 })
        ];
        const body = javaGoalBody(
            'minecraft:behavior.look_at_player',
            { priority: 7, look_distance: 6, probability: 0.02, look_time: [1, 2] },
            java,
            context
        );
        expect(body).toEqual({ priority: 7, look_distance: 8, probability: 0.02 });
    });

    it("bounds the pack's targets by Java's classes, adds the classes Java targets outright, and searches the follow range", () => {
        const java = [
            goal('NearestAttackableTargetGoal', {
                targetType: classOf('minecraft:player'),
                mustSee: 1,
                randomInterval: 10,
                selector: null
            }),
            goal('NearestAttackableTargetGoal', {
                targetType: classOf('minecraft:villager'),
                mustSee: 0,
                randomInterval: 10,
                // A predicate of the mob's own narrows the class, so the pack's conditions stand for it.
                selector: { lambda: 'net/minecraft/world/entity/monster/Drowned.okTarget' }
            })
        ];
        const body = javaGoalBody(
            'minecraft:behavior.nearest_attackable_target',
            { priority: 2, entity_types: [{ filters: { pack: 'snow_golem' }, max_dist: 20 }] },
            java,
            context
        );
        expect(body).toEqual({
            priority: 2,
            within_radius: 35,
            scan_interval: 10,
            entity_types: [
                {
                    filters: {
                        all_of: [{ pack: 'snow_golem' }, { types: ['minecraft:player', 'minecraft:villager'] }]
                    },
                    max_dist: 35
                },
                { filters: { types: ['minecraft:player'] }, max_dist: 35, must_see: true }
            ]
        });
    });

    it('strikes back at every attacker but the ones Java ignores, its own kind included, and alerts when Java does', () => {
        const java = [
            goal(
                'HurtByTargetGoal',
                {
                    ignoreDamageFromTheseTypes: {
                        array: [classOf('minecraft:witch'), { call: 'Object.getClass', args: [] }]
                    }
                },
                { calls: [{ name: 'setAlertOthers', args: [{ array: [] }] }] }
            )
        ];
        const body = javaGoalBody(
            'minecraft:behavior.hurt_by_target',
            { priority: 1, entity_types: { filters: { pack: 'not a breeze' } } },
            java,
            context
        );
        expect(body).toEqual({
            priority: 1,
            alert_same_type: true,
            entity_types: [{ filters: { none_of: [{ types: ['minecraft:witch', 'minecraft:zombie'] }] } }]
        });
    });

    it("avoids Java's classes at Java's distance and speeds, keeping the pack's conditions on a narrowed goal", () => {
        const java = [
            goal('AvoidEntityGoal', {
                avoidClass: classOf('minecraft:wolf'),
                maxDist: 10,
                walkSpeedModifier: 2.2,
                sprintSpeedModifier: 2.2
            }),
            goal(
                'AvoidEntityGoal',
                {
                    avoidClass: classOf('minecraft:player'),
                    maxDist: 8,
                    walkSpeedModifier: 2.2,
                    sprintSpeedModifier: 2.2
                },
                { classes: ['Rabbit$RabbitAvoidEntityGoal', 'AvoidEntityGoal'] }
            )
        ];
        const body = javaGoalBody(
            'minecraft:behavior.avoid_mob_type',
            { priority: 4, entity_types: [{ filters: { pack: 'untrusted player' }, max_dist: 4 }] },
            java,
            context
        );
        expect(body.entity_types).toEqual([
            {
                filters: { types: ['minecraft:wolf'] },
                max_dist: 10,
                walk_speed_multiplier: 2.2,
                sprint_speed_multiplier: 2.2
            },
            {
                filters: { all_of: [{ types: ['minecraft:player'] }, { any_of: [{ pack: 'untrusted player' }] }] },
                max_dist: 8,
                walk_speed_multiplier: 2.2,
                sprint_speed_multiplier: 2.2
            }
        ]);
    });

    it("is tempted by Java's items within the mob's Java tempt range", () => {
        const java = [
            goal('TemptGoal', {
                speedModifier: 1.25,
                items: {
                    lambda: 'net/minecraft/world/entity/animal/cow/AbstractCow.lambda$0',
                    itemTags: ['minecraft:cow_food']
                },
                canScare: 0,
                stopDistance: 2.5
            })
        ];
        const body = javaGoalBody(
            'minecraft:behavior.tempt',
            { priority: 4, items: ['wheat'], within_radius: 16, speed_multiplier: 1.25 },
            java,
            context
        );
        expect(body).toEqual({
            priority: 4,
            items: ['minecraft:cow_food#member'],
            within_radius: 10,
            speed_multiplier: 1.25,
            stop_distance: 2.5,
            can_get_scared: false
        });
    });

    it("takes the panic speed and, for Java's default predicate, the goal's own damage causes", () => {
        const java = [
            goal('PanicGoal', {
                speedModifier: 2,
                panicCausingDamageTypes: { lambda: 'net/minecraft/world/entity/ai/goal/PanicGoal.lambda$new$0' }
            })
        ];
        expect(
            javaGoalBody(
                'minecraft:behavior.panic',
                { speed_multiplier: 1.25, damage_sources: ['fall'], ignore_mob_damage: true },
                java,
                context
            )
        ).toEqual({ speed_multiplier: 2 });
    });

    it('teleports a following pet from 12 blocks, which TamableAnimal.shouldTryTeleportToOwner tests', () => {
        const body = javaGoalBody(
            'minecraft:behavior.teleport_to_owner',
            { priority: 0, filters: { all_of: [{ test: 'is_panicking' }] } },
            [goal('FollowOwnerGoal', { speedModifier: 1, startDistance: 10, stopDistance: 2 })],
            context
        );
        expect(body.filters).toEqual({ test: 'owner_distance', subject: 'self', operator: '>=', value: 12 });
    });

    it("starts a fish's swim on a twentieth of the selector runs for Java's interval of 40", () => {
        const body = javaGoalBody(
            'minecraft:behavior.swim_wander',
            { interval: 0.1, look_ahead: 2 },
            [
                goal(
                    'RandomSwimmingGoal',
                    { speedModifier: 1, interval: 40 },
                    { classes: ['AbstractFish$FishSwimGoal', 'RandomSwimmingGoal'] }
                )
            ],
            context
        );
        expect(body).toEqual({ interval: 2, look_ahead: 2, speed_multiplier: 1 });
    });
});
