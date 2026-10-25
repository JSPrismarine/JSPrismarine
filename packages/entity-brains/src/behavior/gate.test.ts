import { describe, expect, it } from 'vitest';

import { MemoryModuleTypes } from '../memory.js';
import { Brain } from '../brain.js';
import { TestWorld } from '../testWorld.js';
import { behavior, countDownCooldownTicks, gatedBy, sequence, triggerIf } from './builder.js';
import type { BehaviorControl } from './control.js';
import { Behavior, conditions, DoNothing, OneShot } from './control.js';
import { GateBehavior, RunOne, ShufflingList, triggerGate, triggerOneShuffled } from './gate.js';

type Counter = BehaviorControl & { starts: number; ticks: number; stops: number };

/** A child that starts when told to and reports its lifecycle counts. */
function child(name: string, options: { readonly willStart?: boolean; readonly stayRunning?: boolean } = {}): Counter {
    let status: 'stopped' | 'running' = 'stopped';
    const control: Counter = {
        name,
        starts: 0,
        ticks: 0,
        stops: 0,
        get status() {
            return status;
        },
        requiredMemories: [],
        tryStart: () => {
            if (options.willStart === false) {
                return false;
            }
            control.starts++;
            status = 'running';
            return true;
        },
        tickOrStop: () => {
            control.ticks++;
            if (options.stayRunning !== true) {
                status = 'stopped';
                control.stops++;
            }
        },
        doStop: () => {
            control.stops++;
            status = 'stopped';
        }
    };
    return control;
}

function context(world = new TestWorld()) {
    const body = world.spawn('minecraft:test', { x: 0, y: 0, z: 0 });
    body.attach(new Brain({ memories: [...Object.values(MemoryModuleTypes)], sensors: [], activities: [] }));
    return body.context;
}

describe('ShufflingList', () => {
    it('keeps every entry and reorders in place', () => {
        const list = new ShufflingList<string>().add('a', 1).add('b', 1).add('c', 1);
        expect([...list.items()].sort()).toEqual(['a', 'b', 'c']);
        list.shuffle(() => 0.5);
        expect([...list.items()].sort()).toEqual(['a', 'b', 'c']);
    });

    it('ranks a heavier entry first, because the key is -random ** (1 / weight)', () => {
        // With the same draw, -r**(1/10) sorts before -r**(1/1) for any r in (0, 1).
        const list = new ShufflingList<string>().add('light', 1).add('heavy', 10);
        list.shuffle(() => 0.5);
        expect(list.items()[0]).toBe('heavy');
    });
});

describe('GateBehavior', () => {
    it('with run_one starts only the first child that will start', () => {
        const refuses = child('Refuses', { willStart: false });
        const accepts = child('Accepts', { stayRunning: true });
        const never = child('Never', { stayRunning: true });
        const gate = new GateBehavior('ordered', 'run_one', [
            [refuses, 1],
            [accepts, 1],
            [never, 1]
        ]);
        expect(gate.tryStart(context(), 0)).toBe(true);
        expect(accepts.starts).toBe(1);
        expect(never.starts).toBe(0);
    });

    it('with try_all starts every child that will start', () => {
        const first = child('First', { stayRunning: true });
        const second = child('Second', { stayRunning: true });
        const gate = new GateBehavior('ordered', 'try_all', [
            [first, 1],
            [second, 1]
        ]);
        gate.tryStart(context(), 0);
        expect(first.starts).toBe(1);
        expect(second.starts).toBe(1);
    });

    it('stops once no child is running any more', () => {
        const only = child('Only');
        const gate = new GateBehavior('ordered', 'run_one', [[only, 1]]);
        const ctx = context();
        gate.tryStart(ctx, 0);
        expect(gate.status).toBe('running');
        gate.tickOrStop(ctx, 1);
        expect(gate.status).toBe('stopped');
    });

    it('refuses to start when its own memory condition fails', () => {
        const only = child('Only');
        const gate = new GateBehavior('ordered', 'run_one', [[only, 1]], {
            entryCondition: conditions([MemoryModuleTypes.ATTACK_TARGET, 'value_present'])
        });
        expect(gate.tryStart(context(), 0)).toBe(false);
        expect(only.starts).toBe(0);
    });

    it('erases its exit memories when it stops', () => {
        const ctx = context();
        ctx.body.brain.setMemory(MemoryModuleTypes.INTERACTION_TARGET, ctx.body);
        const gate = new GateBehavior('ordered', 'run_one', [[child('Only'), 1]], {
            exitErasedMemories: [MemoryModuleTypes.INTERACTION_TARGET]
        });
        gate.tryStart(ctx, 0);
        gate.tickOrStop(ctx, 1);
        expect(ctx.body.brain.hasMemoryValue(MemoryModuleTypes.INTERACTION_TARGET)).toBe(false);
    });

    it('collects its own and its children required memories', () => {
        const withMemory: BehaviorControl = {
            ...child('WithMemory'),
            requiredMemories: [MemoryModuleTypes.DANCING]
        };
        const gate = new GateBehavior('ordered', 'run_one', [[withMemory, 1]], {
            entryCondition: conditions([MemoryModuleTypes.ATTACK_TARGET, 'value_present'])
        });
        expect(gate.requiredMemories).toContain(MemoryModuleTypes.DANCING);
        expect(gate.requiredMemories).toContain(MemoryModuleTypes.ATTACK_TARGET);
    });
});

