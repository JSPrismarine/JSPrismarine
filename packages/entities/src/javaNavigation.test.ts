import { describe, expect, it } from 'vitest';

import type { JavaEntityNavigation, JavaNavigationSource } from './javaNavigation';
import { JAVA_MOVE_CONTROL_TURN, javaEntityNavigation, javaMoveControlTurn } from './javaNavigation';

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

describe('javaMoveControlTurn', () => {
    const withControl = (moveControlClass: string, maxTurnY?: number): JavaEntityNavigation => ({
        ...wither,
        moveControlClass,
        ...(maxTurnY === undefined ? {} : { maxTurnY })
    });

    it("turns a mob by MoveControl's 90 degrees, and a flyer by FlyingMoveControl's", () => {
        expect(javaMoveControlTurn(withControl('net.minecraft.world.entity.ai.control.MoveControl'))).toBe(90);
        expect(javaMoveControlTurn(withControl('net.minecraft.world.entity.ai.control.FlyingMoveControl'))).toBe(
            JAVA_MOVE_CONTROL_TURN
        );
    });

    it('turns a smooth swimmer by its own maxTurnY', () => {
        expect(
            javaMoveControlTurn(withControl('net.minecraft.world.entity.ai.control.SmoothSwimmingMoveControl', 10))
        ).toBe(10);
    });

    it('leaves the vex, phantom and ghast to set their own heading', () => {
        expect(
            javaMoveControlTurn(withControl('net.minecraft.world.entity.monster.Vex$VexMoveControl'))
        ).toBeUndefined();
        expect(javaMoveControlTurn(wither)).toBeUndefined();
    });
});
