import { BehaviorRegistry } from '@jsprismarine/content';
import { describe, expect, it } from 'vitest';

import { ItemStack } from './ItemStack';
import { createItemComponentRegistry } from './components/catalog';
import { defineItemComponent } from './components/define';
import type { ItemHooks, ItemSource, ItemUseEvent, ItemUseOnEvent } from './hooks';
import { ITEM_HOOKS } from './hooks';
import { loadItemTypes } from './itemTypes';
import { bool } from './schema';
import { itemDefinition } from './definitions';

const player: ItemSource = { identifier: 'minecraft:player', runtimeId: 1 };

/** Records which contributor ran, so a test can assert dispatch order. */
const calls: string[] = [];

const recordingComponent = (name: string) =>
    defineItemComponent({
        name,
        hooks: ['onUse', 'onMineBlock'],
        schema: bool,
        create: (enabled) =>
            enabled
                ? {
                      onUse: () => {
                          calls.push(name);
                          return undefined;
                      },
                      onMineBlock: () => {
                          calls.push(name);
                      }
                  }
                : {}
    });

const first = recordingComponent('test:first');
const second = recordingComponent('test:second');

const components = createItemComponentRegistry([first, second]);

const behaviors = new BehaviorRegistry<ItemHooks>();
behaviors.register({
    name: 'test:behavior',
    hooks: ['onUse', 'onUseOn'],
    create: () => ({
        onUse: () => {
            calls.push('test:behavior');
            return { cooldownTicks: 20 };
        },
        onUseOn: (event: ItemUseOnEvent) => ({ stack: event.itemStack })
    })
});
behaviors.attach('test:behavior', 'minecraft:stick');

const { registry } = loadItemTypes({
    components,
    behaviors,
    strict: true,
    definitions: [
        itemDefinition('minecraft:stick', {
            'minecraft:max_stack_size': 64,
            'test:first': true,
            'test:second': true
        }),
        itemDefinition('minecraft:apple', { 'minecraft:max_stack_size': 64, 'test:second': false })
    ]
});

const stackOf = (identifier: string) => new ItemStack(registry.holder(identifier));
const useEvent = (itemStack: ItemStack): ItemUseEvent => ({ itemStack, source: player, useDuration: 0 });

describe('the item hook seam', () => {
    it('names the seven hooks Mojang names', () => {
        expect([...ITEM_HOOKS]).toEqual([
            'onUse',
            'onUseOn',
            'onMineBlock',
            'onHitEntity',
            'onBeforeDurabilityDamage',
            'onCompleteUse',
            'onConsume'
        ]);
    });

    it('dispatches components in definition order, then behaviors in attachment order', () => {
        calls.length = 0;
        const stack = stackOf('minecraft:stick');
        stack.dispatch('onUse', useEvent(stack));
        expect(calls).toEqual(['test:first', 'test:second', 'test:behavior']);
        expect(stack.type.hooks.contributors('onUse')).toEqual(['test:first', 'test:second', 'test:behavior']);
    });

    it('stops at the first handler that returns a result', () => {
        calls.length = 0;
        const stack = stackOf('minecraft:stick');
        expect(stack.dispatchFirst('onUse', useEvent(stack))).toEqual({ cooldownTicks: 20 });
        expect(calls).toEqual(['test:first', 'test:second', 'test:behavior']);
    });

    it('binds no handler for a component whose parameters implement none', () => {
        const apple = stackOf('minecraft:apple');
        expect(apple.type.hooks.has('onUse')).toBe(false);
        expect(apple.type.hooks.handlers('onUse')).toEqual([]);
    });

    it('reaches only the hooks a contributor declares', () => {
        const stack = stackOf('minecraft:stick');
        expect(stack.type.hooks.contributors('onMineBlock')).toEqual(['test:first', 'test:second']);
        expect(stack.type.hooks.contributors('onUseOn')).toEqual(['test:behavior']);
        expect(stack.type.hooks.contributors('onConsume')).toEqual([]);
    });

    it('lets a use hook hand back the stack to put in the slot', () => {
        const stack = stackOf('minecraft:stick');
        const result = stack.dispatchFirst('onUseOn', {
            ...useEvent(stack),
            block: { identifier: 'minecraft:stone', states: {}, position: { x: 0, y: 0, z: 0 } },
            blockFace: 'up',
            faceLocation: { x: 0.5, y: 1, z: 0.5 }
        });
        expect(result?.stack).toBe(stack);
    });
});
