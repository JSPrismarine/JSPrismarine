/**
 * One representative situation per brain mob: set the world up, run the mob's own
 * `updateActivity`, and assert the activity it reaches and the memory it wrote.
 *
 * Every constant an assertion depends on is named in the test title or in a comment, and comes
 * from the pinned 26.3 server jar.
 */

import { describe, expect, it } from 'vitest';

import { Activities } from '../activity.js';
import type { Brain } from '../brain.js';
import { MemoryModuleTypes, UNIT } from '../memory.js';
import type { BrainMobDefinition, BrainMobOptions } from '../registry.js';
import type { TestEntityOptions, TestMob } from '../testWorld.js';
import { TestWorld } from '../testWorld.js';
import type { BrainEntity, Vec3 } from '../world.js';
import { EntityCondition } from '../world.js';

import { ALLAY } from './allay.js';
import { ARMADILLO } from './armadillo.js';
import { AXOLOTL } from './axolotl.js';
import { BREEZE } from './breeze.js';
import { CAMEL } from './camel.js';
import { COPPER_GOLEM } from './copperGolem.js';
import { CREAKING } from './creaking.js';
import { FROG } from './frog.js';
import { GOAT } from './goat.js';
import { HAPPY_GHAST } from './happyGhast.js';
import { HOGLIN, piglinsOutnumberHoglins } from './hoglin.js';
import { NAUTILUS, ZOMBIE_NAUTILUS } from './nautilus.js';
import { PIGLIN, canAdmire, admireGoldItem, isBarterCurrency, wantsToPickUp } from './piglin.js';
import { PIGLIN_BRUTE } from './piglinBrute.js';
import { SNIFFER } from './sniffer.js';
import { TADPOLE } from './tadpole.js';
import { VILLAGER, VILLAGER_SCHEDULE } from './villager.js';
import { AngerManagement, WARDEN, angerLevelByAnger, setDisturbanceLocation } from './warden.js';
import { ZOGLIN } from './zoglin.js';
import {
    ALLAY_BRAIN,
    ARMADILLO_BRAIN,
    AXOLOTL_BRAIN,
    BREEZE_BRAIN,
    CAMEL_BRAIN,
    COPPER_GOLEM_BRAIN,
    CREAKING_BRAIN,
    FROG_BRAIN,
    GOAT_BRAIN,
    HAPPY_GHAST_BRAIN,
    HOGLIN_BRAIN,
    NAUTILUS_BRAIN,
    PIGLIN_BRAIN,
    PIGLIN_BRUTE_BRAIN,
    SNIFFER_BRAIN,
    TADPOLE_BRAIN,
    VILLAGER_BRAIN,
    WARDEN_BRAIN,
    ZOGLIN_BRAIN,
    ZOMBIE_NAUTILUS_BRAIN
} from './index.js';

/** Builds a world and a body with the mob's own brain attached. */
function spawn(
    definition: BrainMobDefinition,
    options: {
        readonly world?: TestWorld;
        readonly position?: Vec3;
        readonly entity?: TestEntityOptions;
        readonly brain?: BrainMobOptions;
    } = {}
): { world: TestWorld; body: TestMob; brain: Brain } {
    const world = options.world ?? new TestWorld();
    const body = world.spawn(definition.id, options.position ?? { x: 0, y: 64, z: 0 }, options.entity ?? {});
    const brain = definition.makeBrain(options.brain);
    body.attach(brain);
    definition.initMemories?.(body.context);
    return { world, body, brain };
}

/** Runs enough brain ticks for the sensors to fill their memories and the behaviors to react. */
function run(body: TestMob, definition: BrainMobDefinition, ticks = 25): void {
    for (let tick = 0; tick < ticks; tick++) {
        definition.updateActivity(body.context);
        body.tickBrain();
        body.context.world instanceof TestWorld && body.context.world.advance();
    }
}

describe('the allay', () => {
    it('idles, and remembers a note block for TIME_TO_FORGET_NOTEBLOCK, which is 600', () => {
        const { body, brain } = spawn(ALLAY_BRAIN);
        run(body, ALLAY_BRAIN, 2);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);

        brain.setMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_POSITION, {
            dimension: 'minecraft:overworld',
            pos: { x: 3, y: 64, z: 0 }
        });
        brain.setMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_COOLDOWN_TICKS, ALLAY.timeToForgetNoteblock);
        expect(brain.getMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_COOLDOWN_TICKS)).toBe(600);
    });

    it('goes after a wanted item, at SPEED_MULTIPLIER_WHEN_RETRIEVING_ITEM, which is 1.75', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(ALLAY_BRAIN, { world });
        world.drop({ id: 'minecraft:emerald', tags: new Set() }, { x: 4, y: 64, z: 0 });
        run(body, ALLAY_BRAIN, 2);
        expect(brain.hasMemoryValue(MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM)).toBe(true);
        expect(brain.getMemory(MemoryModuleTypes.WALK_TARGET)?.speedModifier).toBe(ALLAY.speedWhenRetrievingItem);
    });
});

