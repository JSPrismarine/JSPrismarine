/**
 * `minecraft:bribeable`, the dolphin's fish.
 *
 * Java's `Dolphin.mobInteract` eats any item of the `fishes` tag a player offers a grown dolphin
 * and sets `gotFish`, and `DolphinSwimToTreasureGoal` runs only while it is set, clearing it when
 * the swim ends. A baby eats the fish to grow instead, which Bedrock writes in the baby's own
 * group, so this component is on adults alone.
 */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';

import { defineComponentState, stateField } from '../componentState';
import type { EntityInstance } from '../entityInstance';
import type { EntityHooks } from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import { asList, isRecord, numberAt } from './schemas';
import { normalizedItemIdentifier } from './shared';

/** What `minecraft:bribeable` declares. */
export interface BribeableParams {
    /** Items that bribe the entity, namespaced. */
    readonly items: readonly string[];
    /** Ticks after a bribe before another is taken. */
    readonly cooldownTicks: number;
}

/** Whether the entity holds a bribe, and the ticks before it takes another. */
const BRIBE_STATE = defineComponentState('minecraft:bribeable', {
    bribed: stateField.boolean,
    cooldown: stateField.number
});

/**
 * The Java item tag that bribes each vanilla type, which Java's `mobInteract` reads in place of
 * the items Bedrock lists: Bedrock's dolphin takes cod and salmon, Java's the whole `fishes` tag.
 */
const JAVA_BRIBE_TAGS: Readonly<Record<string, string>> = {
    'minecraft:dolphin': 'minecraft:fishes'
};

/** Whether the entity holds a bribe, or undefined when it carries no `minecraft:bribeable`. */
export const isBribed = (entity: EntityInstance): boolean | undefined =>
    entity.hasComponent('minecraft:bribeable') ? entity.componentState.get(BRIBE_STATE)?.bribed === true : undefined;

/** Spends the entity's bribe, which Java's `DolphinSwimToTreasureGoal.stop` does. */
export const spendBribe = (entity: EntityInstance): void => {
    const state = entity.componentState.get(BRIBE_STATE);
    if (state !== undefined) entity.componentState.set(BRIBE_STATE, { ...state, bribed: false });
};

/** `minecraft:bribeable`, which takes a bribe that {@link isBribed} reports until it is spent. */
export const bribeable: ComponentFactory<EntityHooks, BribeableParams> = {
    name: 'minecraft:bribeable',
    hooks: ['onInitialize', 'onTick', 'onInteractWithItem'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const items = asList(value.bribe_items).flatMap((raw) =>
            typeof raw === 'string' ? [normalizedItemIdentifier(raw)] : []
        );
        return accepted({
            items,
            cooldownTicks: Math.ceil(numberAt(value, 'bribe_cooldown', 2) * TICKS_PER_SECOND)
        });
    },
    create: (params) => ({
        onInitialize: (entity) => {
            if (entity.componentState.get(BRIBE_STATE) === undefined)
                entity.componentState.set(BRIBE_STATE, { bribed: false, cooldown: 0 });
        },
        onTick: (entity) => {
            const state = entity.componentState.get(BRIBE_STATE);
            if (state !== undefined && state.cooldown > 0)
                entity.componentState.set(BRIBE_STATE, { ...state, cooldown: state.cooldown - 1 });
        },
        onInteractWithItem: (entity, itemIdentifier, _other, interaction) => {
            const tag = JAVA_BRIBE_TAGS[entity.type.identifier];
            const bribes =
                tag === undefined
                    ? params.items.includes(normalizedItemIdentifier(itemIdentifier))
                    : interaction?.javaItemTags?.includes(tag) === true;
            if (!bribes) return undefined;
            const state = entity.componentState.get(BRIBE_STATE) ?? { bribed: false, cooldown: 0 };
            // Java eats every fish it is offered; the cooldown is Bedrock's, for other types.
            if (tag === undefined && state.cooldown > 0) return undefined;
            entity.componentState.set(BRIBE_STATE, { bribed: true, cooldown: params.cooldownTicks });
            return {};
        }
    })
};
