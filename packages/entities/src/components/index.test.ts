import { ComponentRegistry } from '@jsprismarine/content';
import { describe, expect, it } from 'vitest';

import type { EntityHooks } from '../hooks';
import { createEntityComponentRegistry, registerEntityComponents } from '../components';

/** A registry that records each name the package asks about after a factory already took it. */
class ClaimRecorder extends ComponentRegistry<EntityHooks> {
    public readonly claimedTwice: string[] = [];

    public override has(name: string): boolean {
        const taken = super.has(name);
        if (taken) this.claimedTwice.push(name);
        return taken;
    }
}

describe('registerEntityComponents', () => {
    it('offers each component name once, so no factory is skipped for an earlier one', () => {
        const registry = new ClaimRecorder();
        registerEntityComponents(registry);

        expect(registry.claimedTwice).toEqual([]);
    });

    it('runs the status effect components through their own factories', () => {
        const registry = createEntityComponentRegistry();

        expect([...registry.hooksOf('minecraft:mob_effect')]).toEqual(['onInitialize', 'onTick']);
        expect([...registry.hooksOf('minecraft:spell_effects')]).toEqual(['onInitialize']);
    });
});