describe('the armadillo', () => {
    it('balls up in the panic activity while DANGER_DETECTED_RECENTLY holds', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(ARMADILLO_BRAIN, {
            world,
            entity: { conditions: [EntityCondition.ON_GROUND] }
        });
        world.place('minecraft:player', { x: 2, y: 64, z: 0 });
        run(body, ARMADILLO_BRAIN, 10);
        expect(brain.getMemory(MemoryModuleTypes.DANGER_DETECTED_RECENTLY)).toBe(true);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.PANIC);
        expect(body.conditions.has(EntityCondition.SCARED)).toBe(true);
    });

    it('unrolls once the 80-tick scare memory expires', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(ARMADILLO_BRAIN, {
            world,
            entity: { conditions: [EntityCondition.ON_GROUND] }
        });
        const player = world.place('minecraft:player', { x: 2, y: 64, z: 0 });
        run(body, ARMADILLO_BRAIN, 10);
        player.position = { x: 200, y: 64, z: 0 };
        run(body, ARMADILLO_BRAIN, ARMADILLO.scareMemoryTimeToLive + 10);
        expect(brain.hasMemoryValue(MemoryModuleTypes.DANGER_DETECTED_RECENTLY)).toBe(false);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
        expect(body.conditions.has(EntityCondition.SCARED)).toBe(false);
    });
});

describe('the axolotl', () => {
    it('fights a submerged hunt target, and holds the 2400-tick hunting cooldown afterwards', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(AXOLOTL_BRAIN, {
            world,
            entity: { conditions: [EntityCondition.IN_WATER] }
        });
        const prey = world.place(
            'minecraft:cod',
            { x: 3, y: 64, z: 0 },
            {
                typeTags: ['minecraft:axolotl_hunt_targets'],
                conditions: [EntityCondition.IN_WATER]
            }
        );
        run(body, AXOLOTL_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBe(prey);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.FIGHT);

        prey.alive = false;
        run(body, AXOLOTL_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.HAS_HUNTING_COOLDOWN)).toBe(true);
        expect(brain.getTimeUntilExpiry(MemoryModuleTypes.HAS_HUNTING_COOLDOWN)).toBeLessThanOrEqual(
            AXOLOTL.huntingCooldown
        );
    });

    it('stays in play_dead and will not be pulled out of it', () => {
        const { body, brain } = spawn(AXOLOTL_BRAIN, { entity: { conditions: [EntityCondition.IN_WATER] } });
        brain.setMemory(MemoryModuleTypes.PLAY_DEAD_TICKS, AXOLOTL.playDeadTicks);
        AXOLOTL_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.PLAY_DEAD);
        AXOLOTL_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.PLAY_DEAD);
    });
});

describe('the breeze', () => {
    it('reaches the fight activity and arms BREEZE_SHOOT through the slide', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(BREEZE_BRAIN, { world });
        world.place('minecraft:player', { x: 5, y: 64, z: 0 });
        run(body, BREEZE_BRAIN, 4);
        expect(brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET)).toBe(true);
        brain.setMemoryWithExpiry(MemoryModuleTypes.BREEZE_SHOOT, UNIT, BREEZE.shootAfterSlideTicks);
        expect(brain.getTimeUntilExpiry(MemoryModuleTypes.BREEZE_SHOOT)).toBe(60);
    });
});

describe('the camel', () => {
    it('idles, and runs the Bedrock goal scheduler as well', () => {
        const { body, brain } = spawn(CAMEL_BRAIN);
        run(body, CAMEL_BRAIN, 2);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
        expect(CAMEL_BRAIN.alsoRunsGoals).toBe(true);
    });

    it('does not walk while it refuses to move, which is what a ridden camel does', () => {
        const world = new TestWorld();
        world.nextRandomPos = { x: 5, y: 64, z: 0 };
        const { body, brain } = spawn(CAMEL_BRAIN, {
            world,
            entity: { conditions: [EntityCondition.REFUSE_TO_MOVE, EntityCondition.ON_GROUND] }
        });
        run(body, CAMEL_BRAIN, 10);
        expect(brain.hasMemoryValue(MemoryModuleTypes.WALK_TARGET)).toBe(false);
        expect(body.navigation.moves).toHaveLength(0);
        expect(CAMEL.speedWhenIdling).toBe(2);
    });
});

