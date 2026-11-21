import { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { describe, expect, it } from 'vitest';

import { PlayerComponents } from './playerComponents';
import { hungerOutcome } from './playerHunger';
import type { SurvivalPlayer } from './survivalPlayer';

const playerAt = (health: number, food: number, saturation: number): SurvivalPlayer => {
    const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
    components.set('vitals.food', food);
    components.set('vitals.saturation', saturation);
    return { components, vulnerable: () => true, alive: () => true, health: () => health, maxHealth: () => 20 };
};

/** What the clock heals over a span of ticks. */
const healedOver = (player: SurvivalPlayer, ticks: number): number => {
    let healed = 0;
    for (let tick = 1; tick <= ticks; tick++) {
        const outcome = hungerOutcome(player, tick, true, 'normal');
        if (outcome?.kind === 'regenerate') healed += outcome.amount;
    }
    return healed;
};

describe('hungerOutcome', () => {
    it('heals a full, saturated bar a sixth of its saturation every ten ticks', () => {
        // Java's FoodData.tick: 5 saturation heals 5 / 6 every 10 ticks, eight times in 80.
        const outcome = hungerOutcome(playerAt(10, 20, 5), 10, true, 'normal');

        expect(outcome).toEqual({ kind: 'regenerate', amount: 5 / 6, exhaustion: 5 });
        expect(healedOver(playerAt(10, 20, 5), 80)).toBeCloseTo((8 * 5) / 6, 10);
    });

    it('spends at most six saturation on one fast heal', () => {
        expect(hungerOutcome(playerAt(10, 20, 15), 10, true, 'normal')).toEqual({
            kind: 'regenerate',
            amount: 1,
            exhaustion: 6
        });
    });

    it('heals one every 80 ticks once the saturation is gone', () => {
        expect(healedOver(playerAt(10, 20, 0), 80)).toBe(1);
        expect(healedOver(playerAt(10, 18, 5), 80)).toBe(1);
    });

    it('heals nothing with natural regeneration off', () => {
        expect(hungerOutcome(playerAt(10, 20, 5), 10, false, 'normal')).toBeUndefined();
    });
});
