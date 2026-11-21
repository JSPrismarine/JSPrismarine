import { describe, expect, it } from 'vitest';

import type { EntityPosition } from '@jsprismarine/entities';
import { vanillaItemDefinitions } from '@jsprismarine/items';

import { blockDelayTicks, blockedDamage, blockingAngle, disableTicks, strongKnockback } from './itemBlocking';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const GROUND = { x: 0, y: FLOOR_Y + 1, z: 0 };
const PLAYER = 500;
/** Facing -x: Java's look is (-sin(yaw), cos(yaw)). */
const FACING_WEST = 90;

describe("Java's LivingEntity.applyItemBlocking", () => {
    it('measures the angle off the look to where the blow came from, and π for a blow from nowhere', () => {
        expect(blockingAngle(GROUND, FACING_WEST, { ...GROUND, x: -2 })).toBeCloseTo(0);
        expect(blockingAngle(GROUND, FACING_WEST, { ...GROUND, z: 2 })).toBeCloseTo(Math.PI / 2);
        expect(blockingAngle(GROUND, FACING_WEST, { ...GROUND, x: 2 })).toBeCloseTo(Math.PI);
        expect(blockingAngle(GROUND, FACING_WEST, undefined)).toBe(Math.PI);
    });

    it('blocks the whole blow within 90 degrees by default, and what each reduction takes of it otherwise', () => {
        expect(blockedDamage({}, 6, Math.PI / 2, () => true)).toBe(6);
        expect(blockedDamage({}, 6, Math.PI / 2 + 0.01, () => true)).toBe(0);
        const reductions = [
            { base: 1, factor: 0.25, horizontal_blocking_angle: 180 },
            { type: { kind: 'tag', tag: 'minecraft:is_explosion' } as const, base: 10, factor: 0 }
        ];
        expect(blockedDamage({ damage_reductions: reductions }, 8, Math.PI, () => false)).toBe(3);
        expect(blockedDamage({ damage_reductions: reductions }, 8, 0, () => true)).toBe(8);
    });

    it("counts Java's delay and disable times in ticks, and Ravager.strongKnockback over the squared distance", () => {
        expect(blockDelayTicks(0.25)).toBe(5);
        expect(blockDelayTicks(undefined)).toBe(0);
        expect(disableTicks(5, undefined)).toBe(100);
        expect(disableTicks(5, 0.5)).toBe(50);
        expect(disableTicks(0, 1)).toBe(0);
        expect(strongKnockback(GROUND, { ...GROUND, x: 2 })).toEqual({ x: 2, y: 0.2, z: 0 });
    });
});

/** A store player with a shield in the off hand, facing west, and the runtime around it. */
const shieldBearer = (random: readonly number[] = [0.5]) => {
    const world = new TestEntityWorld({ random });
    const fixture = entityFixture(
        world,
        {
            itemDefinitions: vanillaItemDefinitions().filter((definition) =>
                ['minecraft:shield', 'minecraft:iron_axe'].includes(definition.identifier)
            )
        },
        {
            'minecraft:ravager': {
                components: {
                    'minecraft:health': { value: 100, max: 100 },
                    'minecraft:attack': { damage: 12 },
                    'minecraft:collision_box': { width: 1.95, height: 2.2 },
                    'minecraft:ravager_blocked': {
                        knockback_strength: 3,
                        reaction_choices: [
                            { weight: 1, value: { event: 'minecraft:become_stunned', target: 'self' } },
                            { weight: 1 }
                        ]
                    }
                },
                component_groups: { stunned: { 'minecraft:is_stunned': {} } },
                events: { 'minecraft:become_stunned': { add: { component_groups: ['stunned'] } } }
            },
            'minecraft:arrow': { components: { 'minecraft:collision_box': { width: 0.25, height: 0.25 } } }
        }
    );
    const player = fixture.runtime.spawnPlayer(PLAYER, GROUND);
    if (player === undefined) throw new Error('the fixture declares no player');
    player.body.setEquipment({ offhand: { identifier: 'minecraft:shield', count: 1 } });
    player.body.yaw = FACING_WEST;
    // The client owns a player's movement, so a push reaches it as an impulse it is sent.
    const impulses: EntityPosition[] = [];
    const send = player.body.onImpulse;
    player.body.onImpulse = (impulse) => {
        impulses.push(impulse);
        send?.(impulse);
    };
    const health = () => player.instance.attributes.get('health')?.current ?? 0;
    const raise = (ticks: number) => {
        fixture.runtime.playerSystems.setSneaking(player, true);
        world.advance(ticks);
    };
    const hit = (identifier: string, at = { ...GROUND, x: -1.5 }, amount?: number) => {
        const attacker = fixture.runtime.spawn(identifier, at);
        if (attacker === undefined) throw new Error(`the fixture declares no ${identifier}`);
        fixture.runtime.attack(attacker.body, fixture.runtime.mobById(PLAYER)!, amount);
        return attacker;
    };
    const axeBlow = () => {
        const axeman = fixture.runtime.spawn('minecraft:cow', { ...GROUND, x: -1.5 });
        if (axeman === undefined) throw new Error('the fixture declares no cow');
        axeman.body.setEquipment({ mainhand: { identifier: 'minecraft:iron_axe', count: 1 } });
        fixture.runtime.attack(axeman.body, fixture.runtime.mobById(PLAYER)!, 4);
    };
    const pass = (ticks: number) => {
        for (let tick = 0; tick < ticks; tick += 1) {
            world.advance(1);
            fixture.runtime.tick(world.world.level.gameTime());
        }
    };
    /** An arrow from in front, fired from a crossbow with `piercing` levels of Piercing. */
    const shoot = (piercing: number) => {
        const arrow = fixture.runtime.spawn('minecraft:arrow', { ...GROUND, x: -1.5 }, { data: { piercing } });
        if (arrow === undefined) throw new Error('the fixture declares no arrow');
        return fixture.runtime.damage({
            target: PLAYER,
            projectile: arrow.id,
            cause: 'projectile',
            amount: 4,
            source: { route: 'component', graced: true }
        });
    };
    return { ...fixture, world, player, impulses, health, raise, hit, axeBlow, pass, shoot };
};