describe('the copper golem', () => {
    it('walks to a copper chest, at SPEED_MULTIPLIER_WHEN_IDLING, which is 1', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(COPPER_GOLEM_BRAIN, { world });
        world.setBlock({ x: 5, y: 64, z: 0 }, 'minecraft:copper_chest', [COPPER_GOLEM.sourceBlockTag]);
        run(body, COPPER_GOLEM_BRAIN, 2);
        expect(brain.getMemory(MemoryModuleTypes.WALK_TARGET)?.speedModifier).toBe(COPPER_GOLEM.speedWhenIdling);
        expect(brain.getMemory(MemoryModuleTypes.VISITED_BLOCK_POSITIONS)).toHaveLength(1);
    });
});

describe('the creaking', () => {
    it('attacks a visible player while active and freezes when it cannot move', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(CREAKING_BRAIN, {
            world,
            entity: { conditions: [EntityCondition.ACTIVE, EntityCondition.CAN_MOVE] }
        });
        const player = world.place('minecraft:player', { x: 4, y: 64, z: 0 });
        run(body, CREAKING_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBe(player);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.FIGHT);

        body.setCondition(EntityCondition.CAN_MOVE, false);
        CREAKING_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
        expect(CREAKING.speedWhenIdling).toBe(0.3);
    });
});

describe('the frog', () => {
    it('targets a slime and goes to the tongue activity', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(FROG_BRAIN, { world });
        const slime = world.place('minecraft:slime', { x: 4, y: 64, z: 0 }, { typeTags: ['minecraft:frog_food'] });
        run(body, FROG_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBe(slime);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.TONGUE);
    });

    it('swims instead of idling while IS_IN_WATER is present', () => {
        const { body, brain } = spawn(FROG_BRAIN, { entity: { conditions: [EntityCondition.IN_WATER] } });
        run(body, FROG_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.IS_IN_WATER)).toBe(UNIT);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.SWIM);
    });

    it('lays spawn while IS_PREGNANT, which outranks swimming', () => {
        const { body, brain } = spawn(FROG_BRAIN, { entity: { conditions: [EntityCondition.IN_WATER] } });
        brain.setMemory(MemoryModuleTypes.IS_PREGNANT, UNIT);
        run(body, FROG_BRAIN, 3);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.LAY_SPAWN);
    });

    it('starts with a long jump cooldown drawn from TIME_BETWEEN_LONG_JUMPS, which is (100, 140)', () => {
        const { brain } = spawn(FROG_BRAIN);
        const cooldown = brain.getMemory(MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS) ?? 0;
        expect(cooldown).toBeGreaterThanOrEqual(FROG.timeBetweenLongJumps.min);
        expect(cooldown).toBeLessThanOrEqual(FROG.timeBetweenLongJumps.max);
    });
});

describe('the tadpole', () => {
    it('only ever idles, and swims at SPEED_MULTIPLIER_WHEN_IDLING_IN_WATER, which is 0.5', () => {
        const world = new TestWorld();
        world.nextRandomPos = { x: 3, y: 64, z: 0 };
        const { body, brain } = spawn(TADPOLE_BRAIN, {
            world,
            entity: { conditions: [EntityCondition.IN_WATER] }
        });
        run(body, TADPOLE_BRAIN, 3);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
        expect(TADPOLE.speedWhenIdlingInWater).toBe(0.5);
    });
});

describe('the goat', () => {
    it('starts idle because both cooldowns are present, which is the inverse of the usual reading', () => {
        const { body, brain } = spawn(GOAT_BRAIN);
        expect(brain.hasMemoryValue(MemoryModuleTypes.RAM_COOLDOWN_TICKS)).toBe(true);
        expect(brain.hasMemoryValue(MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS)).toBe(true);
        GOAT_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
    });

    it('rams once RAM_COOLDOWN_TICKS runs out', () => {
        const { body, brain } = spawn(GOAT_BRAIN);
        brain.eraseMemory(MemoryModuleTypes.RAM_COOLDOWN_TICKS);
        GOAT_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.RAM);
    });

    it('long jumps once only the jump cooldown is gone and no walk target holds it', () => {
        const { body, brain } = spawn(GOAT_BRAIN);
        brain.eraseMemory(MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS);
        GOAT_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.LONG_JUMP);
    });

    it('draws its ram cooldown from TIME_BETWEEN_RAMS, which is (600, 6000)', () => {
        const { brain } = spawn(GOAT_BRAIN);
        const cooldown = brain.getMemory(MemoryModuleTypes.RAM_COOLDOWN_TICKS) ?? 0;
        expect(cooldown).toBeGreaterThanOrEqual(GOAT.timeBetweenRams.min);
        expect(cooldown).toBeLessThanOrEqual(GOAT.timeBetweenRams.max);
    });
});