describe('RunOne', () => {
    it('is a shuffled run_one gate', () => {
        const first = child('First', { stayRunning: true });
        const second = child('Second', { stayRunning: true });
        const gate = new RunOne([
            [first, 1],
            [second, 1]
        ]);
        gate.tryStart(context(), 0);
        expect(first.starts + second.starts).toBe(1);
    });
});

describe('TriggerGate', () => {
    it('with run_one stops at the first trigger that fires', () => {
        const fired: string[] = [];
        const gate = triggerGate(
            [
                [
                    () => {
                        fired.push('a');
                        return false;
                    },
                    1
                ],
                [
                    () => {
                        fired.push('b');
                        return true;
                    },
                    1
                ],
                [
                    () => {
                        fired.push('c');
                        return true;
                    },
                    1
                ]
            ],
            'ordered',
            'run_one'
        );
        gate.trigger(context(), 0);
        expect(fired).toEqual(['a', 'b']);
    });

    it('always reports that it ran, even when no trigger fired', () => {
        const gate = triggerOneShuffled([[() => false, 1]]);
        expect(gate.trigger(context(), 0)).toBe(true);
    });
});

describe('the behavior lifecycle', () => {
    it('runs for one tick unless canStillUse says otherwise', () => {
        const ctx = context();
        const once = new Behavior('Once', conditions());
        once.tryStart(ctx, 0);
        expect(once.status).toBe('running');
        once.tickOrStop(ctx, 1);
        expect(once.status).toBe('stopped');
    });

    it('times out after the drawn duration', () => {
        const ctx = context(new TestWorld({ randomValues: [0] }));
        const behavior_ = new Behavior(
            'Timed',
            conditions(),
            { canStillUse: () => true },
            {
                minDuration: 10,
                maxDuration: 10
            }
        );
        behavior_.tryStart(ctx, 0);
        behavior_.tickOrStop(ctx, 10);
        expect(behavior_.status).toBe('running');
        behavior_.tickOrStop(ctx, 11);
        expect(behavior_.status).toBe('stopped');
    });

    it('refuses to start when a memory precondition fails', () => {
        const ctx = context();
        const needsTarget = new Behavior('NeedsTarget', conditions([MemoryModuleTypes.ATTACK_TARGET, 'value_present']));
        expect(needsTarget.tryStart(ctx, 0)).toBe(false);
    });

    it('refuses to start when checkExtraStartConditions fails', () => {
        const ctx = context();
        const refuses = new Behavior('Refuses', conditions(), { checkExtraStartConditions: () => false });
        expect(refuses.tryStart(ctx, 0)).toBe(false);
    });
});

describe('DoNothing', () => {
    it('starts unconditionally and holds for the drawn duration', () => {
        const ctx = context(new TestWorld({ randomValues: [0] }));
        const idle = new DoNothing(30, 60);
        expect(idle.tryStart(ctx, 0)).toBe(true);
        idle.tickOrStop(ctx, 30);
        expect(idle.status).toBe('running');
        idle.tickOrStop(ctx, 31);
        expect(idle.status).toBe('stopped');
    });
});

