import { JavaHand } from '@jsprismarine/protocol/java/packet/play';
import { describe, expect, it } from 'vitest';

import { javaUseItemOnIntentOf } from './javaUseItemOn';

const use = (hand: JavaHand) => ({
    hand,
    position: { x: 1, y: -61, z: -2 },
    face: 1,
    cursorX: 0.5,
    cursorY: 1,
    cursorZ: 0.25,
    inside: false,
    worldBorderHit: false,
    sequence: 9
});

describe('javaUseItemOnIntentOf', () => {
    it('decodes a main hand use into the block, the face and where on it', () => {
        expect(javaUseItemOnIntentOf(use(JavaHand.Main))).toEqual({
            kind: 'useItemOnBlock',
            position: { x: 1, y: -61, z: -2 },
            face: 1,
            faceLocation: { x: 0.5, y: 1, z: 0.25 }
        });
    });

    it("decodes no off hand use, which would place the main hand's block a second time", () => {
        expect(javaUseItemOnIntentOf(use(JavaHand.Off))).toBeUndefined();
    });
});