describe('the happy ghast', () => {
    it('runs both AI systems, and its panic activity carries no behaviors at all', () => {
        const { body, brain } = spawn(HAPPY_GHAST_BRAIN);
        expect(HAPPY_GHAST_BRAIN.alsoRunsGoals).toBe(true);
        brain.setMemory(MemoryModuleTypes.IS_PANICKING, true);
        HAPPY_GHAST_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.PANIC);
        // The panic activity exists only to suppress idle; AnimalPanic in `core` does the flying.
        body.tickBrain();
        expect(brain.getRunningBehaviors().map((control) => control.name)).toContain('AnimalPanic');
    });

    it('follows a player before its own kind, because priority 2 reads the player memory', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(HAPPY_GHAST_BRAIN, {
            world,
            entity: { baby: true }
        });
        const player = world.place('minecraft:player', { x: 6, y: 64, z: 0 });
        world.place(
            'minecraft:happy_ghast',
            { x: 5, y: 64, z: 0 },
            {
                typeTags: ['minecraft:followable_friendly_mobs']
            }
        );
        run(body, HAPPY_GHAST_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.LOOK_TARGET)?.entity).toBe(player);
        expect(HAPPY_GHAST.speedWhenFollowingAdult).toBe(1.1);
    });
});

describe('the hoglin', () => {
    it('fights a player and goes aggressive', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(HOGLIN_BRAIN, { world });
        const player = world.place('minecraft:player', { x: 4, y: 64, z: 0 });
        run(body, HOGLIN_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBe(player);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.FIGHT);
        expect(body.conditions.has(EntityCondition.AGGRESSIVE)).toBe(true);
    });

    it('is pacified by a repellent for REPELLENT_PACIFY_TIME, which is 200', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(HOGLIN_BRAIN, { world });
        world.place('minecraft:player', { x: 4, y: 64, z: 0 });
        world.setBlock({ x: 1, y: 64, z: 0 }, 'minecraft:warped_fungus', ['minecraft:hoglin_repellents']);
        run(body, HOGLIN_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.PACIFIED)).toBe(true);
        expect(brain.getTimeUntilExpiry(MemoryModuleTypes.PACIFIED)).toBeLessThanOrEqual(HOGLIN.repellentPacifyTime);
        expect(brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET)).toBe(false);
    });

    it('flees only when piglins strictly outnumber hoglins, so one on one it stands its ground', () => {
        const { body, brain } = spawn(HOGLIN_BRAIN);
        brain.setMemory(MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT, 1);
        brain.setMemory(MemoryModuleTypes.VISIBLE_ADULT_HOGLIN_COUNT, 0);
        expect(piglinsOutnumberHoglins(body.context)).toBe(false);
        brain.setMemory(MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT, 2);
        expect(piglinsOutnumberHoglins(body.context)).toBe(true);
    });
});

describe('the zoglin', () => {
    it('attacks anything that is neither a zoglin nor a creeper', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(ZOGLIN_BRAIN, { world });
        world.place('minecraft:creeper', { x: 2, y: 64, z: 0 });
        world.place('minecraft:zoglin', { x: 3, y: 64, z: 0 });
        const villager = world.place('minecraft:villager', { x: 4, y: 64, z: 0 });
        run(body, ZOGLIN_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBe(villager);
        expect(ZOGLIN.attackInterval).toBe(40);
        expect(ZOGLIN.babyAttackInterval).toBe(15);
    });
});

