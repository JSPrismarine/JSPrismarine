import { javaBlockStateToBedrock } from '@jsprismarine/mapping';

import type { BehaviorScenario, ScenarioOutcome } from '../behaviorScenarios.ts';
import { serverContent } from '../serverStack.ts';
import type { Probe, ProbeOptions } from './goalProbe.ts';
import { withProbe } from './goalProbe.ts';
import type { EntitySubject } from './subjects.ts';
import { entitiesDeclaring } from './subjects.ts';

/**
 * The scenarios for the mob-specific AI goals: every `minecraft:behavior.*` goal fewer than four
 * entities declare. Each one spawns the entity in a private server stack, keeps only the goals
 * under test on its scheduler, drives the world into the situation the Java goal reacts to, and
 * compares what the server did with what Java's goal or brain does.
 */

/** The component name of a goal. */
const behavior = (goal: string): string => `minecraft:behavior.${goal}`;

/** Whether an entity's server definition declares a component, in its base or a group. */
const declares = (subject: EntitySubject, component: string): boolean =>
    serverContent().entities.registry.get(subject.bedrock)?.declaredComponents.includes(component) === true;

/** One comparison of a goal, or a few goals that only make sense together, with Java. */
interface GoalCheck {
    /** Scenario name; defaults to `goal-` and the first goal. */
    readonly name?: string;
    /** The goals compared, without the `minecraft:behavior.` prefix. */
    readonly goals: readonly string[];
    readonly java: string;
    readonly reference: string;
    /** The Java entity ids to run; defaults to every one whose definition declares the first goal. */
    readonly entities?: readonly string[];
    readonly run: (subject: EntitySubject) => ScenarioOutcome;
    readonly classify?: BehaviorScenario<EntitySubject>['classify'];
}

/** The issue tracking each scenario that still differs from Java, which its gap row cites. */
const OPEN_ISSUES: Readonly<Record<string, string>> = {
    ...Object.fromEntries(
        ['holdingpattern', 'strafeplayer', 'chargeplayer', 'takeoff', 'landing', 'scanning', 'flaming'].map((phase) => [
            `goal-dragon${phase}`,
            '#3123'
        ])
    ),
    'brain-charge_held_item': '#3124',
    'goal-owner_hurt_target': '#3125',
    'goal-owner_hurt_by_target': '#3125',
    'goal-defend_trusted_target': '#3125 and #3115',
    'goal-skeleton_horse_trap': '#3126',
    'goal-summon_entity': '#3127',
    'goal-send_event': '#3127',
    'creeper-swell-range': '#3129',
    'goal-random_look_around_and_sit': '#3129 and #3131',
    'goal-random_sitting': '#3129',
    'goal-move_through_village': '#3129',
    'goal-offer_flower': '#3129',
    'goal-move_towards_dwelling_restriction': '#3129',
    'goal-wither_target_highest_damage': '#3129',
    'goal-random_hover': '#3129',
    'goal-swim_up_for_breath': '#3129',
    'goal-find_underwater_treasure': '#3129'
};

/** The issue for every other scenario that still differs: the mob-specific goals with no Java outcome. */
const OUTCOME_ISSUE = '#3131';

const goalScenario = (check: GoalCheck): BehaviorScenario<EntitySubject> => ({
    name: check.name ?? `goal-${check.goals[0]}`,
    java: check.java,
    reference: `${check.reference}; issue ${OPEN_ISSUES[check.name ?? `goal-${check.goals[0]}`] ?? OUTCOME_ISSUE} if it differs`,
    subjects: () => {
        const declaring = check.goals.flatMap((goal) => entitiesDeclaring(behavior(goal)));
        const unique = [...new Map(declaring.map((subject) => [subject.javaId, subject])).values()];
        return check.entities === undefined
            ? unique
            : unique.filter((subject) => check.entities?.includes(subject.javaId) === true);
    },
    idOf: (subject) => subject.javaId,
    aspects: (subject) => check.goals.map(behavior).filter((component) => declares(subject, component)),
    run: check.run,
    ...(check.classify === undefined ? {} : { classify: check.classify })
});

/** Joins the differences a run found, or undefined when there were none. */
const differences = (found: readonly (string | false | undefined)[]): ScenarioOutcome => {
    const listed = found.filter((entry): entry is string => typeof entry === 'string');
    return listed.length === 0 ? undefined : listed.join('; ');
};

/** Runs a probe that keeps only the named goals. */
const probeGoals = <T>(
    subject: EntitySubject,
    goals: readonly string[],
    options: Omit<ProbeOptions, 'keep'>,
    body: (probe: Probe) => T
): T => withProbe(subject.bedrock, { ...options, keep: goals.map(behavior) }, body);

/** How far apart two positions are. */
const distanceBetween = (
    from: { readonly x: number; readonly y: number; readonly z: number },
    to: { readonly x: number; readonly y: number; readonly z: number }
): number => Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);

/** The Bedrock block a Java block id maps to, or undefined when it has none. */
const bedrockBlock = (javaId: string): string | undefined => {
    const mapped = javaBlockStateToBedrock(javaId);
    return mapped.kind === 'mapped' || mapped.kind === 'passthrough' ? mapped.bedrock.name : undefined;
};

/** The Bedrock blocks a Java block tag holds, mapped from its members. */
const bedrockBlocksTagged = (tag: string): readonly string[] =>
    [
        ...new Set(
            serverContent()
                .tags.members('block', tag)
                .flatMap((javaId) => bedrockBlock(javaId) ?? [])
        )
    ].sort();

/** Whether the entity's body faces a position, within 20 degrees. */
const faces = (probe: Probe, position: { readonly x: number; readonly z: number }): boolean => {
    const here = probe.entity.position;
    const wanted = (Math.atan2(position.z - here.z, position.x - here.x) * 180) / Math.PI - 90;
    const off = Math.abs(((((probe.entity.body.yaw - wanted) % 360) + 540) % 360) - 180);
    return off < 20;
};

/** The headings an entity moved along, one per tick it moved, in degrees. */
const headings = (probe: Probe, ticks: number): number[] => {
    const found: number[] = [];
    let last = { ...probe.entity.position };
    for (let tick = 0; tick < ticks; tick += 1) {
        probe.tick();
        const now = probe.entity.position;
        if (Math.hypot(now.x - last.x, now.z - last.z) > 1e-3)
            found.push(Math.round((Math.atan2(now.z - last.z, now.x - last.x) * 180) / Math.PI));
        else found.push(Number.NaN);
        last = { ...now };
    }
    return found;
};

/** Takes every goal off another entity a probe spawned, so it stands still as a prop. */
const still = <
    T extends { readonly instance: { readonly goals: { names(): readonly string[]; remove(name: string): void } } }
>(
    entity: T
): T => {
    for (const name of entity.instance.goals.names()) entity.instance.goals.remove(name);
    return entity;
};

/** The entity's current health. */
const healthOf = (probe: Probe): number => probe.entity.instance.attributes.get('health')?.current ?? 0;

/** Whether the entity has a status effect, by its name without a namespace. */
const hasEffect = (probe: Probe, effect: string): boolean =>
    [...probe.entity.body.statusEffects.keys()].some((key) => key.replace('minecraft:', '') === effect);

/** Runs a probe for some ticks and reports how far the entity moved from where it started. */
const movedOver = (probe: Probe, ticks: number): number => {
    const start = { ...probe.entity.position };
    probe.tick(ticks);
    return distanceBetween(start, probe.entity.position);
};

/** The blows the host dealt to one player. */
const hitsOn = (probe: Probe, player: number) => probe.world.hits.filter((hit) => hit.id === player);

/**
 * What Java runs for a Bedrock goal on a mob that has a brain: the Java behavior classes, by the
 * name the brain's activity table reads out, or an empty list where Java has no counterpart and
 * the mob must not do what the Bedrock goal does.
 */
type BrainCounterpart = readonly [goal: string, behaviors: readonly string[], reference: string];

const VILLAGER_PACKAGES = 'Java VillagerGoalPackages';

/** The Bedrock goals each brain mob declares, against the Java brain behaviors that do that job. */
const BRAIN_COUNTERPARTS: Readonly<Record<string, readonly BrainCounterpart[]>> = {
    'minecraft:villager': [
        ['celebrate_survive', ['CelebrateVillagersSurvivedRaid'], `${VILLAGER_PACKAGES}.getRaidPackage`],
        ['explore_outskirts', ['RandomStroll'], `${VILLAGER_PACKAGES}.getIdlePackage (RandomStroll.stroll)`],
        ['fertilize_farm_block', ['UseBonemeal'], `${VILLAGER_PACKAGES}.getWorkPackage (farmer: UseBonemeal)`],
        ['harvest_farm_block', ['HarvestFarmland'], `${VILLAGER_PACKAGES}.getWorkPackage (farmer: HarvestFarmland)`],
        ['hide', ['LocateHidingPlace', 'SetHiddenState'], `${VILLAGER_PACKAGES}.getHidePackage`],
        ['inspect_bookshelf', [], 'Java VillagerGoalPackages, which gives a librarian no bookshelf behavior'],
        ['look_at_trading_player', ['LookAndFollowTradingPlayerSink'], `${VILLAGER_PACKAGES}.getCorePackage`],
        ['make_love', ['VillagerMakeLove'], `${VILLAGER_PACKAGES}.getIdlePackage`],
        ['receive_love', ['VillagerMakeLove'], `${VILLAGER_PACKAGES}.getIdlePackage`],
        ['mingle', ['SetWalkTargetFromBlockMemory', 'SetLookAndInteract'], `${VILLAGER_PACKAGES}.getMeetPackage`],
        ['move_indoors', ['SetClosestHomeAsWalkTarget'], `${VILLAGER_PACKAGES}.getRestPackage`],
        ['move_outdoors', ['MoveToSkySeeingSpot'], `${VILLAGER_PACKAGES}.getRaidPackage`],
        ['move_towards_dwelling_restriction', ['GoToClosestVillage'], `${VILLAGER_PACKAGES}.getRestPackage`],
        ['play', ['PlayTagWithOtherKids'], `${VILLAGER_PACKAGES}.getPlayPackage`],
        ['share_items', ['TradeWithVillager'], `${VILLAGER_PACKAGES}.getIdlePackage and getMeetPackage`],
        ['sleep', ['SleepInBed'], `${VILLAGER_PACKAGES}.getRestPackage`],
        ['take_flower', [], 'Java VillagerGoalPackages, which gives a baby villager no flower behavior'],
        [
            'trade_interest',
            ['ShowTradesToPlayer'],
            `${VILLAGER_PACKAGES}.getWorkPackage, getMeetPackage and getIdlePackage`
        ],
        [
            'trade_with_player',
            ['LookAndFollowTradingPlayerSink'],
            `${VILLAGER_PACKAGES}.getCorePackage and Villager.startTrading`
        ],
        ['work', ['WorkAtPoi'], `${VILLAGER_PACKAGES}.getWorkPackage`],
        ['work_composter', ['WorkAtPoi'], `${VILLAGER_PACKAGES}.getWorkPackage (WorkAtComposter for a farmer)`]
    ],
    'minecraft:warden': [
        ['dig', ['Digging'], 'Java WardenAi.initDigActivity'],
        ['emerge', ['Emerging'], 'Java WardenAi.initEmergeActivity'],
        ['investigate_suspicious_location', ['GoToTargetLocation'], 'Java WardenAi.initInvestigateActivity'],
        ['roar', ['Roar'], 'Java WardenAi.initRoarActivity'],
        ['sniff', ['Sniffing'], 'Java WardenAi.initSniffingActivity'],
        ['sonic_boom', ['SonicBoom'], 'Java WardenAi.initFightActivity']
    ],
    'minecraft:sniffer': [
        [
            'random_search_and_dig',
            ['Searching', 'Digging', 'FinishedDigging'],
            'Java SnifferAi.initSniffingActivity and initDigActivity'
        ],
        ['timer_flag_2', ['FinishedDigging'], 'Java SnifferAi.FinishedDigging (the rising pose after a dig)'],
        ['timer_flag_3', ['FeelingHappy'], 'Java SnifferAi.FeelingHappy']
    ],
    'minecraft:allay': [
        ['random_hover', ['RandomStroll'], 'Java AllayAi.initIdleActivity (RandomStroll.fly)'],
        ['go_and_give_items_to_noteblock', ['GoAndGiveItemsToTarget'], 'Java AllayAi.initIdleActivity'],
        ['go_and_give_items_to_owner', ['GoAndGiveItemsToTarget'], 'Java AllayAi.initIdleActivity'],
        ['stay_near_noteblock', ['StayCloseToTarget'], 'Java AllayAi.initIdleActivity']
    ],
    'minecraft:frog': [
        ['croak', ['Croak'], 'Java FrogAi.initIdleActivity'],
        ['eat_mob', ['ShootTongue'], 'Java FrogAi.initTongueActivity'],
        ['jump_to_block', ['LongJumpToPreferredBlock'], 'Java FrogAi.initJumpActivity'],
        ['lay_egg', ['TryLaySpawnOnFluidNearLand'], 'Java FrogAi.initLaySpawnActivity'],
        ['move_to_land', ['TryFindLand'], 'Java FrogAi.initIdleActivity and initSwimActivity']
    ],
    'minecraft:goat': [
        ['jump_to_block', ['LongJumpToRandomPos'], 'Java GoatAi.initLongJumpActivity'],
        ['ram_attack', ['PrepareRamNearestTarget', 'RamTarget'], 'Java GoatAi.initRamActivity']
    ],
    'minecraft:piglin': [
        [
            'admire_item',
            ['StartAdmiringItemIfSeen', 'GoToWantedItem'],
            'Java PiglinAi.initCoreActivity and initAdmireItemActivity'
        ],
        [
            'barter',
            ['StopHoldingItemIfNoLongerAdmiring'],
            'Java PiglinAi.initCoreActivity (stopHoldingMainHandItem throws the barter loot)'
        ],
        ['avoid_block', ['SetWalkTargetAwayFrom'], 'Java PiglinAi.initRetreatActivity (repellent soul fire)'],
        ['charge_held_item', ['CrossbowAttack'], 'Java PiglinAi.initFightActivity (new CrossbowAttack())']
    ],
    'minecraft:piglin_brute': [
        ['go_home', ['StrollToPoi'], 'Java PiglinBruteAi.initIdleActivity (StrollToPoi HOME)'],
        [
            'nearest_prioritized_attackable_target',
            ['StartAttacking'],
            'Java PiglinBruteAi.initIdleActivity and findNearestValidAttackTarget'
        ]
    ],
    'minecraft:hoglin': [
        ['avoid_block', ['SetWalkTargetAwayFrom'], 'Java HoglinAi.initRetreatActivity (repellent warped fungus)']
    ],
    'minecraft:breeze': [
        ['fire_at_target', ['Shoot'], 'Java BreezeAi.initFightActivity'],
        ['jump_around_target', ['LongJump'], 'Java BreezeAi.initFightActivity'],
        ['move_around_target', ['Slide'], 'Java BreezeAi.initFightActivity']
    ],
    'minecraft:nautilus': [['aquatic_charge_attack', ['ChargeAttack'], 'Java NautilusAi.initFightActivity']],
    'minecraft:zombie_nautilus': [
        ['aquatic_charge_attack', ['ChargeAttack'], 'Java ZombieNautilusAi.initFightActivity']
    ],
    'minecraft:axolotl': [['play_dead', ['PlayDead'], 'Java AxolotlAi.initPlayDeadActivity']],
    'minecraft:copper_golem': [
        ['transport_items', ['TransportItemsBetweenContainers'], 'Java CopperGolemAi.initIdleActivity'],
        ['take_flower', [], 'Java CopperGolemAi, which has no flower behavior']
    ],
    'minecraft:camel': [
        ['random_look_around_and_sit', ['RandomLookAround', 'RandomSitting'], 'Java CamelAi.initIdleActivity']
    ]
};

