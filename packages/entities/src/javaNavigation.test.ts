import { describe, expect, it } from 'vitest';

import type { JavaEntityNavigation, JavaNavigationSource } from './javaNavigation';
import { javaEntityNavigation } from './javaNavigation';

/** A flying Java mob row, used to contrast it with the ground mob. */
const wither: JavaEntityNavigation = {
    navigationClass: 'net.minecraft.world.entity.ai.navigation.FlyingPathNavigation',
    canFloat: true,
    canNavigateGround: false,
    pushable: true,
    pathfindingMalus: { water: 8 }
};

/** Two Java mob rows with deliberately different path settings. */
const source: JavaNavigationSource = {
    'minecraft:zombified_piglin': {
        navigationClass: 'net.minecraft.world.entity.ai.navigation.GroundPathNavigation',
        canFloat: true,
        canNavigateGround: true,
        pushable: true,
        pathfindingMalus: { water: 8 }
    },
    'minecraft:wither': wither
};

describe('javaEntityNavigation', () => {
    it('reads the same Java identifier directly', () => {
        expect(javaEntityNavigation('minecraft:wither', source)).toBe(source['minecraft:wither']);
    });

    it('resolves a Bedrock legacy identifier through the Java mapping', () => {
        expect(javaEntityNavigation('minecraft:zombie_pigman', source)).toBe(source['minecraft:zombified_piglin']);
    });

    it('leaves a Bedrock identifier with multiple Java types unresolved', () => {
        const boats: JavaNavigationSource = {
            'minecraft:oak_boat': wither,
            'minecraft:birch_boat': wither
        };

        expect(javaEntityNavigation('minecraft:boat', boats)).toBeUndefined();
    });

    it('answers nothing when Java data is absent', () => {
        expect(javaEntityNavigation('minecraft:wither', undefined)).toBeUndefined();
    });
});
