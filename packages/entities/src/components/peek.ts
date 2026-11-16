/** `minecraft:peek`: the shulker opening and closing its shell. */

import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import { defineComponentState, stateField } from '../componentState';
import type { EntityInstance } from '../entityInstance';
import type { EntityHooks } from '../hooks';
import { nextInt } from '../randomInt';
import { isRecord } from './schemas';
import type { SensorTrigger } from './shared';
import { parseComponentTrigger } from './shared';

/** What `minecraft:peek` declares: the events raised as the shell opens and closes. */
export interface PeekParams {
    readonly onOpen?: SensorTrigger;
    readonly onClose?: SensorTrigger;
    readonly onTargetOpen?: SensorTrigger;
}

/**
 * Java's `Shulker$ShulkerPeekGoal`: a shulker with no target rolls one in `reducedTickDelay(40)`,
 * which is 20, on each check of its goals, which run every other tick.
 */
const PEEK_ROLL = 20;
const GOAL_CHECK_INTERVAL = 2;
/** `ShulkerPeekGoal.start`: the shell opens 30 for 20, 40 or 60 ticks. */
export const IDLE_PEEK = 30;
const PEEK_TICKS = 20;
const PEEK_TICK_CHOICES = 3;
/** `Shulker$ShulkerAttackGoal.start`: the shell stands fully open while the shulker fights. */
export const ATTACK_PEEK = 100;

/** How far the shell is open, from 0 to 100, how long an idle peek has left, and the tick count. */
const PEEK_STATE = defineComponentState('minecraft:peek', {
    peek: stateField.number,
    ticksLeft: stateField.number,
    age: stateField.number
});

/**
 * How far the entity's shell is open, Java's `Shulker.getRawPeekAmount`: 0 closed, 30 for an idle
 * peek and 100 while it has a target. Undefined for an entity without `minecraft:peek`.
 */
export const peekAmount = (entity: EntityInstance): number | undefined => entity.componentState.get(PEEK_STATE)?.peek;

const raise = (entity: EntityInstance, trigger: SensorTrigger | undefined): void => {
    if (trigger?.event !== undefined) entity.raise(trigger.event, trigger.target, 'minecraft:peek');
};

/**
 * `minecraft:peek`, run by Java's rules: `ShulkerAttackGoal` opens the shell fully while the
 * shulker has a target and closes it when the target is gone, and with no target
 * `ShulkerPeekGoal` opens it 30 now and then for 20 to 60 ticks.
 */
export const peek: ComponentFactory<EntityHooks, PeekParams> = {
    name: 'minecraft:peek',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const onOpen = parseComponentTrigger(value.on_open);
        const onClose = parseComponentTrigger(value.on_close);
        const onTargetOpen = parseComponentTrigger(value.on_target_open);
        return accepted({
            ...(onOpen === undefined ? {} : { onOpen }),
            ...(onClose === undefined ? {} : { onClose }),
            ...(onTargetOpen === undefined ? {} : { onTargetOpen })
        });
    },
    create: (params) => ({
        onInitialize: (entity) => entity.componentState.set(PEEK_STATE, { peek: 0, ticksLeft: 0, age: 0 }),
        onTick: (entity) => {
            const state = entity.componentState.get(PEEK_STATE);
            if (state === undefined) return;
            const age = state.age + 1;
            const set = (peekAmount: number, ticksLeft: number): void =>
                entity.componentState.set(PEEK_STATE, { peek: peekAmount, ticksLeft, age });
            if (entity.targetProximity() !== undefined) {
                if (state.peek !== ATTACK_PEEK) raise(entity, params.onTargetOpen);
                set(ATTACK_PEEK, 0);
                return;
            }
            if (state.peek === ATTACK_PEEK || (state.peek > 0 && state.ticksLeft <= 1)) {
                raise(entity, params.onClose);
                set(0, 0);
                return;
            }
            if (state.peek > 0) {
                set(state.peek, state.ticksLeft - 1);
                return;
            }
            if (age % GOAL_CHECK_INTERVAL === 0 && nextInt(entity.random, PEEK_ROLL) === 0) {
                raise(entity, params.onOpen);
                set(IDLE_PEEK, PEEK_TICKS * (1 + nextInt(entity.random, PEEK_TICK_CHOICES)));
                return;
            }
            set(0, 0);
        }
    })
};