/**
 * Each brain mob's Bedrock goals against its Java brain: the server leaves the Bedrock goal off
 * and runs a brain whose activity table holds the behavior Java runs for that job.
 */
const brainScenarios = (): readonly BehaviorScenario<EntitySubject>[] =>
    Object.entries(BRAIN_COUNTERPARTS).flatMap(([javaId, counterparts]) =>
        counterparts.map(([goal, behaviors, reference]) =>
            goalScenario({
                goals: [goal],
                name: `brain-${goal}`,
                java:
                    behaviors.length === 0
                        ? `Java's brain has no counterpart of ${behavior(goal)}, so the mob never does what it does.`
                        : `Java runs ${behaviors.join(' and ')} from the mob's brain for what ${behavior(goal)} does.`,
                reference,
                entities: [javaId],
                run: (subject) =>
                    withProbe(subject.bedrock, {}, (probe) => {
                        const { entity } = probe;
                        const brain = goal === 'play' ? entity.brainMob?.makeBrain({ baby: true }) : entity.brain;
                        if (brain === undefined) return 'the server runs no Java brain for it';
                        const dual = entity.brainMob?.alsoRunsGoals === true;
                        const names = brain.activities.flatMap((activity) => brain.behaviorNames(activity));
                        const missing = behaviors.filter((wanted) => !names.some((name) => name.includes(wanted)));
                        return differences([
                            !dual && entity.runsGoals && `it runs Bedrock's ${behavior(goal)} beside its brain`,
                            missing.length > 0 && `its brain runs no ${missing.join(' or ')}`
                        ]);
                    })
            })
        )
    );