describe('BehaviorBuilder', () => {
    it('refuses when a present memory is empty and runs when it is filled', () => {
        const ctx = context();
        const seen: string[] = [];
        const control = behavior('ReadsTarget')
            .present(MemoryModuleTypes.ANGRY_AT)
            .build((_context, angryAt) => {
                seen.push(angryAt.get());
                return true;
            });
        expect(control.trigger(ctx, 0)).toBe(false);
        ctx.body.brain.setMemory(MemoryModuleTypes.ANGRY_AT, 'suspect');
        expect(control.trigger(ctx, 0)).toBe(true);
        expect(seen).toEqual(['suspect']);
    });

    it('refuses when an absent memory is filled, and lets the body write it when empty', () => {
        const ctx = context();
        const control = behavior('WritesTarget')
            .absent(MemoryModuleTypes.LOOK_TARGET)
            .build((_context, lookTarget) => {
                lookTarget.set({
                    currentPosition: () => ({ x: 1, y: 2, z: 3 }),
                    currentBlockPosition: () => ({ x: 1, y: 2, z: 3 })
                });
                return true;
            });
        expect(control.trigger(ctx, 0)).toBe(true);
        expect(control.trigger(ctx, 0)).toBe(false);
    });

    it('gives a registered memory an optional read and a write', () => {
        const ctx = context();
        const control = behavior('Cooldown')
            .registered(MemoryModuleTypes.DIG_COOLDOWN)
            .build((_context, cooldown) => {
                if (cooldown.tryGet() !== undefined) {
                    return false;
                }
                cooldown.setWithExpiry(Symbol.for('@jsprismarine/entity-brains/unit'), 5);
                return true;
            });
        expect(control.trigger(ctx, 0)).toBe(true);
        expect(control.trigger(ctx, 0)).toBe(false);
    });

    it('reports every declared memory as required, so the brain registers it', () => {
        const control = behavior('Both')
            .present(MemoryModuleTypes.ATTACK_TARGET)
            .absent(MemoryModuleTypes.WALK_TARGET)
            .build(() => true);
        expect(control.requiredMemories).toEqual([MemoryModuleTypes.ATTACK_TARGET, MemoryModuleTypes.WALK_TARGET]);
    });
});

describe('triggerIf, sequence and gatedBy', () => {
    it('triggerIf runs the predicate over the body', () => {
        const ctx = context();
        expect(triggerIf('Always', () => true).trigger(ctx, 0)).toBe(true);
        expect(triggerIf('Never', () => false).trigger(ctx, 0)).toBe(false);
    });

    it('sequence runs the second only when the first fired', () => {
        const ctx = context();
        let ran = 0;
        const second = new OneShot('Second', [], () => {
            ran++;
            return true;
        });
        expect(sequence(() => false, second).trigger(ctx, 0)).toBe(false);
        expect(ran).toBe(0);
        expect(sequence(() => true, second).trigger(ctx, 0)).toBe(true);
        expect(ran).toBe(1);
    });

    it('gatedBy forwards the lifecycle and blocks the start', () => {
        const ctx = context();
        const inner = child('Inner', { stayRunning: true });
        const blocked = gatedBy(() => false, inner);
        expect(blocked.tryStart(ctx, 0)).toBe(false);
        const open = gatedBy(() => true, inner);
        expect(open.tryStart(ctx, 0)).toBe(true);
        expect(open.status).toBe('running');
    });
});

describe('countDownCooldownTicks', () => {
    it('decrements the memory each tick and erases it at zero', () => {
        const ctx = context();
        const control = countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS);
        ctx.body.brain.setMemory(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS, 2);
        expect(control.tryStart(ctx, 0)).toBe(true);
        control.tickOrStop(ctx, 1);
        expect(ctx.body.brain.getMemory(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS)).toBe(1);
        control.tickOrStop(ctx, 2);
        expect(ctx.body.brain.getMemory(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS)).toBe(0);
        control.tickOrStop(ctx, 3);
        expect(ctx.body.brain.hasMemoryValue(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS)).toBe(false);
        expect(control.status).toBe('stopped');
    });

    it('refuses to start without the memory', () => {
        expect(countDownCooldownTicks(MemoryModuleTypes.GAZE_COOLDOWN_TICKS).tryStart(context(), 0)).toBe(false);
    });
});
