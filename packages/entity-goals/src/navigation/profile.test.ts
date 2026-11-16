import { describe, expect, it } from 'vitest';

import { GoalHarness } from '../harness';

import type { NavigationSource } from './profile';
import { navigationProfile } from './profile';

describe('navigationProfile', () => {
    it('keeps string and named block entries while skipping invalid values', () => {
        const entity = new GoalHarness({
            goals: {},
            components: {
                'minecraft:navigation.walk': {
                    blocks_to_avoid: ['minecraft:cactus', { name: 'minecraft:lava' }, 12, { name: 12 }]
                }
            }
        }).entity;

        expect(navigationProfile(entity).blocksToAvoid).toEqual(['minecraft:cactus', 'minecraft:lava']);
    });

    it('keeps one named block entry', () => {
        const entity = new GoalHarness({
            goals: {},
            components: {
                'minecraft:navigation.walk': { blocks_to_avoid: { name: 'minecraft:cactus' } }
            }
        }).entity;

        expect(navigationProfile(entity).blocksToAvoid).toEqual(['minecraft:cactus']);
    });

    it('passes open doors as the pinned Java navigator does, not as the Bedrock flag says', () => {
        const fish: NavigationSource = {
            componentSetToken: {},
            componentParams: (name) => (name === 'minecraft:navigation.generic' ? { canPassDoors: true } : undefined),
            hasComponent: () => false,
            javaNavigation: {
                navigationClass: 'net.minecraft.world.entity.ai.navigation.WaterBoundPathNavigation',
                canFloat: false,
                canNavigateGround: false,
                canPassDoors: false,
                pushable: true,
                pathfindingMalus: {}
            }
        };

        expect(navigationProfile(fish).canPassDoors).toBe(false);
    });

    it("opens closed doors only as the Java navigator does, and breaks them only with Bedrock's break_door", () => {
        const zombie = (annotated: boolean): NavigationSource => ({
            componentSetToken: {},
            componentParams: (name) =>
                name === 'minecraft:navigation.walk'
                    ? { canOpenDoors: true, canBreakDoors: true }
                    : name === 'minecraft:collision_box'
                      ? { width: 0.6, height: 1.9 }
                      : undefined,
            hasComponent: (name) => annotated && name === 'minecraft:annotation.break_door',
            javaNavigation: {
                navigationClass: 'net.minecraft.world.entity.ai.navigation.GroundPathNavigation',
                canFloat: true,
                canNavigateGround: true,
                canOpenDoors: false,
                pushable: true,
                pathfindingMalus: {}
            }
        });

        expect(navigationProfile(zombie(false))).toMatchObject({ canOpenDoors: false, canBreakDoors: false });
        expect(navigationProfile(zombie(true))).toMatchObject({ canOpenDoors: false, canBreakDoors: true });
    });

    it("sizes path cells by Java's floor(width + 1)", () => {
        const sized = (width: number): NavigationSource => ({
            componentSetToken: {},
            componentParams: (name) =>
                name === 'minecraft:navigation.walk'
                    ? {}
                    : name === 'minecraft:collision_box'
                      ? { width, height: 1.6 }
                      : undefined,
            hasComponent: () => false,
            javaNavigation: undefined
        });

        expect([0.6, 0.99, 1, 1.4, 1.95].map((width) => navigationProfile(sized(width)).width)).toEqual([
            1, 1, 2, 2, 2
        ]);
        // A foal's hitbox is half its parent's, as Java scales getBbWidth.
        const foal: NavigationSource = {
            ...sized(1.4),
            componentParams: (name) => (name === 'minecraft:scale' ? 0.5 : sized(1.4).componentParams(name))
        };
        expect(navigationProfile(foal).width).toBe(1);
    });
});
