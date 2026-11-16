/**
 * `minecraft:trust`, the players a fox trusts.
 *
 * Java's `Fox.FoxBreedGoal.breed` makes a newborn fox trust the players who fed each of its
 * parents. A trusted player is one the fox does not run from and whose attackers it attacks,
 * which the `trusts` filter test and `minecraft:behavior.defend_trusted_target` read.
 */

import type { ComponentFactory } from '@jsprismarine/content';

import { defineComponentState, stateField } from '../componentState';
import type { EntityInstance } from '../entityInstance';
import type { EntityHooks } from '../hooks';
import type { ComponentRecord } from './schemas';
import { recordSchema } from './schemas';

/** The identities of the players the entity trusts, oldest first. */
const TRUST_STATE = defineComponentState('minecraft:trust', { trusted: stateField.list(stateField.id) });

/** The players an entity trusts, empty for one that trusts nobody. */
export const trustedBy = (entity: EntityInstance): readonly (string | number)[] =>
    entity.componentState.get(TRUST_STATE)?.trusted ?? [];

/**
 * Makes an entity with `minecraft:trust` trust more players.
 *
 * @returns Whether the entity carries the component, and so took the trust.
 */
export const addTrusted = (entity: EntityInstance, identities: readonly (string | number)[]): boolean => {
    if (!entity.hasComponent('minecraft:trust')) return false;
    const trusted = [...trustedBy(entity)];
    for (const identity of identities) if (!trusted.includes(identity)) trusted.push(identity);
    entity.componentState.set(TRUST_STATE, { trusted });
    return true;
};

/** `minecraft:trust`, whose trusted players {@link addTrusted} records. */
export const trust: ComponentFactory<EntityHooks, ComponentRecord> = {
    name: 'minecraft:trust',
    hooks: ['onInitialize'],
    schema: recordSchema,
    create: () => ({
        onInitialize: (entity) => {
            if (entity.componentState.get(TRUST_STATE) === undefined)
                entity.componentState.set(TRUST_STATE, { trusted: [] });
        }
    })
};