/** Every mob-specific goal scenario. */
export const mobGoalScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    ...brainScenarios(),
    goalScenario({
        goals: ['swell', 'melee_attack'],
        name: 'creeper-swell',
        java: 'A creeper walks to its target, starts swelling once it is within 3 blocks, explodes 30 ticks later, and never lands a melee blow.',
        reference:
            'Java Creeper.registerGoals (SwellGoal at 2, MeleeAttackGoal at 4), SwellGoal.canUse (distance squared < 9) and Creeper.tick (maxSwell 30)',
        run: (subject) =>
            probeGoals(subject, ['swell', 'melee_attack'], {}, (probe) => {
                const player = probe.player(6, 0, 0);
                probe.entity.target = player;
                const exploded = probe.until(() => probe.entity.removed !== undefined, 200);
                const closest = distanceBetween(probe.entity.position, probe.at(6, 0, 0));
                return differences([
                    exploded === undefined && 'it never exploded within 200 ticks of having a target 6 blocks away',
                    probe.entity.removed !== undefined &&
                        probe.entity.removed !== 'explosion' &&
                        `it was removed for ${probe.entity.removed}, not an explosion`,
                    closest > 3 && `it exploded ${closest.toFixed(2)} blocks from its target, beyond Java's 3`,
                    hitsOn(probe, player).some((hit) => hit.cause === 'entity_attack') &&
                        'it landed a melee blow, which a Java creeper never does'
                ]);
            })
    }),
    goalScenario({
        goals: ['swell'],
        name: 'creeper-swell-range',
        java: 'A creeper whose target stands still 2.75 blocks away swells and explodes; Java starts the swell inside 3 blocks.',
        reference: 'Java SwellGoal.canUse (distanceToSqr < 9) and Creeper.tick (maxSwell 30)',
        run: (subject) =>
            probeGoals(subject, ['swell'], {}, (probe) => {
                probe.entity.target = probe.player(2.75, 0, 0);
                const exploded = probe.until(() => probe.entity.removed !== undefined, 80);
                return exploded === undefined
                    ? 'it did not swell with its target 2.75 blocks away, which Java does'
                    : exploded > 32
                      ? `it exploded ${exploded} ticks after the target came within range, where Java takes 30`
                      : undefined;
            })
    }),
    goalScenario({
        goals: ['slime_keep_on_jumping', 'slime_random_direction'],
        name: 'slime-wander',
        java: 'A slime with no target hops along a heading it keeps for 40 to 99 ticks before drawing a new one.',
        reference:
            'Java Slime.SlimeKeepOnJumpingGoal (setWantedMovement 1.0 every tick) and Slime.SlimeRandomDirectionGoal (40 + nextInt(60) ticks, nextInt(360) degrees)',
        run: (subject) =>
            probeGoals(
                subject,
                ['slime_keep_on_jumping', 'slime_random_direction'],
                { random: [0.13, 0.71, 0.42, 0.9, 0.05, 0.58] },
                (probe) => {
                    const start = { ...probe.entity.position };
                    const moves = headings(probe, 600);
                    const changes: number[] = [];
                    let current: number | undefined;
                    for (const [tick, heading] of moves.entries()) {
                        if (Number.isNaN(heading)) continue;
                        if (current !== undefined && Math.abs(heading - current) > 5) changes.push(tick);
                        current = heading;
                    }
                    const traveled = distanceBetween(start, probe.entity.position);
                    return differences([
                        traveled < 1 && `it moved ${traveled.toFixed(2)} blocks in 600 ticks of hopping`,
                        changes.length < 2 &&
                            `it changed heading ${changes.length} times in 600 ticks, where Java turns every 40 to 99`
                    ]);
                }
            )
    }),
    goalScenario({
        goals: ['slime_float'],
        java: 'A slime in water jumps to stay afloat, with a 0.8 chance each tick.',
        reference: 'Java Slime.SlimeFloatGoal.tick (random.nextFloat() < 0.8F, then jump)',
        run: (subject) =>
            probeGoals(subject, ['slime_float'], { random: [0.5] }, (probe) => {
                probe.entity.body.conditions.add('in_water');
                const before = probe.entity.position.y;
                let rose = false;
                for (let tick = 0; tick < 20; tick += 1) {
                    probe.entity.body.conditions.add('in_water');
                    probe.tick();
                    if (probe.entity.position.y > before + 0.1 || probe.entity.body.velocity.y > 0) rose = true;
                }
                return rose ? undefined : 'it never jumped in water';
            })
    }),
    goalScenario({
        goals: ['slime_attack'],
        java: 'A cube that touches its target hurts it for its attack damage, except a size 1 slime, which deals none.',
        reference:
            'Java Slime.isDealsDamage (size > 1), MagmaCube.isDealsDamage (always), Slime.dealDamage and Slime.setSize (attack damage = size, magma cube + 2)',
        run: (subject) =>
            ['minecraft:slime_small', 'minecraft:slime_large']
                .flatMap((group) => {
                    const sized = (name: string): boolean => /^minecraft:slime_(small|medium|large)$/.test(name);
                    const found = probeGoals(
                        subject,
                        ['slime_attack'],
                        { groups: [group], without: sized },
                        (probe) => {
                            const player = probe.player(0.5, 0, 0);
                            probe.entity.target = player;
                            probe.tick(40);
                            const hits = hitsOn(probe, player).filter((hit) => hit.amount > 0);
                            const small = group === 'minecraft:slime_small';
                            const deals = !(small && subject.javaId === 'minecraft:slime');
                            const java = subject.javaId === 'minecraft:slime' ? (small ? 1 : 4) : (small ? 1 : 4) + 2;
                            if (!deals)
                                return hits.length > 0
                                    ? `a small slime hurt its target for ${hits[0]?.amount}`
                                    : undefined;
                            if (hits.length === 0)
                                return `a ${group.replace('minecraft:slime_', '')} cube never hurt its target`;
                            const amount = hits[0]?.amount ?? 0;
                            return amount === java
                                ? undefined
                                : `a ${group.replace('minecraft:slime_', '')} cube hits for ${amount}, where Java deals ${java}`;
                        }
                    );
                    return found === undefined ? [] : [found];
                })
                .join('; ') || undefined
    }),
    goalScenario({
        goals: ['guardian_attack'],
        java: 'A guardian locks its beam for 10 ticks and then charges it for 80 (an elder guardian 60), then hurts the target for its melee damage (the 1 magic damage it deals first, 3 for the elder, falls inside the same grace period) and drops its target.',
        reference:
            'Java Guardian.GuardianAttackGoal (attackTime from -10, getAttackDuration 80, ElderGuardian 60; indirectMagic 1 + 2 for the elder, then mobAttack at ATTACK_DAMAGE, which LivingEntity.hurtServer counts only past the first blow) and Guardian.createAttributes (6), ElderGuardian.createAttributes (8)',
        run: (subject) =>
            probeGoals(subject, ['guardian_attack'], {}, (probe) => {
                const player = probe.player(6, 0, 0);
                probe.entity.target = player;
                const first = probe.until(() => hitsOn(probe, player).length > 0, 200);
                probe.tick(2);
                const elder = subject.javaId === 'minecraft:elder_guardian';
                const javaTicks = elder ? 70 : 90;
                const javaDamage = elder ? 8 : 6;
                const total = hitsOn(probe, player).reduce((sum, hit) => sum + hit.amount, 0);
                return differences([
                    first === undefined && 'the beam never hurt its target',
                    first !== undefined &&
                        Math.abs(first - javaTicks) > 1 &&
                        `the beam first hurt its target after ${first} ticks, where Java takes ${javaTicks}`,
                    first !== undefined &&
                        total !== javaDamage &&
                        `the beam dealt ${total}, where Java deals ${javaDamage}`,
                    first !== undefined && probe.entity.target !== undefined && 'it kept its target after the beam hit'
                ]);
            })
    }),
    goalScenario({
        goals: ['silverfish_merge_with_stone'],
        java: 'A silverfish with no target hides in a neighboring block that can host it (stone, cobblestone, the stone bricks or deepslate), turning it into the infested block and disappearing.',
        reference:
            'Java Silverfish.SilverfishMergeWithStoneGoal and InfestedBlock.isCompatibleHostBlock (stone, cobblestone, stone_bricks, mossy, cracked and chiseled stone bricks, deepslate)',
        run: (subject) =>
            ['minecraft:stone', 'minecraft:cobblestone', 'minecraft:stone_bricks', 'minecraft:deepslate']
                .flatMap((host) =>
                    probeGoals(subject, ['silverfish_merge_with_stone'], { random: [0.01] }, (probe) => {
                        for (const [x, y, z] of [
                            [1, 0, 0],
                            [-1, 0, 0],
                            [0, 0, 1],
                            [0, 0, -1],
                            [0, 1, 0],
                            [0, -1, 0]
                        ] as const)
                            probe.block(x, y, z, host);
                        probe.tick(100);
                        const infested = [
                            probe.blockAt(1, 0, 0),
                            probe.blockAt(-1, 0, 0),
                            probe.blockAt(0, 0, 1),
                            probe.blockAt(0, 0, -1),
                            probe.blockAt(0, 1, 0),
                            probe.blockAt(0, -1, 0)
                        ].filter((block) => block?.includes('infested') === true);
                        if (infested.length === 0 || probe.entity.removed === undefined)
                            return [`it did not hide in ${host}`];
                        return infested.length === 1 ? [] : [`it infested ${infested.length} blocks of ${host}`];
                    })
                )
                .join('; ') || undefined
    }),
    goalScenario({
        goals: ['silverfish_wake_up_friends'],
        java: 'A silverfish hurt by an attacker waits 20 ticks, then breaks the infested blocks within 10 blocks across and 5 up or down, each releasing a silverfish.',
        reference:
            'Java Silverfish.SilverfishWakeUpFriendsGoal (notifyHurt sets lookForFriends to adjustedTickDelay(20); tick scans x and z within 10, y within 5) and InfestedBlock.spawnInfestation',
        run: (subject) =>
            probeGoals(subject, ['silverfish_wake_up_friends'], { groups: ['minecraft:silverfish_angry'] }, (probe) => {
                probe.block(3, 0, 0, 'minecraft:infested_stone');
                probe.block(0, 4, 3, 'minecraft:infested_stone');
                const player = probe.player(2, 0, 2);
                probe.runtime.hurt(probe.entity, player, 'entity_attack', 1);
                const broke = probe.until(() => probe.blockAt(3, 0, 0) !== 'minecraft:infested_stone', 60);
                const released = probe.runtime.countOfType('minecraft:silverfish', probe.at(3, 0, 0), 4);
                return differences([
                    broke === undefined && 'no infested block broke within 60 ticks of the blow',
                    broke !== undefined &&
                        broke < 20 &&
                        `the first infested block broke ${broke} ticks after the blow, where Java waits 20`,
                    broke !== undefined && released < 2 && 'breaking the infested block released no silverfish'
                ]);
            })
    }),
    goalScenario({
        goals: ['take_block'],
        name: 'enderman-take-block',
        java: "An enderman picks up any block in Java's enderman_holdable tag, and no other block.",
        reference: 'Java EnderMan.EndermanTakeBlockGoal and the minecraft:enderman_holdable block tag',
        run: (subject) => {
            const java = new Set(bedrockBlocksTagged('minecraft:enderman_holdable'));
            const taken = new Set<string>();
            for (const block of [...java, 'minecraft:stone', 'minecraft:oak_log']) {
                const took = probeGoals(subject, ['take_block'], { random: [0.01] }, (probe) => {
                    for (let x = -2; x <= 2; x += 1)
                        for (let z = -2; z <= 2; z += 1)
                            for (let y = 0; y <= 3; y += 1) if (x !== 0 || z !== 0) probe.block(x, y, z, block);
                    probe.tick(40);
                    return (
                        probe.entity.carried !== undefined ||
                        probe.entity.instance.hasComponent('minecraft:is_carrying_block')
                    );
                });
                if (took) taken.add(block);
            }
            const missing = [...java].filter((block) => !taken.has(block));
            const extra = [...taken].filter((block) => !java.has(block));
            return differences([
                missing.length > 0 && `it never picks up ${missing.join(', ')}`,
                extra.length > 0 && `it picks up ${extra.join(', ')}, which Java's tag leaves out`
            ]);
        }
    }),
    goalScenario({
        goals: ['eat_block'],
        java: "A sheep eats a block in Java's edible_for_sheep tag at its feet, leaving air, or the grass block under it, leaving dirt.",
        reference:
            'Java EatBlockGoal (IS_EDIBLE: the minecraft:edible_for_sheep tag; grass_block below becomes dirt) and Sheep.ate',
        run: (subject) => {
            const found: string[] = [];
            for (const food of bedrockBlocksTagged('minecraft:edible_for_sheep')) {
                const left = probeGoals(subject, ['eat_block'], { random: [0.0001] }, (probe) => {
                    probe.block(0, 0, 0, food);
                    probe.tick(80);
                    return probe.blockAt(0, 0, 0);
                });
                if (left !== 'minecraft:air') found.push(`it left ${food} at its feet as ${left}`);
            }
            const below = probeGoals(subject, ['eat_block'], { random: [0.0001] }, (probe) => {
                probe.block(0, -1, 0, 'minecraft:grass_block');
                probe.tick(80);
                return probe.blockAt(0, -1, 0);
            });
            if (below !== 'minecraft:dirt') found.push(`the grass block under it became ${below}, not dirt`);
            return differences(found);
        }
    }),
    goalScenario({
        goals: ['skeleton_horse_trap'],
        java: 'A trap skeleton horse that a player comes within 10 blocks of becomes a tamed horse ridden by a skeleton and calls three more skeleton horsemen.',
        reference:
            'Java SkeletonTrapGoal.canUse (hasNearbyAlivePlayer within 10) and tick (createHorse and createSkeleton for the trap horse and three more)',
        run: (subject) =>
            probeGoals(subject, ['skeleton_horse_trap'], { groups: ['minecraft:skeleton_trap'] }, (probe) => {
                probe.player(6, 0, 0);
                probe.tick(20);
                const horses = probe.runtime.countOfType('minecraft:skeleton_horse', probe.at(0, 0, 0), 12);
                const skeletons = probe.runtime.countOfType('minecraft:skeleton', probe.at(0, 0, 0), 12);
                for (const other of probe.runtime.near(probe.at(0, 0, 0), 12))
                    if (other.id !== probe.entity.id) probe.runtime.remove(other.id, 'parity probe');
                return horses === 4 && skeletons === 4
                    ? undefined
                    : `springing the trap left ${horses} skeleton horses and ${skeletons} skeletons, where Java has 4 of each`;
            })
    }),
    goalScenario({
        goals: ['look_at_target'],
        java: 'A wither with a target turns to face it.',
        reference:
            'Java WitherBoss.registerGoals (RangedAttackGoal, which sets the look control on the target every tick)',
        run: (subject) =>
            probeGoals(subject, ['look_at_target'], { random: [0.001] }, (probe) => {
                const player = probe.player(0, 0, 8);
                probe.entity.target = player;
                probe.tick(40);
                return faces(probe, probe.at(0, 0, 8))
                    ? undefined
                    : `it faces ${probe.entity.body.yaw.toFixed(0)} degrees, away from its target`;
            })
    }),
    goalScenario({
        goals: ['wither_random_attack_pos_goal'],
        java: 'A wither with a target flies toward it until it is within 3 blocks across, staying above it.',
        reference:
            'Java WitherBoss.aiStep (horizontal approach while horizontalDistanceSqr > 9, climb while below target y + 5)',
        run: (subject) =>
            probeGoals(subject, ['wither_random_attack_pos_goal'], {}, (probe) => {
                const player = probe.player(16, 0, 0);
                probe.entity.target = player;
                probe.tick(200);
                const here = probe.entity.position;
                const across = Math.hypot(here.x - probe.at(16, 0, 0).x, here.z - probe.at(16, 0, 0).z);
                return differences([
                    across > 4 &&
                        `after 200 ticks it is ${across.toFixed(1)} blocks across from its target, where Java closes to 3`,
                    here.y < probe.at(0, 0, 0).y + 2 && `it stays at y ${here.y.toFixed(1)}, not above its target`
                ]);
            })
    }),
    goalScenario({
        goals: ['wither_target_highest_damage'],
        java: 'A wither turns on whoever hurt it last.',
        reference:
            'Java WitherBoss.registerGoals (HurtByTargetGoal at target priority 1), which targets getLastHurtByMob',
        run: (subject) =>
            probeGoals(subject, ['wither_target_highest_damage'], {}, (probe) => {
                const heavy = probe.player(6, 0, 0);
                const light = probe.player(-6, 0, 0);
                probe.runtime.hurt(probe.entity, heavy, 'entity_attack', 20);
                probe.tick(5);
                probe.runtime.hurt(probe.entity, light, 'entity_attack', 2);
                probe.tick(5);
                return probe.entity.target === light
                    ? undefined
                    : probe.entity.target === heavy
                      ? 'it targets the attacker that dealt the most damage, where Java targets the last attacker'
                      : 'it targets neither attacker';
            })
    }),
    goalScenario({
        goals: ['summon_entity'],
        java: 'An evoker with a target summons three vexes, then casts fangs: thirteen in two rings when the target is within 3 blocks, sixteen in a line otherwise.',
        reference:
            'Java Evoker.EvokerSummonSpellGoal (3 vexes, priority 4) and Evoker.EvokerAttackSpellGoal (5 + 8 fangs within distanceToSqr 9, otherwise 16 in a line)',
        run: (subject) =>
            probeGoals(subject, ['summon_entity'], {}, (probe) => {
                const player = probe.player(8, 0, 0);
                probe.entity.target = player;
                probe.tick(300);
                const vexes = probe.runtime.countOfType('minecraft:vex', probe.at(0, 0, 0), 16);
                const fangs = probe.runtime.countOfType('minecraft:evocation_fang', probe.at(0, 0, 0), 20);
                for (const other of probe.runtime.near(probe.at(0, 0, 0), 24))
                    if (other.id !== probe.entity.id) probe.runtime.remove(other.id, 'parity probe');
                return differences([
                    vexes !== 3 && `it summoned ${vexes} vexes, where Java's first spell summons 3`,
                    fangs === 0 && 'it cast no fangs at a target 8 blocks away'
                ]);
            })
    }),
    goalScenario({
        goals: ['send_event'],
        java: 'An evoker with no target turns a blue sheep within 16 blocks red.',
        reference: 'Java Evoker.EvokerWololoSpellGoal (blue sheep within 16, setColor(DyeColor.RED))',
        run: (subject) =>
            probeGoals(subject, ['send_event'], {}, (probe) => {
                const sheep = probe.spawn('minecraft:sheep', 5, 0, 0);
                sheep.instance.restoreComponentGroups([
                    ...sheep.instance
                        .activeComponentGroups()
                        .filter(
                            (group: string) =>
                                !group.startsWith('minecraft:sheep_') ||
                                group === 'minecraft:sheep_adult' ||
                                group === 'minecraft:sheep_dyeable'
                        ),
                    'minecraft:sheep_blue'
                ]);
                for (const name of sheep.instance.goals.names()) sheep.instance.goals.remove(name);
                const turned = probe.until(
                    () => sheep.instance.activeComponentGroups().includes('minecraft:sheep_red'),
                    300
                );
                return turned === undefined ? 'the blue sheep was not turned red within 300 ticks' : undefined;
            })
    }),
    goalScenario({
        goals: ['look_at_entity'],
        java: 'An evoker, vex or ravager looks at a mob within 8 blocks.',
        reference:
            'Java Evoker, Vex and Ravager.registerGoals (LookAtPlayerGoal(this, Mob.class, 8.0F)), with LookAtPlayerGoal.DEFAULT_PROBABILITY 0.02',
        run: (subject) =>
            [3, 7.5]
                .flatMap((away) =>
                    probeGoals(subject, ['look_at_entity'], { random: [0.001] }, (probe) => {
                        const cow = probe.spawn('minecraft:cow', 0, 0, away);
                        for (const name of cow.instance.goals.names()) cow.instance.goals.remove(name);
                        probe.tick(20);
                        return faces(probe, cow.position) ? [] : [`it does not look at a mob ${away} blocks away`];
                    })
                )
                .join('; ') || undefined
    }),
    goalScenario({
        goals: ['charge_attack'],
        java: 'A vex with a target charges at it and hurts it on contact.',
        reference:
            'Java Vex.VexChargeAttackGoal (charges when target within distanceToSqr 4096 with 1 in 7 chance, doHurtTarget on bounding box contact)',
        run: (subject) =>
            probeGoals(subject, ['charge_attack'], { random: [0.01] }, (probe) => {
                const player = probe.player(6, 0, 0);
                probe.entity.target = player;
                const hit = probe.until(() => hitsOn(probe, player).length > 0, 200);
                return hit === undefined ? 'it never hurt its target within 200 ticks' : undefined;
            })
    }),
    goalScenario({
        goals: ['delayed_attack'],
        java: 'A ravager walks to its target and bites it for its 12 attack damage.',
        reference:
            'Java Ravager.RavagerMeleeAttackGoal (MeleeAttackGoal at speed 1.0) and Ravager.createAttributes (ATTACK_DAMAGE 12)',
        run: (subject) =>
            probeGoals(subject, ['delayed_attack'], { groups: ['minecraft:hostile'] }, (probe) => {
                const player = probe.player(6, 0, 0);
                probe.entity.target = player;
                const hit = probe.until(() => hitsOn(probe, player).length > 0, 200);
                const amount = hitsOn(probe, player)[0]?.amount;
                return hit === undefined
                    ? 'it never bit its target within 200 ticks'
                    : amount === 12
                      ? undefined
                      : `its bite deals ${amount}, where Java deals 12`;
            })
    }),
    goalScenario({
        goals: ['knockback_roar'],
        java: 'A roaring ravager hurts every non-illager within 4 blocks for 6 and throws them back.',
        reference:
            'Java Ravager.roar (inflate(4.0) box, hurt 6.0F for non-illagers, strongKnockback) and Ravager.aiStep (roarTick from 20, roar at 10)',
        run: (subject) =>
            probeGoals(subject, ['knockback_roar'], { groups: ['minecraft:hostile', 'roaring'] }, (probe) => {
                const player = probe.player(2, 0, 0);
                probe.entity.target = player;
                probe.tick(30);
                const hits = hitsOn(probe, player);
                return hits.length === 0
                    ? 'its roar did not hurt a player 2 blocks away'
                    : hits[0]?.amount === 6
                      ? undefined
                      : `its roar dealt ${hits[0]?.amount}, where Java deals 6`;
            })
    }),
    goalScenario({
        goals: ['stomp_attack'],
        java: 'A hostile polar bear walks to its target and hits it for its 6 attack damage.',
        reference:
            'Java PolarBear.PolarBearMeleeAttackGoal (MeleeAttackGoal speed 1.25, stand-up warning at 2x reach) and PolarBear.createAttributes (ATTACK_DAMAGE 6)',
        run: (subject) =>
            probeGoals(subject, ['stomp_attack'], { groups: ['minecraft:adult_hostile'] }, (probe) => {
                const player = probe.player(6, 0, 0);
                probe.entity.target = player;
                const hit = probe.until(() => hitsOn(probe, player).length > 0, 200);
                const amount = hitsOn(probe, player)[0]?.amount;
                return hit === undefined
                    ? 'it never hit its target within 200 ticks'
                    : amount === 6
                      ? undefined
                      : `its hit deals ${amount}, where Java deals 6`;
            })
    }),
    goalScenario({
        goals: ['swoop_attack', 'circle_around_anchor'],
        name: 'phantom-swoop',
        java: 'A phantom circles above its target and swoops down to bite it for 6 damage.',
        reference:
            'Java Phantom.PhantomCircleAroundAnchorGoal, Phantom.PhantomSweepAttackGoal (doHurtTarget on contact) and Phantom.updatePhantomSizeInfo (ATTACK_DAMAGE 6 + size)',
        run: (subject) =>
            probeGoals(subject, ['swoop_attack', 'circle_around_anchor'], {}, (probe) => {
                const player = probe.player(4, 0, 0);
                probe.entity.target = player;
                probe.entity.position = probe.at(0, 12, 0);
                const hit = probe.until(() => hitsOn(probe, player).length > 0, 600);
                const amount = hitsOn(probe, player)[0]?.amount;
                return hit === undefined
                    ? 'it never bit its target within 600 ticks'
                    : amount === 6
                      ? undefined
                      : `its bite deals ${amount}, where Java deals 6`;
            })
    }),
    goalScenario({
        goals: ['beg'],
        java: 'A wolf looks at a player within 8 blocks who holds a bone.',
        reference:
            'Java Wolf.registerGoals (BegGoal(this, 8.0F)) and BegGoal.playerHoldingInteresting (a bone for an untamed wolf)',
        run: (subject) =>
            probeGoals(subject, ['beg'], { random: [0.001] }, (probe) => {
                const player = probe.player(0, 0, 5);
                probe.world.held.set(player, 'minecraft:bone');
                probe.tick(20);
                return faces(probe, probe.at(0, 0, 5))
                    ? undefined
                    : 'it does not look at a player holding a bone 5 blocks away';
            })
    }),
    goalScenario({
        goals: ['owner_hurt_target'],
        java: 'A tame wolf attacks the mob its owner last hurt.',
        reference: 'Java OwnerHurtTargetGoal (owner.getLastHurtMob)',
        run: (subject) =>
            probeGoals(subject, ['owner_hurt_target'], { groups: ['minecraft:wolf_tame'] }, (probe) => {
                const owner = probe.player(2, 0, 0);
                probe.runtime.setOwner(probe.entity.id, owner);
                const cow = probe.spawn('minecraft:cow', 4, 0, 0);
                probe.runtime.hurt(cow, owner, 'entity_attack', 1);
                probe.tick(5);
                return probe.entity.target === cow.id ? undefined : 'it did not target the mob its owner hurt';
            })
    }),
    goalScenario({
        goals: ['owner_hurt_by_target'],
        java: 'A tame wolf attacks the mob that last hurt its owner.',
        reference: 'Java OwnerHurtByTargetGoal (owner.getLastHurtByMob)',
        run: (subject) =>
            probeGoals(subject, ['owner_hurt_by_target'], { groups: ['minecraft:wolf_tame'] }, (probe) => {
                const owner = probe.player(2, 0, 0);
                probe.runtime.setOwner(probe.entity.id, owner);
                const zombie = probe.spawn('minecraft:zombie', 3, 0, 0);
                const ownerMob = probe.runtime.mobById(owner);
                if (ownerMob !== undefined) probe.runtime.attack(zombie.body, ownerMob);
                probe.tick(5);
                return probe.entity.target === zombie.id ? undefined : 'it did not target the mob that hurt its owner';
            })
    }),
    goalScenario({
        goals: ['target_when_pushed'],
        java: 'An iron golem that a monster other than a creeper pushes targets it one push in 20.',
        reference: 'Java IronGolem.doPush (Enemy and not Creeper, random.nextInt(20) == 0, setTarget)',
        run: (subject) =>
            ['minecraft:zombie', 'minecraft:creeper']
                .flatMap((pusher) =>
                    probeGoals(subject, ['target_when_pushed'], { random: [0.01] }, (probe) => {
                        const other = probe.spawn(pusher, 0.5, 0, 0);
                        for (const name of other.instance.goals.names()) other.instance.goals.remove(name);
                        probe.entity.body.lastPusher = other.id;
                        probe.tick(5);
                        const targeted = probe.entity.target === other.id;
                        if (pusher === 'minecraft:zombie' && !targeted) return ['a pushing zombie was not targeted'];
                        if (pusher === 'minecraft:creeper' && targeted) return ['a pushing creeper was targeted'];
                        return [];
                    })
                )
                .join('; ') || undefined
    }),
    goalScenario({
        goals: ['move_towards_target'],
        java: 'An iron golem walks toward a target within 32 blocks, and ignores one farther away.',
        reference: 'Java IronGolem.registerGoals (MoveTowardsTargetGoal(this, 0.9, 32.0F))',
        run: (subject) =>
            [20, 40]
                .flatMap((away) =>
                    probeGoals(subject, ['move_towards_target'], {}, (probe) => {
                        const player = probe.player(away, 0, 0);
                        probe.entity.target = player;
                        probe.tick(100);
                        const moved = probe.entity.position.x - probe.at(0, 0, 0).x;
                        if (away === 20 && moved < 2)
                            return [`it moved ${moved.toFixed(1)} blocks toward a target 20 blocks away`];
                        if (away === 40 && moved > 1)
                            return [
                                `it moved ${moved.toFixed(1)} blocks toward a target 40 blocks away, beyond Java's 32`
                            ];
                        return [];
                    })
                )
                .join('; ') || undefined
    }),
    goalScenario({
        goals: ['ocelotattack'],
        java: 'A cat or ocelot stalks its target, sprints the last stretch and hits it for its 3 attack damage.',
        reference:
            'Java OcelotAttackGoal (sneak at 0.6 beyond 15 blocks squared, sprint 1.33 within 4 blocks, walk 0.8; doHurtTarget within reach) and Ocelot/Cat.createAttributes (ATTACK_DAMAGE 3)',
        run: (subject) =>
            probeGoals(subject, ['ocelotattack'], {}, (probe) => {
                const player = probe.player(6, 0, 0);
                probe.entity.target = player;
                const hit = probe.until(() => hitsOn(probe, player).length > 0, 200);
                const amount = hitsOn(probe, player)[0]?.amount;
                return hit === undefined
                    ? 'it never hit its target within 200 ticks'
                    : amount === 3
                      ? undefined
                      : `its hit deals ${amount}, where Java deals 3`;
            })
    }),
    goalScenario({
        goals: ['ocelot_sit_on_block'],
        java: 'A tame cat walks to a nearby chest, furnace or bed and sits on it.',
        reference:
            'Java CatSitOnBlockGoal (MoveToBlockGoal over chests, lit furnaces and beds within 8, sitting on arrival)',
        run: (subject) =>
            probeGoals(
                subject,
                ['ocelot_sit_on_block'],
                {
                    groups: [subject.javaId === 'minecraft:cat' ? 'minecraft:cat_tame' : 'minecraft:ocelot_trusting'],
                    random: [0.001]
                },
                (probe) => {
                    probe.block(4, 0, 0, 'minecraft:chest');
                    probe.tick(300);
                    const near = distanceBetween(probe.entity.position, probe.at(4, 1, 0)) < 1.5;
                    if (subject.javaId === 'minecraft:ocelot')
                        return near ? 'an ocelot sat on a chest, which Java ocelots never do' : undefined;
                    return near && probe.entity.body.sitting ? undefined : 'it did not sit on a chest 4 blocks away';
                }
            )
    }),
    ...(
        [
            [
                'dragonholdingpattern',
                'dragon_flying',
                'circles the arena: it moves at least 20 blocks in 100 ticks',
                'Java DragonHoldingPatternPhase (flies the node path around the fountain)'
            ],
            [
                'dragonstrafeplayer',
                'dragon_flying',
                'shoots a dragon fireball at a player in sight within 200 ticks',
                'Java DragonStrafePlayerPhase (fireball after 5 ticks of sight within 64 blocks)'
            ],
            [
                'dragonchargeplayer',
                'dragon_flying',
                'flies to within 10 blocks of the player it charges within 200 ticks',
                'Java DragonChargePlayerPhase (flies at the target location, 200 tick limit)'
            ],
            [
                'dragontakeoff',
                'dragon_flying',
                'climbs more than 10 blocks off the portal within 200 ticks',
                'Java DragonTakeoffPhase (climbs to the first node above the portal)'
            ],
            [
                'dragonlanding',
                'dragon_sitting',
                'descends to the portal within 400 ticks',
                'Java DragonLandingApproachPhase and DragonLandingPhase (flies to the top of the exit portal)'
            ],
            [
                'dragonscanning',
                'dragon_sitting',
                'turns to face a player within 20 blocks while perched',
                'Java DragonSittingScanningPhase (turns toward a player within 20 blocks, then attacks after 25 ticks)'
            ],
            [
                'dragonflaming',
                'dragon_sitting',
                'breathes a dragon breath cloud within 100 ticks',
                'Java DragonSittingFlamingPhase (spawns an AreaEffectCloud of dragon breath at its head)'
            ]
        ] as const
    ).map(([goal, group, outcome, reference]) =>
        goalScenario({
            goals: [goal],
            java: `An ender dragon in this phase ${outcome}.`,
            reference,
            run: (subject) =>
                probeGoals(
                    subject,
                    [goal],
                    { groups: [group], without: (name) => name.startsWith('dragon_') },
                    (probe) => {
                        probe.entity.position = probe.at(0, goal === 'dragonlanding' ? 20 : 0, 0);
                        const start = { ...probe.entity.position };
                        const player = probe.player(goal === 'dragonscanning' ? 12 : 40, 0, 0);
                        probe.entity.target = player;
                        const ticks = goal === 'dragonlanding' ? 400 : 200;
                        let done = false;
                        for (let tick = 0; tick < ticks && !done; tick += 1) {
                            probe.tick();
                            const here = probe.entity.position;
                            if (goal === 'dragonholdingpattern') done = distanceBetween(start, here) >= 20;
                            if (goal === 'dragonstrafeplayer')
                                done = probe.runtime.countOfType('minecraft:dragon_fireball', here, 64) > 0;
                            if (goal === 'dragonchargeplayer') done = distanceBetween(here, probe.at(40, 0, 0)) < 10;
                            if (goal === 'dragontakeoff') done = here.y - start.y > 10;
                            if (goal === 'dragonlanding') done = here.y - probe.at(0, 0, 0).y < 2;
                            if (goal === 'dragonscanning') done = faces(probe, probe.at(12, 0, 0));
                            if (goal === 'dragonflaming')
                                done = probe.runtime.countOfType('minecraft:area_effect_cloud', here, 16) > 0;
                        }
                        return done ? undefined : `it never ${outcome.replace(/^\w+ /, (word) => word)} on the server`;
                    }
                )
        })
    ),
    goalScenario({
        goals: ['dragondeath'],
        java: 'A dying ender dragon holds still for its 200 tick death animation and is then removed.',
        reference: 'Java EnderDragon.tickDeath (dragonDeathTime counts to 200, then remove)',
        run: (subject) =>
            probeGoals(
                subject,
                ['dragondeath'],
                { groups: ['dragon_death'], without: (name) => name.startsWith('dragon_') },
                (probe) => {
                    const removed = probe.until(() => probe.entity.removed !== undefined, 260);
                    return removed === undefined
                        ? 'it was never removed'
                        : Math.abs(removed - 200) <= 1
                          ? undefined
                          : `it was removed ${removed} ticks into its death, where Java takes 200`;
                }
            )
    }),
    goalScenario({
        goals: ['squid_idle', 'squid_dive', 'squid_flee', 'squid_move_away_from_ground', 'squid_out_of_water'],
        name: 'squid-swim',
        java: 'A squid in open water drifts at up to 0.2 blocks a tick along a heading it redraws about once in 50 ticks, flees away from an attacker, and lies still out of water.',
        reference:
            'Java Squid.SquidRandomMovementGoal (nextInt(50), cos and sin times 0.2, y from -0.1 to 0.1), Squid.SquidFleeGoal (away from getLastHurtByMob, 3 times the speed) and Squid.aiStep (no swimming out of water)',
        run: (subject) => {
            const found: string[] = [];
            probeGoals(
                subject,
                ['squid_idle', 'squid_dive', 'squid_flee', 'squid_move_away_from_ground'],
                { random: [0.13, 0.71, 0.42, 0.9, 0.05, 0.58] },
                (probe) => {
                    probe.fill([-20, 0, -20], [20, 20, 20], 'minecraft:water');
                    probe.entity.position = probe.at(0, 10, 0);
                    const start = { ...probe.entity.position };
                    let fastest = 0;
                    let last = { ...start };
                    for (let tick = 0; tick < 200; tick += 1) {
                        probe.tick();
                        const now = probe.entity.position;
                        fastest = Math.max(fastest, Math.hypot(now.x - last.x, now.z - last.z));
                        last = { ...now };
                    }
                    const moved = distanceBetween(start, probe.entity.position);
                    if (moved < 1) found.push(`it moved ${moved.toFixed(2)} blocks in 200 ticks of open water`);
                    if (fastest > 0.35)
                        found.push(
                            `it drifted ${fastest.toFixed(2)} blocks in one tick, where Java's drift is at most 0.2`
                        );
                    const attacker = probe.player(-3, 10, 0);
                    const before = probe.entity.position.x;
                    probe.runtime.hurt(probe.entity, attacker, 'entity_attack', 1);
                    probe.tick(20);
                    if (probe.entity.position.x - before < 1) found.push('it did not flee from its attacker');
                }
            );
            probeGoals(subject, ['squid_out_of_water'], {}, (probe) => {
                const start = { ...probe.entity.position };
                probe.tick(100);
                const across = Math.hypot(probe.entity.position.x - start.x, probe.entity.position.z - start.z);
                if (across > 0.5) found.push(`out of water it moved ${across.toFixed(2)} blocks across`);
            });
            return differences(found);
        }
    }),
    goalScenario({
        goals: ['controlled_by_player'],
        java: 'A saddled pig or strider ridden by a player holding a carrot or warped fungus on a stick walks where the player looks.',
        reference:
            'Java Pig.getRiddenInput and Strider.getRiddenInput (ItemSteerable: the rider holds the steering stick)',
        classify: () => ({
            kind: 'intentional',
            reason: "A ridden pig or strider is a driven vehicle: the Bedrock client simulates the steering and reports the movement, which docs/data-driven/parity.md excludes as client-predicted simulation (category 3), so the server's goal does not move it."
        }),
        run: (subject) =>
            probeGoals(
                subject,
                ['controlled_by_player'],
                {
                    groups: [subject.javaId === 'minecraft:pig' ? 'minecraft:pig_saddled' : 'minecraft:strider_saddled']
                },
                (probe) => {
                    const rider = probe.player(0, 0, 0);
                    probe.world.held.set(
                        rider,
                        subject.javaId === 'minecraft:pig'
                            ? 'minecraft:carrot_on_a_stick'
                            : 'minecraft:warped_fungus_on_a_stick'
                    );
                    const riderMob = probe.runtime.mobById(rider);
                    if (riderMob !== undefined) probe.runtime.mount(probe.entity.body, riderMob);
                    const start = { ...probe.entity.position };
                    probe.tick(60);
                    const moved = distanceBetween(start, probe.entity.position);
                    return moved > 1
                        ? undefined
                        : `it moved ${moved.toFixed(2)} blocks in 60 ticks under a steering rider`;
                }
            )
    }),
    goalScenario({
        goals: ['follow_caravan'],
        java: 'A llama with no lead joins the caravan of a leashed llama within 9 blocks and walks after it.',
        reference:
            'Java LlamaFollowCaravanGoal (searches llamas within 9 blocks, joins the caravan tail, follows at speed 2.1)',
        run: (subject) =>
            probeGoals(subject, ['follow_caravan'], {}, (probe) => {
                const head = probe.spawn(subject.bedrock, 8, 0, 0);
                for (const name of head.instance.goals.names()) head.instance.goals.remove(name);
                const holder = probe.player(12, 0, 0);
                probe.runtime.attachLead(holder, head.id);
                probe.tick(200);
                const away = distanceBetween(probe.entity.position, head.position);
                return away < 4 ? undefined : `it stayed ${away.toFixed(1)} blocks from the leashed llama`;
            })
    }),
    goalScenario({
        goals: ['follow_mob'],
        java: 'A wild parrot follows another mob within 20 blocks, stopping 3 blocks short.',
        reference:
            'Java Parrot.registerGoals (FollowMobGoal(this, 1.0, 3.0F, 7.0F)), which follows non-parrot mobs within 20 blocks (the box inflated by 20)',
        entities: ['minecraft:parrot'],
        run: (subject) =>
            probeGoals(subject, ['follow_mob'], { groups: ['minecraft:parrot_wild'] }, (probe) => {
                const cow = probe.spawn('minecraft:cow', 12, 0, 0);
                for (const name of cow.instance.goals.names()) cow.instance.goals.remove(name);
                probe.tick(200);
                const away = distanceBetween(probe.entity.position, cow.position);
                return away <= 4 ? undefined : `it stayed ${away.toFixed(1)} blocks from a cow 12 blocks away`;
            })
    }),
    goalScenario({
        goals: ['float_wander'],
        java: 'A bat or ghast drifts to random points in the air around it.',
        reference:
            'Java Ghast.RandomFloatAroundGoal (a point within 16 blocks on each axis) and Bat.customServerAiStep (a new target within 7 blocks across)',
        entities: ['minecraft:bat', 'minecraft:ghast'],
        run: (subject) =>
            probeGoals(subject, ['float_wander'], { random: [0.001, 0.8, 0.3, 0.6] }, (probe) => {
                probe.entity.position = probe.at(0, 10, 0);
                const start = { ...probe.entity.position };
                let farthest = 0;
                for (let tick = 0; tick < 400; tick += 1) {
                    probe.tick();
                    farthest = Math.max(farthest, distanceBetween(start, probe.entity.position));
                }
                return farthest < 2 ? `it drifted at most ${farthest.toFixed(1)} blocks in 400 ticks` : undefined;
            })
    }),
    ...(
        [
            [
                'random_fly',
                'minecraft:parrot',
                'minecraft:parrot_wild',
                'Java Parrot.registerGoals (WaterAvoidingRandomFlyingGoal), whose getPosition takes HoverRandomPos.getPos(mob, 8, 7, ..., 3, 1), falling back to AirAndWaterRandomPos.getPos(mob, 8, 4, -2, ...)'
            ],
            [
                'random_hover',
                'minecraft:bee',
                undefined,
                'Java Bee.BeeWanderGoal (HoverRandomPos.getPos(bee, 8, 7, ..., 3, 1), falling back to AirAndWaterRandomPos.getPos(bee, 8, 4, -2, ...))'
            ]
        ] as const
    ).map(([goal, entity, group, reference]) =>
        goalScenario({
            goals: [goal],
            java: 'A flier wanders to random spots within 8 blocks across that hover 1 to 3 blocks above solid ground, so it never climbs far off the ground.',
            reference,
            entities: [entity],
            run: (subject) =>
                probeGoals(
                    subject,
                    [goal],
                    { ...(group === undefined ? {} : { groups: [group] }), random: [0.001, 0.8, 0.3, 0.6] },
                    (probe) => {
                        const start = { ...probe.entity.position };
                        let farthest = 0;
                        let highest = 0;
                        for (let tick = 0; tick < 400; tick += 1) {
                            probe.tick();
                            farthest = Math.max(farthest, distanceBetween(start, probe.entity.position));
                            highest = Math.max(highest, probe.entity.position.y - start.y);
                        }
                        return differences([
                            farthest < 2 && `it wandered at most ${farthest.toFixed(1)} blocks in 400 ticks`,
                            highest > 6 &&
                                `it climbed ${highest.toFixed(1)} blocks above the ground, where Java's targets stay within 3 of solid ground`
                        ]);
                    }
                )
        })
    ),
    goalScenario({
        goals: ['go_home'],
        name: 'goal-go_home',
        java: 'A bee returning home flies into its hive, a pregnant turtle walks back to its home beach.',
        reference:
            'Java Bee.BeeEnterHiveGoal and BeeGoToHiveGoal (enter the hive within 2 blocks) and Turtle.TurtleGoHomeGoal (walks home when it has an egg)',
        entities: ['minecraft:bee', 'minecraft:turtle'],
        run: (subject) => {
            const bee = subject.javaId === 'minecraft:bee';
            return probeGoals(
                subject,
                ['go_home'],
                { groups: [bee ? 'return_to_home' : 'minecraft:pregnant'], random: [0.001, 0.5] },
                (probe) => {
                    const home = probe.at(10, 0, 0);
                    if (bee) probe.block(10, 0, 0, 'minecraft:beehive');
                    probe.entity.body.home = home;
                    probe.tick(600);
                    const away = distanceBetween(probe.entity.position, home);
                    if (bee)
                        return probe.entity.removed !== undefined || away < 2
                            ? undefined
                            : `it stayed ${away.toFixed(1)} blocks from its hive`;
                    return away < 5 ? undefined : `it stayed ${away.toFixed(1)} blocks from its home`;
                }
            );
        }
    }),
    goalScenario({
        goals: ['move_to_block'],
        java: 'A bee looking for food flies to a flower within 5 blocks.',
        reference: 'Java Bee.BeePollinateGoal (findNearbyFlower within 5 blocks, then hovers on it)',
        run: (subject) =>
            probeGoals(subject, ['move_to_block'], { groups: ['look_for_food'], random: [0.01, 0.4, 0.7] }, (probe) => {
                probe.block(4, 0, 0, 'minecraft:poppy');
                probe.tick(400);
                const away = distanceBetween(probe.entity.position, probe.at(4, 0, 0));
                return away < 1.5 ? undefined : `it stayed ${away.toFixed(1)} blocks from a poppy 4 blocks away`;
            })
    }),
    goalScenario({
        goals: ['lay_egg'],
        java: 'A turtle that wants to lay finds sand within 8 blocks and lays turtle eggs on it after 200 ticks of digging.',
        reference:
            'Java Turtle.TurtleLayEggGoal (MoveToBlockGoal over sand, layEggCounter past adjustedTickDelay(200), then 1 to 4 turtle eggs)',
        entities: ['minecraft:turtle'],
        run: (subject) =>
            probeGoals(subject, ['lay_egg'], { groups: ['minecraft:wants_to_lay_egg'] }, (probe) => {
                probe.fill([-3, -1, -3], [3, -1, 3], 'minecraft:sand');
                let egg: number | undefined;
                for (let tick = 1; tick <= 400 && egg === undefined; tick += 1) {
                    probe.tick();
                    for (let x = -3; x <= 3; x += 1)
                        for (let z = -3; z <= 3; z += 1)
                            if (probe.blockAt(x, 0, z) === 'minecraft:turtle_egg') egg = tick;
                }
                return egg === undefined
                    ? 'it laid no turtle egg on sand within 400 ticks'
                    : egg < 190
                      ? `it laid after ${egg} ticks, where Java digs for 200`
                      : undefined;
            })
    }),
    goalScenario({
        goals: ['move_to_land'],
        java: 'An adult turtle with no egg to lay keeps swimming; Java has no goal that sends it ashore.',
        reference:
            'Java Turtle.registerGoals (TurtleTravelGoal and TurtleRandomStrollGoal; only TurtleGoHomeGoal and TurtleLayEggGoal take it out of the water)',
        entities: ['minecraft:turtle'],
        run: (subject) =>
            probeGoals(subject, ['move_to_land'], { groups: ['minecraft:adult'] }, (probe) => {
                probe.fill([-6, -1, -6], [6, 0, 6], 'minecraft:water');
                probe.tick(300);
                const here = probe.entity.position;
                const across = Math.max(Math.abs(here.x - probe.at(0, 0, 0).x), Math.abs(here.z - probe.at(0, 0, 0).z));
                return across > 6.5 ? 'it left the water for land' : undefined;
            })
    }),
    goalScenario({
        goals: ['drink_potion'],
        java: 'A hurt witch drinks a healing potion (a 1 in 20 roll each tick), and a wandering trader drinks invisibility whenever it is dark and it is visible.',
        reference:
            'Java Witch.aiStep (nextFloat() < 0.05 with health below max: healing potion, drunk over its use time) and WanderingTrader.registerGoals (UseItemGoal of invisibility when isDarkOutside and not invisible)',
        run: (subject) =>
            probeGoals(subject, ['drink_potion'], { random: [0.01] }, (probe) => {
                if (subject.javaId === 'minecraft:witch') {
                    probe.entity.instance.attributes.set('health', 10);
                    probe.tick(80);
                    return healthOf(probe) > 10 ? undefined : 'a hurt witch drank no healing potion';
                }
                probe.world.advance(18000);
                probe.tick(80);
                return hasEffect(probe, 'invisibility') ? undefined : 'it drank no invisibility potion at night';
            })
    }),
    goalScenario({
        goals: ['drink_milk'],
        java: 'An invisible wandering trader drinks milk in daylight and becomes visible.',
        reference: 'Java WanderingTrader.registerGoals (UseItemGoal of milk when isBrightOutside and invisible)',
        run: (subject) =>
            probeGoals(subject, ['drink_milk'], { random: [0.01] }, (probe) => {
                const self = probe.entity.instance.filterContext().self;
                if (self !== undefined)
                    probe.entity.instance.applyStatusEffect(self, {
                        id: 'invisibility',
                        durationTicks: 2400,
                        amplifier: 0
                    });
                if (!hasEffect(probe, 'invisibility')) return 'the probe could not make it invisible';
                probe.tick(80);
                return hasEffect(probe, 'invisibility') ? 'it stayed invisible in daylight' : undefined;
            })
    }),
    goalScenario({
        goals: ['nearest_prioritized_attackable_target'],
        java: 'A witch targets a player within 10 blocks; a fox targets a chicken within its range.',
        reference:
            'Java Witch.registerGoals (NearestAttackableWitchTargetGoal of Player) and Fox.registerGoals (NearestAttackableTargetGoal of Animal for chickens and rabbits)',
        entities: ['minecraft:witch', 'minecraft:fox'],
        run: (subject) =>
            probeGoals(
                subject,
                ['nearest_prioritized_attackable_target'],
                subject.javaId === 'minecraft:fox'
                    ? { groups: ['minecraft:fox_red'], random: [0.01] }
                    : { random: [0.01] },
                (probe) => {
                    const prey =
                        subject.javaId === 'minecraft:fox'
                            ? still(probe.spawn('minecraft:chicken', 6, 0, 0)).id
                            : probe.player(6, 0, 0);
                    probe.tick(40);
                    return probe.entity.target === prey ? undefined : 'it did not target its prey 6 blocks away';
                }
            )
    }),
    goalScenario({
        goals: ['trade_with_player'],
        java: 'A trader trading with a player stops walking.',
        reference: 'Java TradeWithPlayerGoal (stops navigation while a player trades)',
        entities: ['minecraft:wandering_trader'],
        run: (subject) =>
            probeGoals(subject, ['trade_with_player'], {}, (probe) => {
                const player = probe.player(2, 0, 0);
                probe.runtime.beginTrade(probe.entity.id, player);
                probe.entity.body.moveTo(probe.at(10, 0, 0), 1);
                const moved = movedOver(probe, 40);
                return moved > 0.5 ? `it walked ${moved.toFixed(1)} blocks while trading` : undefined;
            })
    }),
    goalScenario({
        goals: ['look_at_trading_player'],
        java: 'A trader looks at the player it is trading with.',
        reference: 'Java LookAtTradingPlayerGoal',
        entities: ['minecraft:wandering_trader'],
        run: (subject) =>
            probeGoals(subject, ['look_at_trading_player'], {}, (probe) => {
                const player = probe.player(0, 0, 5);
                probe.runtime.beginTrade(probe.entity.id, player);
                probe.tick(20);
                return faces(probe, probe.at(0, 0, 5)) ? undefined : 'it does not look at its trading partner';
            })
    }),
    goalScenario({
        goals: ['trade_interest'],
        java: "A wandering trader never holds out an item for a player's goods; Java has no trade interest behavior.",
        reference: 'Java WanderingTrader.registerGoals, which has no counterpart of trade interest',
        entities: ['minecraft:wandering_trader'],
        run: (subject) =>
            probeGoals(subject, ['trade_interest'], { random: [0.01] }, (probe) => {
                const player = probe.player(3, 0, 0);
                probe.world.held.set(player, 'minecraft:emerald');
                probe.tick(100);
                return probe.entity.carried === undefined
                    ? undefined
                    : `it held out ${probe.entity.carried} to a player holding an emerald`;
            })
    }),
    goalScenario({
        goals: ['follow_target_captain'],
        java: 'A patrolling raider follows its patrol leader.',
        reference: 'Java PatrollingMonster.LongDistancePatrolGoal (followers move to the leader and the patrol target)',
        run: (subject) =>
            probeGoals(subject, ['follow_target_captain'], { groups: ['minecraft:patrol_follower'] }, (probe) => {
                const captain = still(probe.spawn(subject.bedrock, 20, 0, 0));
                captain.instance.restoreComponentGroups([
                    ...captain.instance.activeComponentGroups(),
                    'minecraft:patrol_captain'
                ]);
                still(captain);
                probe.tick(300);
                const away = distanceBetween(probe.entity.position, captain.position);
                return away < 10 ? undefined : `it stayed ${away.toFixed(1)} blocks from its patrol leader`;
            })
    }),
    goalScenario({
        goals: ['move_to_random_block'],
        java: 'A patrol leader walks toward a far patrol target.',
        reference: 'Java PatrollingMonster.LongDistancePatrolGoal and findPatrolTarget (a point up to 500 blocks away)',
        run: (subject) =>
            probeGoals(
                subject,
                ['move_to_random_block'],
                { groups: ['minecraft:patrol_captain'], random: [0.2, 0.7, 0.4] },
                (probe) => {
                    const moved = movedOver(probe, 300);
                    return moved > 5 ? undefined : `it moved ${moved.toFixed(1)} blocks in 300 ticks`;
                }
            )
    }),
    goalScenario({
        goals: ['hold_ground'],
        java: 'A patrolling pillager with a target holds its ground and faces it instead of closing in.',
        reference:
            'Java Raider.HoldGroundAttackGoal (patrolling raiders with a non-player target stop navigating and look at it)',
        run: (subject) =>
            probeGoals(subject, ['hold_ground'], { groups: ['minecraft:patrol_follower'] }, (probe) => {
                probe.entity.target = probe.player(15, 0, 0);
                const moved = movedOver(probe, 60);
                return differences([
                    moved > 0.5 && `it moved ${moved.toFixed(1)} blocks`,
                    !faces(probe, probe.at(15, 0, 0)) && 'it does not face its target'
                ]);
            })
    }),
    goalScenario({
        goals: ['charge_held_item'],
        java: 'A pillager with a target charges its crossbow and shoots an arrow at it.',
        reference: 'Java RangedCrossbowAttackGoal (charges for the crossbow pull time, then performRangedAttack)',
        entities: ['minecraft:pillager'],
        run: (subject) =>
            probeGoals(
                subject,
                ['charge_held_item', 'ranged_attack'],
                { groups: ['minecraft:ranged_attack'] },
                (probe) => {
                    probe.entity.target = probe.player(8, 0, 0);
                    const shot = probe.until(
                        () => probe.runtime.countOfType('minecraft:arrow', probe.at(0, 0, 0), 16) > 0,
                        200
                    );
                    return shot === undefined ? 'it shot no arrow within 200 ticks' : undefined;
                }
            )
    }),
    goalScenario({
        goals: ['random_look_around_and_sit'],
        java: 'A fox perches and looks around on a 0.02 chance each tick; a camel husk sits down from time to time.',
        reference: 'Java Fox.PerchAndSearchGoal (random.nextFloat() < 0.02) and CamelAi.RandomSitting',
        entities: ['minecraft:fox', 'minecraft:camel_husk'],
        run: (subject) =>
            probeGoals(subject, ['random_look_around_and_sit'], { random: [0.01] }, (probe) => {
                const sat = probe.until(
                    () =>
                        probe.entity.body.sitting ||
                        probe.entity.instance.activeComponentGroups().some((group) => group.includes('sitting')),
                    200
                );
                return sat === undefined ? 'it never sat down on a 0.01 roll each tick' : undefined;
            })
    }),
    goalScenario({
        goals: ['raid_garden'],
        java: 'A fox picks ripe sweet berries from a bush, leaving it at age 1; a rabbit eats into a carrot crop.',
        reference:
            'Java Fox.FoxEatBerriesGoal (pickSweetBerries: age set to 1, berries dropped) and Rabbit.RaidGardenGoal (carrots age lowered, or removed at age 0)',
        run: (subject) =>
            probeGoals(subject, ['raid_garden'], { random: [0.01] }, (probe) => {
                const fox = subject.javaId === 'minecraft:fox';
                probe.block(3, 0, 0, fox ? 'minecraft:sweet_berry_bush' : 'minecraft:carrots');
                if (!fox) probe.block(3, -1, 0, 'minecraft:farmland');
                probe.tick(400);
                const block = probe.world.world.blocks.get({
                    x: Math.floor(probe.at(3, 0, 0).x),
                    y: Math.floor(probe.at(3, 0, 0).y),
                    z: Math.floor(probe.at(3, 0, 0).z)
                });
                const unchanged =
                    block?.identifier === (fox ? 'minecraft:sweet_berry_bush' : 'minecraft:carrots') &&
                    Object.keys(block.states).length === 0;
                return unchanged ? `the ${fox ? 'berry bush' : 'carrot crop'} 3 blocks away was left alone` : undefined;
            })
    }),
    goalScenario({
        goals: ['stalk_and_pounce_on_target'],
        java: 'A fox stalks its prey and pounces on it, hurting it.',
        reference: 'Java Fox.StalkPreyGoal and Fox.FoxPounceGoal (leap at the target, then doHurtTarget on landing)',
        run: (subject) =>
            probeGoals(subject, ['stalk_and_pounce_on_target'], { random: [0.01] }, (probe) => {
                const player = probe.player(5, 0, 0);
                probe.entity.target = player;
                const hit = probe.until(() => hitsOn(probe, player).length > 0, 300);
                return hit === undefined ? 'it never pounced on its prey within 300 ticks' : undefined;
            })
    }),
    goalScenario({
        goals: ['nap'],
        java: 'A fox naps in the day when nothing hostile is near and it is not in water.',
        reference: 'Java Fox.SleepGoal (daytime, no hostile within 12, a 1 in 140 roll)',
        run: (subject) =>
            probeGoals(subject, ['nap'], { groups: ['minecraft:fox_day'], random: [0.001] }, (probe) => {
                const slept = probe.until(() => probe.entity.body.sleeping, 300);
                return slept === undefined ? 'it never napped in the day' : undefined;
            })
    }),
    goalScenario({
        goals: ['find_cover'],
        java: 'A fox in daylight looks for shade: it walks under a roof when it stands in the sun.',
        reference:
            'Java Fox.SeekShelterGoal (FleeSunGoal subclass: in sunlight, walk to a spot that cannot see the sky)',
        run: (subject) =>
            probeGoals(
                subject,
                ['find_cover'],
                { groups: ['minecraft:fox_day'], random: [0.001, 0.5, 0.9] },
                (probe) => {
                    probe.fill([3, 3, -2], [7, 3, 2], 'minecraft:stone');
                    probe.tick(300);
                    const x = probe.entity.position.x - probe.at(0, 0, 0).x;
                    return x >= 2.5 && x <= 7.5 ? undefined : 'it stayed in the sun beside a roof';
                }
            )
    }),
    goalScenario({
        goals: ['stroll_towards_village'],
        java: 'A fox at night strolls toward a village it can find.',
        reference:
            'Java Fox.FoxStrollThroughVillageGoal (StrollThroughVillageGoal: nightly roll, walks toward a village POI)',
        run: (subject) =>
            probeGoals(
                subject,
                ['stroll_towards_village'],
                { groups: ['minecraft:fox_night'], random: [0.001, 0.5] },
                (probe) => {
                    probe.runtime.recordPointOfInterest('village', probe.at(20, 0, 0));
                    probe.world.advance(18000);
                    probe.tick(400);
                    const closer = distanceBetween(probe.entity.position, probe.at(20, 0, 0));
                    return closer < 15 ? undefined : `it stayed ${closer.toFixed(1)} blocks from the village`;
                }
            )
    }),
    goalScenario({
        goals: ['defend_trusted_target'],
        java: 'A fox that trusts a player attacks whatever hurts that player.',
        reference: 'Java Fox.DefendTrustedTargetGoal (targets the last attacker of a trusted player)',
        run: (subject) =>
            probeGoals(subject, ['defend_trusted_target'], { groups: ['minecraft:trusting_fox'] }, (probe) => {
                const friend = probe.player(2, 0, 0);
                probe.runtime.setOwner(probe.entity.id, friend);
                const zombie = still(probe.spawn('minecraft:zombie', 4, 0, 0));
                const friendMob = probe.runtime.mobById(friend);
                if (friendMob !== undefined) probe.runtime.attack(zombie.body, friendMob);
                probe.tick(10);
                return probe.entity.target === zombie.id
                    ? undefined
                    : 'it did not turn on the attacker of its trusted player';
            })
    }),
    goalScenario({
        goals: ['eat_carried_item'],
        java: 'A fox carrying food eats it once 600 ticks have passed since it last ate.',
        reference: 'Java Fox.aiStep (ticksSinceEaten > 600 with food in the mouth: eat and heal)',
        run: (subject) =>
            probeGoals(
                subject,
                ['eat_carried_item'],
                { groups: ['minecraft:fox_with_item'], random: [0.01] },
                (probe) => {
                    probe.entity.carried = 'minecraft:sweet_berries';
                    const ate = probe.until(() => probe.entity.carried === undefined, 800);
                    return ate === undefined
                        ? 'it never ate the berries in its mouth'
                        : ate < 590
                          ? `it ate after ${ate} ticks, where Java waits 600`
                          : undefined;
                }
            )
    }),
    goalScenario({
        goals: ['random_sitting'],
        java: 'A panda sits only to eat: with no food in its paw or lying within 6 blocks, it never sits.',
        reference: 'Java Panda.PandaSitGoal.canUse (food items within 6 blocks or a held item)',
        run: (subject) =>
            probeGoals(subject, ['random_sitting'], { random: [0.001] }, (probe) => {
                const sat = probe.until(() => probe.entity.body.sitting, 200);
                return sat === undefined ? undefined : 'it sat down with no food anywhere near';
            })
    }),
    goalScenario({
        goals: ['snacking'],
        java: 'A panda picks up bamboo lying within 6 blocks and eats it.',
        reference: 'Java Panda.PandaSitGoal (walks to PANDA_ITEMS within 6 blocks, picks it up, sits and eats)',
        run: (subject) =>
            probeGoals(subject, ['snacking'], { random: [0.001] }, (probe) => {
                probe.world.dropItem(probe.at(2, 0, 0), { identifier: 'minecraft:bamboo', count: 1 });
                probe.tick(300);
                const lying = probe.runtime
                    .items(probe.at(0, 0, 0), 8)
                    .filter((item) => item.identifier() === 'minecraft:bamboo');
                return lying.length === 0 || probe.entity.carried === 'minecraft:bamboo'
                    ? undefined
                    : 'it left the bamboo 2 blocks away on the ground';
            })
    }),
    goalScenario({
        goals: ['roll'],
        java: 'A playful panda rolls over now and then, tumbling forward.',
        reference: 'Java Panda.PandaRollGoal (playful or baby, a reducedTickDelay roll, then a forward push)',
        run: (subject) =>
            probeGoals(subject, ['roll'], { groups: ['minecraft:panda_playful'], random: [0.0001, 0.5] }, (probe) => {
                const moved = movedOver(probe, 200);
                return moved > 0.5 ? undefined : 'it never rolled';
            })
    }),
    goalScenario({
        goals: ['sneeze'],
        java: 'A sneezing panda sneezes and may drop a slime ball.',
        reference:
            'Java Panda.afterSneeze (drops a slime ball one sneeze in 700) and Panda.tick (weak or baby sneeze rolls)',
        run: (subject) =>
            probeGoals(subject, ['sneeze'], { groups: ['minecraft:panda_sneezing'], random: [0.00001] }, (probe) => {
                const before = probe.world.drops.length;
                probe.tick(200);
                const dropped = probe.world.drops
                    .slice(before)
                    .some((drop) => drop.item.identifier === 'minecraft:slime_ball');
                return dropped ? undefined : 'it never sneezed out a slime ball on rolls that always succeed';
            })
    }),
    goalScenario({
        goals: ['scared'],
        java: 'A worried panda cowers only in a thunderstorm; in clear weather it does not.',
        reference: 'Java Panda.isScared (worried gene and level.isThundering)',
        run: (subject) =>
            probeGoals(subject, ['scared'], { groups: ['minecraft:panda_worried'] }, (probe) => {
                probe.tick(40);
                return probe.entity.instance.goals.runningGoals().includes(behavior('scared'))
                    ? 'it cowers in clear weather'
                    : undefined;
            })
    }),
    goalScenario({
        goals: ['lay_down'],
        java: 'A lazy panda lies on its back from time to time.',
        reference: 'Java Panda.PandaLieOnBackGoal (lazy gene, a reducedTickDelay(400) roll)',
        run: (subject) =>
            probeGoals(subject, ['lay_down'], { groups: ['minecraft:panda_lazy'], random: [0.0001] }, (probe) => {
                const lay = probe.until(
                    () =>
                        probe.entity.instance.goals.runningGoals().includes(behavior('lay_down')) ||
                        probe.entity.body.sitting,
                    800
                );
                return lay === undefined ? 'it never lay down' : undefined;
            })
    }),
    goalScenario({
        goals: ['pet_sleep_with_owner'],
        java: 'A tame cat lies on its owner only while the owner sleeps; with the owner awake it does not go to bed.',
        reference: 'Java Cat.CatRelaxOnOwnerGoal.canUse (owner.isSleeping)',
        run: (subject) =>
            probeGoals(subject, ['pet_sleep_with_owner'], { groups: ['minecraft:cat_tame'] }, (probe) => {
                const owner = probe.player(5, 0, 0);
                probe.runtime.setOwner(probe.entity.id, owner);
                probe.block(5, 0, 1, 'minecraft:bed');
                probe.tick(200);
                return probe.entity.body.sleeping ? 'it went to sleep on the bed of an owner who is awake' : undefined;
            })
    }),
    goalScenario({
        goals: ['drop_item_for'],
        java: "A cat that slept with its owner leaves a gift from the cat's morning gift table by the owner 70% of the time.",
        reference:
            'Java Cat.CatRelaxOnOwnerGoal.giveMorningGift (random.nextFloat() < 0.7, loot table gameplay/cat_morning_gift)',
        run: (subject) =>
            probeGoals(
                subject,
                ['drop_item_for'],
                { groups: ['minecraft:cat_tame', 'minecraft:cat_gift_for_owner'], random: [0.01] },
                (probe) => {
                    const owner = probe.player(3, 0, 0);
                    probe.runtime.setOwner(probe.entity.id, owner);
                    probe.world.advance(18500);
                    const before = probe.world.drops.length;
                    probe.tick(400);
                    return probe.world.drops.length > before ? undefined : 'it left its owner no gift';
                }
            )
    }),
    goalScenario({
        goals: ['move_towards_dwelling_restriction'],
        java: 'An iron golem outside a village walks back toward it; a cat has no such goal in Java and stays where it is.',
        reference: 'Java IronGolem.registerGoals (MoveBackToVillageGoal) and Cat.registerGoals (no village goal)',
        entities: ['minecraft:iron_golem', 'minecraft:cat'],
        run: (subject) =>
            probeGoals(
                subject,
                ['move_towards_dwelling_restriction'],
                subject.javaId === 'minecraft:cat' ? { groups: ['minecraft:cat_wild'] } : {},
                (probe) => {
                    probe.runtime.recordPointOfInterest('village', probe.at(30, 0, 0));
                    probe.tick(300);
                    const moved = probe.entity.position.x - probe.at(0, 0, 0).x;
                    if (subject.javaId === 'minecraft:cat')
                        return moved > 3 ? `it walked ${moved.toFixed(1)} blocks toward a village` : undefined;
                    return moved > 3 ? undefined : 'it stayed outside the village';
                }
            )
    }),
    goalScenario({
        goals: ['move_through_village'],
        java: 'An iron golem strolls around its village at any time of day.',
        reference:
            'Java IronGolem.registerGoals (GolemRandomStrollInVillageGoal(this, 0.6), with no time of day condition)',
        run: (subject) =>
            probeGoals(subject, ['move_through_village'], { random: [0.001, 0.6, 0.3] }, (probe) => {
                probe.runtime.recordPointOfInterest('village', probe.at(0, 0, 0));
                probe.runtime.recordPointOfInterest('bed', probe.at(12, 0, 4));
                const moved = movedOver(probe, 400);
                return moved > 2 ? undefined : 'it did not stroll through the village in the day';
            })
    }),
    goalScenario({
        goals: ['offer_flower'],
        java: 'In the day an iron golem offers a flower to a villager within 6 blocks, on a 1 in 8000 roll, and holds it out for 400 ticks.',
        reference:
            'Java OfferFlowerGoal (isDay, random.nextInt(8000) == 0, a villager within 6 blocks, tick = adjustedTickDelay(400))',
        run: (subject) =>
            probeGoals(subject, ['offer_flower'], { random: [0.00001] }, (probe) => {
                still(probe.spawn('minecraft:villager_v2', 3, 0, 0));
                const started = probe.until(
                    () => probe.entity.instance.goals.runningGoals().includes(behavior('offer_flower')),
                    100
                );
                if (started === undefined) return 'it never offered a flower to a villager 3 blocks away';
                const held = probe.until(
                    () => !probe.entity.instance.goals.runningGoals().includes(behavior('offer_flower')),
                    600
                );
                return held !== undefined && Math.abs(held - 400) <= 2
                    ? undefined
                    : `it held the flower for ${held ?? 'over 600'} ticks, where Java holds it 400`;
            })
    }),
    goalScenario({
        goals: ['defend_village_target'],
        java: 'A village iron golem turns on a player only once that player has lost its standing with the village; a single blow to a villager is not enough.',
        reference:
            'Java DefendVillageTargetGoal (a player whose villager reputation is -100 or lower) and Villager.onReputationEventFrom (VILLAGER_HURT adds 25 minor negative gossip, worth -25)',
        run: (subject) =>
            probeGoals(subject, ['defend_village_target'], { groups: ['minecraft:village_created'] }, (probe) => {
                const villager = still(probe.spawn('minecraft:villager_v2', 3, 0, 0));
                const player = probe.player(5, 0, 0);
                probe.runtime.hurt(villager, player, 'entity_attack', 1);
                probe.tick(20);
                return probe.entity.target === player ? 'it turned on a player for one blow to a villager' : undefined;
            })
    }),
    goalScenario({
        goals: ['find_underwater_treasure'],
        java: 'A dolphin leads a player to treasure only after the player feeds it fish; an unfed dolphin does not swim to it.',
        reference: 'Java Dolphin.DolphinSwimToTreasureGoal.canUse (gotFish and air supply at least 100)',
        run: (subject) =>
            probeGoals(subject, ['find_underwater_treasure'], {}, (probe) => {
                probe.fill([-4, 0, -4], [30, 6, 4], 'minecraft:water');
                probe.entity.position = probe.at(0, 3, 0);
                probe.runtime.recordPointOfInterest('buried_treasure', probe.at(26, 0, 0));
                probe.tick(200);
                const moved = probe.entity.position.x - probe.at(0, 0, 0).x;
                return moved > 6 ? 'an unfed dolphin swam off toward treasure' : undefined;
            })
    }),
    goalScenario({
        goals: ['random_breach'],
        java: 'A dolphin near the surface leaps out of the water now and then.',
        reference:
            'Java Dolphin.registerGoals (DolphinJumpGoal(this, 10): a reducedTickDelay(10) roll, then an upward push out of the water)',
        run: (subject) =>
            probeGoals(subject, ['random_breach'], { random: [0.001, 0.5] }, (probe) => {
                probe.fill([-8, 0, -8], [8, 3, 8], 'minecraft:water');
                probe.entity.position = probe.at(0, 3, 0);
                let highest = probe.entity.position.y;
                for (let tick = 0; tick < 300; tick += 1) {
                    probe.tick();
                    highest = Math.max(highest, probe.entity.position.y);
                }
                return highest > probe.at(0, 4.5, 0).y ? undefined : 'it never leapt out of the water';
            })
    }),
    goalScenario({
        goals: ['swim_up_for_breath'],
        java: 'A dolphin swims up for air only once its air supply is below 140 ticks; a dolphin that has just dived, with 4800, keeps swimming below.',
        reference: 'Java BreathAirGoal.canUse (getAirSupply() < 140) and Dolphin.getMaxAirSupply (4800)',
        run: (subject) =>
            probeGoals(subject, ['swim_up_for_breath'], {}, (probe) => {
                probe.fill([-4, 0, -4], [4, 10, 4], 'minecraft:water');
                probe.entity.position = probe.at(0, 1, 0);
                probe.tick(100);
                return probe.entity.position.y > probe.at(0, 5, 0).y ? 'it swam up for air with full lungs' : undefined;
            })
    }),
    goalScenario({
        goals: ['swim_with_entity'],
        java: 'A dolphin swims along with a nearby player in the water.',
        reference:
            'Java Dolphin.DolphinSwimWithPlayerGoal (players within 10 blocks; follows and grants dolphins grace)',
        run: (subject) =>
            probeGoals(subject, ['swim_with_entity'], { random: [0.01] }, (probe) => {
                probe.fill([-4, 0, -4], [20, 6, 4], 'minecraft:water');
                probe.entity.position = probe.at(0, 3, 0);
                probe.player(9, 3, 0);
                probe.tick(200);
                const away = distanceBetween(probe.entity.position, probe.at(9, 3, 0));
                return away < 6 ? undefined : `it stayed ${away.toFixed(1)} blocks from a swimming player`;
            })
    }),
    goalScenario({
        goals: ['move_to_liquid'],
        java: 'A strider on land walks back to lava within 16 blocks.',
        reference: 'Java Strider.StriderGoToLavaGoal (MoveToBlockGoal over lava, range 16)',
        run: (subject) =>
            probeGoals(subject, ['move_to_liquid'], { groups: ['minecraft:strider_pathing_behaviors'] }, (probe) => {
                probe.fill([8, -1, -3], [14, -1, 3], 'minecraft:lava');
                probe.tick(300);
                const x = probe.entity.position.x - probe.at(0, 0, 0).x;
                return x > 7 ? undefined : 'it did not walk to the lava 8 blocks away';
            })
    }),
    goalScenario({
        goals: ['rise_to_liquid_level'],
        java: 'A strider in lava floats up to stand on its surface.',
        reference: 'Java Strider.floatStrider (in lava, rises 0.05 a tick until it stands on the surface)',
        run: (subject) =>
            probeGoals(
                subject,
                ['rise_to_liquid_level'],
                { groups: ['minecraft:strider_pathing_behaviors'] },
                (probe) => {
                    probe.fill([-3, -3, -3], [3, 1, 3], 'minecraft:lava');
                    probe.entity.position = probe.at(0, -2, 0);
                    probe.tick(200);
                    return probe.entity.position.y >= probe.at(0, 1, 0).y
                        ? undefined
                        : `it stayed at y ${probe.entity.position.y.toFixed(2)} under the lava surface`;
                }
            )
    }),
    goalScenario({
        goals: ['place_block'],
        java: 'An enderman carrying a block puts it down on a free spot beside it and stops carrying it.',
        reference:
            'Java EnderMan.EndermanLeaveBlockGoal (a reducedTickDelay(2000) roll; an air cell over a full block; setCarriedBlock(null))',
        entities: ['minecraft:enderman'],
        run: (subject) =>
            probeGoals(subject, ['place_block'], { random: [0.00001, 0.5, 0.9] }, (probe) => {
                probe.entity.carried = 'minecraft:dirt';
                probe.tick(200);
                let placed = 0;
                for (let x = -1; x <= 1; x += 1)
                    for (let y = 0; y <= 2; y += 1)
                        for (let z = -1; z <= 1; z += 1) if (probe.blockAt(x, y, z) === 'minecraft:dirt') placed += 1;
                return differences([
                    placed === 0 && 'it never put down the dirt it carried',
                    placed > 1 && `it put down ${placed} dirt blocks from one carried block`,
                    probe.entity.carried !== undefined && placed > 0 && 'it still carries the block it put down'
                ]);
            })
    }),
    ...(
        [
            [
                'float_wander',
                'minecraft:adult',
                'A happy ghast drifts to random points around it.',
                'Java HappyGhast.registerGoals (Ghast.RandomFloatAroundGoal)'
            ],
            [
                'random_hover',
                'minecraft:baby',
                'A ghastling drifts to random points around it.',
                'Java HappyGhast.registerGoals (Ghast.RandomFloatAroundGoal)'
            ]
        ] as const
    ).map(([goal, group, java, reference]) =>
        goalScenario({
            goals: [goal],
            name: `happy-ghast-${goal}`,
            java,
            reference,
            entities: ['minecraft:happy_ghast'],
            run: (subject) =>
                probeGoals(subject, [goal], { groups: [group], random: [0.001, 0.8, 0.3, 0.6] }, (probe) => {
                    probe.entity.position = probe.at(0, 8, 0);
                    const moved = movedOver(probe, 400);
                    return moved > 2 ? undefined : `it drifted ${moved.toFixed(1)} blocks in 400 ticks`;
                })
        })
    ),
    goalScenario({
        goals: ['follow_mob'],
        name: 'happy-ghast-follow_mob',
        java: 'A ghastling follows a nearby player.',
        reference: 'Java HappyGhastAi (a ghastling stays close to a nearby player)',
        entities: ['minecraft:happy_ghast'],
        run: (subject) =>
            probeGoals(subject, ['follow_mob'], { groups: ['minecraft:baby'] }, (probe) => {
                probe.player(12, 0, 0);
                probe.tick(300);
                const away = distanceBetween(probe.entity.position, probe.at(12, 0, 0));
                return away < 8 ? undefined : `it stayed ${away.toFixed(1)} blocks from a player`;
            })
    }),
    goalScenario({
        goals: ['float_tempt'],
        java: 'A happy ghast drifts toward a player holding a snowball.',
        reference: 'Java HappyGhast.registerGoals (TemptGoal.ForNonPathfinders over #happy_ghast_tempt_items)',
        run: (subject) =>
            probeGoals(
                subject,
                ['float_tempt'],
                { groups: ['minecraft:adult', 'minecraft:adult_unharnessed'] },
                (probe) => {
                    const player = probe.player(10, 0, 0);
                    probe.world.held.set(player, 'minecraft:snowball');
                    probe.tick(300);
                    const away = distanceBetween(probe.entity.position, probe.at(10, 0, 0));
                    return away < 7
                        ? undefined
                        : `it stayed ${away.toFixed(1)} blocks from a player holding a snowball`;
                }
            )
    }),
    goalScenario({
        goals: ['place_block'],
        name: 'copper-golem-statue',
        java: 'A fully oxidized copper golem that turns to a statue puts an oxidized copper golem statue block where it stood and is gone.',
        reference:
            'Java CopperGolem.turnToStatue (sets the oxidized copper golem statue block, facing its rotation, then discards the golem)',
        entities: ['minecraft:copper_golem'],
        run: (subject) =>
            withProbe(subject.bedrock, { groups: ['minecraft:becoming_statue'], random: [0.01] }, (probe) => {
                probe.tick(200);
                const statue = probe.blockAt(0, 0, 0);
                return differences([
                    statue?.includes('copper_golem_statue') !== true &&
                        `it left ${statue ?? 'nothing'} where it stood, not a statue`,
                    statue?.includes('copper_golem_statue') === true &&
                        probe.entity.removed === undefined &&
                        'it stayed in the world beside its statue'
                ]);
            })
    })
];