describe('the nautilus', () => {
    it('attacks what it is angry at, as long as both are in water', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(NAUTILUS_BRAIN, {
            world,
            entity: { conditions: [EntityCondition.IN_WATER] }
        });
        const diver = world.place(
            'minecraft:player',
            { x: 3, y: 64, z: 0 },
            {
                conditions: [EntityCondition.IN_WATER]
            }
        );
        brain.setMemoryWithExpiry(MemoryModuleTypes.ANGRY_AT, diver.id, NAUTILUS.angerDuration);
        run(body, NAUTILUS_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBe(diver);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.FIGHT);
    });

    it('starts with an attack cooldown drawn from TIME_BETWEEN_NON_PLAYER_ATTACKS, (2400, 3600)', () => {
        const { brain } = spawn(NAUTILUS_BRAIN);
        const cooldown = brain.getMemory(MemoryModuleTypes.ATTACK_TARGET_COOLDOWN) ?? 0;
        expect(cooldown).toBeGreaterThanOrEqual(NAUTILUS.timeBetweenNonPlayerAttacks.min);
        expect(cooldown).toBeLessThanOrEqual(NAUTILUS.timeBetweenNonPlayerAttacks.max);
    });
});

describe('the zombie nautilus', () => {
    it('shares the nautilus target rule but dashes at SPEED_WHEN_ATTACKING, which is 0.5', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(ZOMBIE_NAUTILUS_BRAIN, {
            world,
            entity: { conditions: [EntityCondition.IN_WATER] }
        });
        const diver = world.place(
            'minecraft:player',
            { x: 3, y: 64, z: 0 },
            {
                conditions: [EntityCondition.IN_WATER]
            }
        );
        brain.setMemoryWithExpiry(MemoryModuleTypes.ANGRY_AT, diver.id, NAUTILUS.angerDuration);
        run(body, ZOMBIE_NAUTILUS_BRAIN, 3);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.FIGHT);
        expect(ZOMBIE_NAUTILUS.speedWhenAttacking).toBe(0.5);
        expect(NAUTILUS.speedWhenAttacking).toBe(0.6);
    });
});

describe('the sniffer', () => {
    it('digs once SNIFFER_DIGGING is set, and holds the 9600-tick SNIFF_COOLDOWN afterwards', () => {
        const { body, brain } = spawn(SNIFFER_BRAIN, {
            entity: { conditions: [EntityCondition.CAN_SNIFF, EntityCondition.CAN_DIG] }
        });
        brain.setMemory(MemoryModuleTypes.SNIFFER_DIGGING, true);
        SNIFFER_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.DIG);

        run(body, SNIFFER_BRAIN, SNIFFER.diggingDuration.max + 5);
        expect(brain.getTimeUntilExpiry(MemoryModuleTypes.SNIFF_COOLDOWN)).toBeLessThanOrEqual(
            SNIFFER.sniffingCooldownTicks
        );
    });

    it('searches while it has both a sniffing target and a walk target', () => {
        const { body, brain } = spawn(SNIFFER_BRAIN, { entity: { conditions: [EntityCondition.CAN_SNIFF] } });
        brain.setMemory(MemoryModuleTypes.SNIFFER_SNIFFING_TARGET, { x: 5, y: 64, z: 0 });
        brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
            target: {
                currentPosition: () => ({ x: 5, y: 64, z: 0 }),
                currentBlockPosition: () => ({ x: 5, y: 64, z: 0 })
            },
            speedModifier: SNIFFER.speedWhenSniffing,
            closeEnoughDist: 0
        });
        SNIFFER_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.SNIFF);
    });
});