describe('a raised shield in the entity runtime', () => {
    it('turns a blow from the front aside once its block delay has passed, and wears for what it blocked', () => {
        const early = shieldBearer();
        early.raise(4);
        const before = early.health();
        early.hit('minecraft:cow', undefined, 4);
        expect(early.health()).toBeLessThan(before);

        const raised = shieldBearer();
        raised.raise(5);
        const full = raised.health();
        raised.hit('minecraft:cow', undefined, 4);
        expect(raised.health()).toBe(full);
        // `item_damage`: 1 + 1 * 4, past its threshold of 3.
        expect(raised.player.body.equipment.offhand?.damage).toBe(5);
        // A blow taken whole pushes nothing.
        expect(raised.impulses).toEqual([]);
    });

    it('blocks nothing from behind, nor for a player that is not sneaking', () => {
        const behind = shieldBearer();
        behind.raise(10);
        const before = behind.health();
        behind.hit('minecraft:cow', { ...GROUND, x: 1.5 }, 4);
        expect(behind.health()).toBeLessThan(before);

        const lowered = shieldBearer();
        lowered.world.advance(10);
        const full = lowered.health();
        lowered.hit('minecraft:cow', undefined, 4);
        expect(lowered.health()).toBeLessThan(full);
    });

    it("is disabled for five seconds by an axe's blow it blocked, as Player.blockUsingItem does", () => {
        const bearer = shieldBearer();
        bearer.raise(10);
        const full = bearer.health();
        bearer.axeBlow();
        expect(bearer.health()).toBe(full);
        // `ItemCooldowns.addCooldown` tells the client, which greys the shield out.
        expect(bearer.world.itemCooldowns).toEqual([{ id: PLAYER, category: 'shield', ticks: 100 }]);

        // Once the blow's grace period is over, the next lands, and after 100 ticks the shield is back.
        bearer.pass(20);
        bearer.hit('minecraft:cow', undefined, 6);
        const hurt = bearer.health();
        expect(hurt).toBeLessThan(full);
        bearer.pass(100);
        const healed = bearer.health();
        bearer.hit('minecraft:cow', undefined, 6);
        expect(bearer.health()).toBe(healed);
    });

    it("is disabled by an axe's blow inside the grace period, which hurtServer checks after the shield", () => {
        const bearer = shieldBearer();
        bearer.raise(10);
        const full = bearer.health();
        bearer.hit('minecraft:cow', undefined, 4);
        // The grace period of the first blow turns the axe away, but the shield has met it first.
        bearer.axeBlow();
        expect(bearer.health()).toBe(full);
        expect(bearer.world.itemCooldowns).toEqual([{ id: PLAYER, category: 'shield', ticks: 100 }]);

        bearer.pass(20);
        bearer.hit('minecraft:cow', undefined, 6);
        expect(bearer.health()).toBeLessThan(full);
    });

    it('lets a harder blow inside the grace period through for what got past the shield before', () => {
        const bearer = shieldBearer();
        bearer.raise(10);
        const full = bearer.health();
        // Taken whole, so the grace period measures against nothing that got through.
        bearer.hit('minecraft:cow', undefined, 4);
        bearer.runtime.playerSystems.setSneaking(bearer.player, false);
        bearer.hit('minecraft:cow', undefined, 3);
        expect(bearer.health()).toBe(full - 3);
    });

    it('lets an arrow with Piercing past it, as AbstractArrow.getPierceLevel decides', () => {
        const plain = shieldBearer();
        plain.raise(10);
        const full = plain.health();
        plain.shoot(0);
        expect(plain.health()).toBe(full);

        const piercing = shieldBearer();
        piercing.raise(10);
        piercing.shoot(1);
        expect(piercing.health()).toBeLessThan(full);
    });

    it('stuns a blocked ravager by its minecraft:ravager_blocked, or throws the defender back', () => {
        const stunned = shieldBearer([0.1]);
        stunned.raise(10);
        const full = stunned.health();
        const ravager = stunned.hit('minecraft:ravager');
        expect(stunned.health()).toBe(full);
        stunned.runtime.tick(1);
        expect(ravager.instance.hasComponent('minecraft:is_stunned')).toBe(true);

        const thrown = shieldBearer([0.9]);
        thrown.raise(10);
        const other = thrown.hit('minecraft:ravager');
        thrown.runtime.tick(1);
        expect(other.instance.hasComponent('minecraft:is_stunned')).toBe(false);
        // Ravager.strongKnockback: 4 / 1.5 away from it, and 0.2 up.
        expect(thrown.impulses).toHaveLength(1);
        expect(thrown.impulses[0]?.x).toBeCloseTo(4 / 1.5);
        expect(thrown.impulses[0]?.y).toBeCloseTo(0.2);
    });
});
