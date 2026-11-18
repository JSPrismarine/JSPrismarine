import { describe, expect, it } from 'vitest';

import Codec2193 from './Codec2193';
import Codec2225 from './Codec2225';
import { isMissingVanillaActor } from './actorTypes';

describe('network/codec/actorTypes', () => {
    it('hides an actor type 1.26.60 added from a 1.26.51 session only', () => {
        expect(isMissingVanillaActor(Codec2193.context, 'minecraft:ice_ball')).toBe(true);
        expect(isMissingVanillaActor(Codec2225.context, 'minecraft:ice_ball')).toBe(false);
    });

    it('shows a type every release has, and a pack type no release lists', () => {
        expect(isMissingVanillaActor(Codec2193.context, 'minecraft:pig')).toBe(false);
        expect(isMissingVanillaActor(Codec2193.context, 'example:dragonfly')).toBe(false);
    });
});