describe('the piglin', () => {
    it('barters: being given gold holds ADMIRING_ITEM for ADMIRE_DURATION, which is 119', () => {
        const { body, brain } = spawn(PIGLIN_BRAIN);
        const gold = { id: PIGLIN.barterCurrency, tags: new Set(['minecraft:piglin_loved']) };
        expect(canAdmire(body, gold)).toBe(true);
        admireGoldItem(body.context);
        expect(brain.getMemory(MemoryModuleTypes.ADMIRING_ITEM)).toBe(true);
        expect(brain.getTimeUntilExpiry(MemoryModuleTypes.ADMIRING_ITEM)).toBe(119);

        PIGLIN_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.ADMIRE_ITEM);
    });

    it('will not admire while already admiring, or as a baby', () => {
        const { body } = spawn(PIGLIN_BRAIN);
        const gold = { id: PIGLIN.barterCurrency, tags: new Set<string>() };
        admireGoldItem(body.context);
        expect(canAdmire(body, gold)).toBe(false);

        const { body: baby } = spawn(PIGLIN_BRAIN, { entity: { baby: true } });
        expect(canAdmire(baby, gold)).toBe(false);
    });

    it('treats only the gold ingot as barter currency', () => {
        expect(isBarterCurrency({ id: 'minecraft:gold_ingot', tags: new Set() })).toBe(true);
        expect(isBarterCurrency({ id: 'minecraft:gold_block', tags: new Set(['minecraft:piglin_loved']) })).toBe(false);
    });

    it('refuses a repellent and takes a gold ingot only with a free off hand', () => {
        const { body } = spawn(PIGLIN_BRAIN);
        const gold = { id: 'minecraft:gold_ingot', tags: new Set(['minecraft:piglin_loved']) };
        expect(
            wantsToPickUp({ id: 'minecraft:soul_torch', tags: new Set(['minecraft:piglin_repellents']) }, body.context)
        ).toBe(false);
        expect(wantsToPickUp(gold, body.context)).toBe(true);
        body.offHandItem = gold;
        expect(wantsToPickUp(gold, body.context)).toBe(false);
    });

    it('spares a player wearing gold armor and attacks one who is not', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(PIGLIN_BRAIN, { world });
        world.place(
            'minecraft:player',
            { x: 3, y: 64, z: 0 },
            {
                armorItems: [{ id: 'minecraft:golden_boots', tags: new Set(['minecraft:piglin_safe_armor']) }]
            }
        );
        run(body, PIGLIN_BRAIN, 3);
        expect(brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET)).toBe(false);

        const bare = world.place('minecraft:player', { x: 4, y: 64, z: 0 });
        run(body, PIGLIN_BRAIN, 25);
        expect(brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBe(bare);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.FIGHT);
    });

    it('starts with a hunt cooldown drawn from TIME_BETWEEN_HUNTS, which is 30 to 120 seconds', () => {
        const { brain } = spawn(PIGLIN_BRAIN);
        expect(brain.getMemory(MemoryModuleTypes.HUNTED_RECENTLY)).toBe(true);
        const ttl = brain.getTimeUntilExpiry(MemoryModuleTypes.HUNTED_RECENTLY);
        expect(ttl).toBeGreaterThanOrEqual(PIGLIN.timeBetweenHunts.min);
        expect(ttl).toBeLessThanOrEqual(PIGLIN.timeBetweenHunts.max);
    });
});

describe('the piglin brute', () => {
    it('remembers where it spawned as HOME', () => {
        const { brain } = spawn(PIGLIN_BRUTE_BRAIN, { position: { x: 7, y: 70, z: -3 } });
        expect(brain.getMemory(MemoryModuleTypes.HOME)?.pos).toEqual({ x: 7, y: 70, z: -3 });
    });

    it('attacks a player wearing gold armor, because a brute has no gold exemption', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(PIGLIN_BRUTE_BRAIN, { world });
        const armored = world.place(
            'minecraft:player',
            { x: 4, y: 64, z: 0 },
            {
                armorItems: [{ id: 'minecraft:golden_boots', tags: new Set(['minecraft:piglin_safe_armor']) }]
            }
        );
        run(body, PIGLIN_BRUTE_BRAIN, 3);
        expect(brain.getMemory(MemoryModuleTypes.ATTACK_TARGET)).toBe(armored);
        expect(PIGLIN_BRUTE.meleeAttackCooldown).toBe(20);
    });
});

describe('the warden', () => {
    it('escalates through calm, agitated and angry at the AngerLevel minimums 0, 40 and 80', () => {
        expect(angerLevelByAnger(0)).toBe('calm');
        expect(angerLevelByAnger(39)).toBe('calm');
        expect(angerLevelByAnger(40)).toBe('agitated');
        expect(angerLevelByAnger(79)).toBe('agitated');
        expect(angerLevelByAnger(80)).toBe('angry');
    });

    it('needs three default disturbances to become angry, because DEFAULT_ANGER is 35', () => {
        const world = new TestWorld();
        const suspect = world.place('minecraft:player', { x: 3, y: 64, z: 0 });
        const anger = new AngerManagement(() => true);
        expect(angerLevelByAnger(anger.increaseAnger(suspect, WARDEN.defaultAnger))).toBe('calm');
        expect(angerLevelByAnger(anger.increaseAnger(suspect, WARDEN.defaultAnger))).toBe('agitated');
        expect(angerLevelByAnger(anger.increaseAnger(suspect, WARDEN.defaultAnger))).toBe('angry');
    });

    it('clamps anger at MAX_ANGER, which is 150', () => {
        const world = new TestWorld();
        const suspect = world.place('minecraft:player', { x: 3, y: 64, z: 0 });
        const anger = new AngerManagement(() => true);
        expect(anger.increaseAnger(suspect, 1000)).toBe(150);
    });

    it('decays by one a tick and drops a suspect once its anger runs out', () => {
        const world = new TestWorld();
        const suspect = world.place('minecraft:player', { x: 3, y: 64, z: 0 });
        const anger = new AngerManagement(() => true);
        anger.increaseAnger(suspect, 3);
        anger.tick();
        expect(anger.getActiveAnger(suspect)).toBe(2);
        anger.tick();
        expect(anger.getActiveAnger(suspect)).toBe(1);
        anger.tick();
        expect(anger.getActiveEntity()).toBeUndefined();
    });

    it('prefers the player over the mob at the same anger band', () => {
        const world = new TestWorld();
        const mob = world.place('minecraft:zombie', { x: 1, y: 64, z: 0 });
        const player = world.place('minecraft:player', { x: 9, y: 64, z: 0 });
        const anger = new AngerManagement(() => true);
        anger.increaseAnger(mob, 100);
        anger.increaseAnger(player, 90);
        expect(anger.getActiveEntity()).toBe(player);
    });

    it('investigates a vibration, with the 100-tick DISTURBANCE_LOCATION_EXPIRY_TIME', () => {
        const { body, brain } = spawn(WARDEN_BRAIN);
        setDisturbanceLocation(body.context, { x: 10, y: 64, z: 0 });
        expect(brain.getMemory(MemoryModuleTypes.DISTURBANCE_LOCATION)).toEqual({ x: 10, y: 64, z: 0 });
        expect(brain.getTimeUntilExpiry(MemoryModuleTypes.DISTURBANCE_LOCATION)).toBe(
            WARDEN.disturbanceLocationExpiryTime
        );
        WARDEN_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.INVESTIGATE);
    });

    it('ignores a vibration while it already has an attack target', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(WARDEN_BRAIN, { world });
        const target: BrainEntity = world.place('minecraft:player', { x: 3, y: 64, z: 0 });
        brain.setMemory(MemoryModuleTypes.ATTACK_TARGET, target);
        setDisturbanceLocation(body.context, { x: 10, y: 64, z: 0 });
        expect(brain.hasMemoryValue(MemoryModuleTypes.DISTURBANCE_LOCATION)).toBe(false);
    });

    it('emerges before anything else when IS_EMERGING holds', () => {
        const { body, brain } = spawn(WARDEN_BRAIN);
        brain.setMemoryWithExpiry(MemoryModuleTypes.IS_EMERGING, UNIT, WARDEN.emergeDuration);
        WARDEN_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.EMERGE);
        expect(WARDEN.emergeDuration).toBe(134);
        expect(WARDEN.roarDuration).toBe(84);
    });

    it('roars before fighting, which is its only way into a fight', () => {
        const world = new TestWorld();
        const { body, brain } = spawn(WARDEN_BRAIN, { world });
        const target: BrainEntity = world.place('minecraft:player', { x: 3, y: 64, z: 0 });
        brain.setMemory(MemoryModuleTypes.ROAR_TARGET, target);
        WARDEN_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.ROAR);
    });
});

describe('the camel and the happy ghast, the two mobs that run both AI systems', () => {
    /**
     * A stand-in for the Bedrock goal scheduler in `@jsprismarine/entity-goals`.
     *
     * It holds the same three control flags that package's scheduler does, and it records what it
     * ran, which is enough to show that the two systems tick side by side without either stopping
     * the other.
     */
    class GoalSchedulerDouble {
        public readonly ran: string[] = [];
        private readonly goals: { name: string; flags: readonly string[] }[] = [];

        public add(name: string, flags: readonly string[]): void {
            this.goals.push({ name, flags });
        }

        public tick(): void {
            const held = new Set<string>();
            for (const goal of this.goals) {
                if (goal.flags.some((flag) => held.has(flag))) {
                    continue;
                }
                for (const flag of goal.flags) {
                    held.add(flag);
                }
                this.ran.push(goal.name);
            }
        }
    }

    it('ticks the camel brain and the goal scheduler in the same tick', () => {
        const { body, brain } = spawn(CAMEL_BRAIN, { entity: { conditions: [EntityCondition.ON_GROUND] } });
        const goals = new GoalSchedulerDouble();
        goals.add('minecraft:behavior.float', ['move']);
        goals.add('minecraft:behavior.look_at_player', ['look']);

        for (let tick = 0; tick < 3; tick++) {
            CAMEL_BRAIN.updateActivity(body.context);
            body.tickBrain();
            goals.tick();
        }

        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
        expect(goals.ran).toHaveLength(6);
        expect(CAMEL_BRAIN.alsoRunsGoals).toBe(true);
    });

    it('ticks the happy ghast brain and the goal scheduler in the same tick', () => {
        const { body, brain } = spawn(HAPPY_GHAST_BRAIN);
        const goals = new GoalSchedulerDouble();
        goals.add('minecraft:behavior.float', ['move']);

        for (let tick = 0; tick < 3; tick++) {
            HAPPY_GHAST_BRAIN.updateActivity(body.context);
            body.tickBrain();
            goals.tick();
        }

        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
        expect(goals.ran).toHaveLength(3);
        expect(HAPPY_GHAST_BRAIN.alsoRunsGoals).toBe(true);
    });

    it('is the only two, so no other mob needs both schedulers', () => {
        const dual = [CAMEL_BRAIN, HAPPY_GHAST_BRAIN].map((mob) => mob.id);
        expect(dual).toEqual(['minecraft:camel', 'minecraft:happy_ghast']);
    });
});

describe('the villager', () => {
    it('goes to work when the schedule says 2000 and it has a job site', () => {
        const world = new TestWorld({ dayTime: 1000 });
        world.addPoi({ x: 2, y: 64, z: 0 }, 'minecraft:farmer');
        const { body, brain } = spawn(VILLAGER_BRAIN, { world, brain: { variant: 'minecraft:farmer' } });
        run(body, VILLAGER_BRAIN, 40);
        expect(brain.getMemory(MemoryModuleTypes.JOB_SITE)?.pos).toEqual({ x: 2, y: 64, z: 0 });

        world.dayTimeTicks = 2000;
        world.time += 100;
        VILLAGER_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.WORK);
    });

    it('stays idle at 2000 when it never acquired a job site', () => {
        const world = new TestWorld({ dayTime: 2000, gameTime: 1000 });
        const { body, brain } = spawn(VILLAGER_BRAIN, { world });
        VILLAGER_BRAIN.updateActivity(body.context);
        expect(brain.hasMemoryValue(MemoryModuleTypes.JOB_SITE)).toBe(false);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.IDLE);
    });

    it('rests at 12000 and meets at 9000 when it has a meeting point', () => {
        const world = new TestWorld({ dayTime: 9000, gameTime: 1000 });
        world.addPoi({ x: 2, y: 64, z: 0 }, 'minecraft:meeting');
        const { body, brain } = spawn(VILLAGER_BRAIN, { world });
        run(body, VILLAGER_BRAIN, 40);
        expect(brain.hasMemoryValue(MemoryModuleTypes.MEETING_POINT)).toBe(true);
        world.dayTimeTicks = 9000;
        world.time += 100;
        VILLAGER_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.MEET);

        world.dayTimeTicks = 12000;
        world.time += 100;
        VILLAGER_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.REST);
    });

    it('a baby plays at 3000 and never works', () => {
        const world = new TestWorld({ dayTime: 3000, gameTime: 1000 });
        const { body, brain } = spawn(VILLAGER_BRAIN, { world, entity: { baby: true }, brain: { baby: true } });
        VILLAGER_BRAIN.updateActivity(body.context);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.PLAY);
    });

    it('panics when a zombie comes within the villager hostile distance of 8', () => {
        const world = new TestWorld({ dayTime: 2000 });
        const { body, brain } = spawn(VILLAGER_BRAIN, { world });
        world.place('minecraft:zombie', { x: 5, y: 64, z: 0 });
        run(body, VILLAGER_BRAIN, 25);
        expect(brain.hasMemoryValue(MemoryModuleTypes.NEAREST_HOSTILE)).toBe(true);
        expect(brain.getActiveNonCoreActivity()).toBe(Activities.PANIC);
    });

    it('only claims a bed once, so two villagers cannot share it', () => {
        const world = new TestWorld({ dayTime: 12000 });
        world.addPoi({ x: 2, y: 64, z: 0 }, 'minecraft:home');
        const first = spawn(VILLAGER_BRAIN, { world });
        run(first.body, VILLAGER_BRAIN, 30);
        const second = spawn(VILLAGER_BRAIN, { world });
        run(second.body, VILLAGER_BRAIN, 30);
        expect(first.brain.hasMemoryValue(MemoryModuleTypes.HOME)).toBe(true);
        expect(second.brain.hasMemoryValue(MemoryModuleTypes.HOME)).toBe(false);
    });

    it('builds every package with the 0.5 base speed modifier', () => {
        expect(VILLAGER.baseSpeedModifier).toBe(0.5);
        expect(VILLAGER_SCHEDULE.periodTicks).toBe(24000);
    });
});
