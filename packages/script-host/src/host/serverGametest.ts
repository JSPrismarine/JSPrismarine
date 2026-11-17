/**
 * The behavior of `@minecraft/server-gametest` for one pack: `register` and `registerAsync`,
 * `RegistrationBuilder`, a running test's `Test`, `spawnSimulatedPlayer` and the members of
 * `SimulatedPlayer` that make it act. A simulated player is a player of the world, so every
 * `Player` and `Entity` member of `@minecraft/server` works on it too. Every other member is
 * present and throws `NotImplementedError` ([ADR 0022](../../../../docs/adr/0022-the-script-api-surface-is-generated.md)).
 *
 * The runner itself, the batches, the ticks and the cleanup, is {@link GameTests}.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import { ScriptHandle } from '../values';
import type { GameTestRun, GameTests } from './gametest';
import { GAMETEST } from './gametest';
import type { EntityKey } from './serverObjects';
import {
    entityKeyOf,
    gameModeOf,
    invalidEntity,
    itemOf,
    PLAYER,
    plainError,
    vectorArgument,
    withNamespace
} from './serverObjects';
import type { ScriptGameMode, ScriptVector3, ScriptWorld, SimulatedPlayerAction } from './world';

/** The tags of the objects this module's members make. */
export const GAMETEST_TAG = {
    /** A running test's `Test`; its state is the run's id. */
    test: 200,
    /** A `RegistrationBuilder`; its state is the registration's index. */
    builder: 201
} as const;

/** A promise made in a pack, and the functions that settle it. */
export interface ScriptDeferred {
    readonly promise: ScriptHandle;
    readonly resolve: ScriptHandle;
    readonly reject: ScriptHandle;
}

/** What one pack's `@minecraft/server-gametest` reaches of the runtime and the world. */
export interface GameTestPackHost<Owner> {
    readonly engine: ScriptEngine;
    readonly world: ScriptWorld;
    readonly tests: GameTests<Owner>;
    /** The pack, which owns the tests it registers. */
    readonly owner: Owner;
    /** Makes an instance of one of this module's classes, which the caller frees or releases. */
    create(className: string, tag: number, state: string): ScriptHandle;
    /** The pack's one object for an entity: a `SimulatedPlayer` for a simulated player. The host owns it. */
    entity(key: EntityKey): ScriptHandle;
    /** The pack's `Dimension` object of a dimension. The host owns it. */
    dimension(id: string): ScriptHandle;
    /** Makes a promise in the pack's realm. */
    deferred(): ScriptDeferred;
    /** Records that an entity is a simulated player, whose objects are then `SimulatedPlayer`s. */
    simulated(id: string): void;
}

const add = (a: ScriptVector3, b: ScriptVector3): ScriptVector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const floor = ({ x, y, z }: ScriptVector3): ScriptVector3 => ({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });

/**
 * Registers the behavior of one pack's `@minecraft/server-gametest` on its implementations.
 * @param implementations - The pack's implementations, which `@minecraft/server`'s are on too.
 */
export const gametestImplementations = <Owner>(
    implementations: ScriptApiImplementations,
    host: GameTestPackHost<Owner>
): ScriptApiImplementations => {
    const { tests, world } = host;

    /**
     * The run a `Test` stands for. Once the runner cleaned the test up, its object is gone, as
     * BDS's is; once it ended, every member but `isCompleted` throws `GameTestCompletedError`.
     */
    const runOf = (call: ScriptCall, member: string, afterEnd = false): GameTestRun<Owner> => {
        const run = tests.run(Number(call.state));
        if (run === undefined || run.state === 'cleaned') {
            throw new ScriptHostErrors.TestNoLongerBound({ member });
        }
        if (!afterEnd && run.state !== 'running') {
            throw new ScriptApiError(
                GAMETEST,
                'GameTestCompletedError',
                `GameTest ${run.registration.name} has already completed and can no longer access method: ${member}`,
                { reason: 'Done' }
            );
        }
        return run;
    };
    const callbackArgument = (call: ScriptCall, index: number): ScriptHandle => {
        const callback = call.args[index];
        // The binding checked the argument against its closure type.
        if (!(callback instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'The callback' });
        return call.engine.duplicate(callback);
    };
    const vector = (value: ScriptVector3): string => JSON.stringify(value);
    /** Spawns a simulated player and returns its id, which the pack's object for it carries. */
    const spawn = (name: string, dimension: string, location: ScriptVector3, gameMode: ScriptGameMode): string => {
        const id = world.simulatedPlayers?.spawn(name, dimension, location, gameMode);
        if (id === undefined) throw plainError(`Failed to spawn simulated player '${name}'.`);
        host.simulated(id);
        return id;
    };
    const playerObject = (id: string): ScriptHandle => host.entity({ id, typeId: PLAYER });
    const register = (async: boolean) => (call: ScriptCall) => {
        const [className, testName] = call.args;
        const index = tests.register(host.owner, String(className), String(testName), callbackArgument(call, 2), async);
        return host.engine.release(host.create('RegistrationBuilder', GAMETEST_TAG.builder, String(index)));
    };

    implementations
        .implement(GAMETEST, '', 'register', register(false))
        .implement(GAMETEST, '', 'registerAsync', register(true))
        .implement(GAMETEST, '', 'spawnSimulatedPlayer', (call) => {
            const [location, name, gameMode] = call.args;
            let dimension = world.dimensions()[0] ?? 'minecraft:overworld';
            if (location instanceof ScriptHandle) {
                const target = call.engine.get(location, 'dimension');
                const state = call.stateOf(target ?? null);
                if (target instanceof ScriptHandle) call.engine.free(target);
                if (state !== '') dimension = state;
            }
            return playerObject(spawn(String(name), dimension, vectorArgument(call, 0), gameModeOf(gameMode ?? 0)));
        });

    /** A `RegistrationBuilder` member that changes one option and returns the builder. */
    const option =
        (change: (options: NonNullable<ReturnType<typeof tests.options>>, call: ScriptCall) => void) =>
        (call: ScriptCall) => {
            const options = tests.options(Number(call.state));
            if (options !== undefined) change(options, call);
            return call.self;
        };
    const count = (call: ScriptCall): number => (typeof call.args[0] === 'number' ? Math.trunc(call.args[0]) : 0);
    implementations
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'batch',
            option((options, call) => (options.batch = String(call.args[0])))
        )
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'maxTicks',
            option((options, call) => (options.maxTicks = count(call)))
        )
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'setupTicks',
            option((options, call) => (options.setupTicks = count(call)))
        )
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'required',
            option((options, call) => (options.required = call.args[0] === true))
        )
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'structureName',
            option((options, call) => (options.structureName = String(call.args[0])))
        )
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'tag',
            option((options, call) => options.tags.push(String(call.args[0])))
        )
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'structureLocation',
            option((options, call) => {
                const [, dimension] = call.args;
                options.structureLocation = {
                    location: vectorArgument(call, 0),
                    ...(typeof dimension === 'string' ? { dimension: withNamespace(dimension) } : {})
                };
            })
        )
        // Options the runner does not act on yet: each test runs once, unrotated and unpadded.
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'maxAttempts',
            option(() => {})
        )
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'requiredSuccessfulAttempts',
            option(() => {})
        )
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'padding',
            option(() => {})
        )
        .implement(
            GAMETEST,
            'RegistrationBuilder',
            'rotateTest',
            option(() => {})
        );

    implementations
        .implement(GAMETEST, 'Test', 'succeed', (call) => {
            tests.succeed(runOf(call, 'succeed'));
            return undefined;
        })
        .implement(GAMETEST, 'Test', 'fail', (call) => {
            tests.fail(runOf(call, 'fail'), String(call.args[0]));
            return undefined;
        })
        .implement(GAMETEST, 'Test', 'assert', (call) => {
            runOf(call, 'assert');
            const [condition, message] = call.args;
            if (condition !== true)
                throw new ScriptApiError(GAMETEST, 'GameTestError', String(message), { type: 'Assert' });
            return undefined;
        })
        .implement(GAMETEST, 'Test', 'isCompleted', (call) => runOf(call, 'isCompleted', true).state !== 'running')
        .implement(GAMETEST, 'Test', 'isCleaningUp', (call) => {
            runOf(call, 'isCleaningUp', true);
            return false;
        })
        .implement(GAMETEST, 'Test', 'runAfterDelay', (call) => {
            const run = runOf(call, 'runAfterDelay');
            tests.runAfterDelay(run, count(call), callbackArgument(call, 1));
            return undefined;
        })
        .implement(GAMETEST, 'Test', 'runAtTickTime', (call) => {
            const run = runOf(call, 'runAtTickTime');
            const delay = run.startTick + count(call) - tests.currentTick;
            tests.runAfterDelay(run, delay, callbackArgument(call, 1));
            return undefined;
        })
        .implement(GAMETEST, 'Test', 'idle', (call) => {
            const run = runOf(call, 'idle');
            const { promise, resolve, reject } = host.deferred();
            host.engine.free(reject);
            tests.idle(run, count(call), resolve);
            return host.engine.release(promise);
        })
        .implement(GAMETEST, 'Test', 'succeedWhen', (call) => {
            tests.succeedWhen(runOf(call, 'succeedWhen'), callbackArgument(call, 0));
            return undefined;
        })
        .implement(GAMETEST, 'Test', 'worldLocation', (call) =>
            vector(add(runOf(call, 'worldLocation').origin, vectorArgument(call, 0)))
        )
        .implement(GAMETEST, 'Test', 'worldBlockLocation', (call) =>
            vector(add(runOf(call, 'worldBlockLocation').origin, floor(vectorArgument(call, 0))))
        )
        .implement(GAMETEST, 'Test', 'relativeLocation', (call) => {
            const { origin } = runOf(call, 'relativeLocation');
            const at = vectorArgument(call, 0);
            return vector({ x: at.x - origin.x, y: at.y - origin.y, z: at.z - origin.z });
        })
        .implement(GAMETEST, 'Test', 'relativeBlockLocation', (call) => {
            const { origin } = runOf(call, 'relativeBlockLocation');
            const at = floor(vectorArgument(call, 0));
            return vector({ x: at.x - origin.x, y: at.y - origin.y, z: at.z - origin.z });
        })
        .implement(GAMETEST, 'Test', 'getDimension', (call) => host.dimension(runOf(call, 'getDimension').dimension))
        .implement(GAMETEST, 'Test', 'print', (call) => {
            runOf(call, 'print');
            world.sendMessage(String(call.args[0]));
            return undefined;
        })
        .implement(GAMETEST, 'Test', 'spawnSimulatedPlayer', (call) => {
            const run = runOf(call, 'spawnSimulatedPlayer');
            const [, name, gameMode] = call.args;
            // BDS stands the player in the middle of the block it is given.
            const at = add(add(run.origin, floor(vectorArgument(call, 0))), { x: 0.5, y: 0, z: 0.5 });
            const id = spawn(String(name ?? 'Simulated Player'), run.dimension, at, gameModeOf(gameMode ?? 0));
            run.players.push(id);
            return playerObject(id);
        })
        .implement(GAMETEST, 'Test', 'removeSimulatedPlayer', (call) => {
            const run = runOf(call, 'removeSimulatedPlayer');
            const { id } = entityKeyOf(call.stateOf(call.args[0] ?? null));
            run.players = run.players.filter((each) => each !== id);
            world.simulatedPlayers?.remove(id);
            return undefined;
        });

    /** Makes a simulated player act, or throws BDS's error once it has left. */
    const act = (call: ScriptCall, member: string, action: SimulatedPlayerAction): boolean => {
        const { id } = entityKeyOf(call.state);
        if (world.entity(id) === undefined) throw invalidEntity('call', member, { id, typeId: PLAYER });
        return world.simulatedPlayers?.act(id, action) ?? false;
    };
    const number = (call: ScriptCall, index: number, fallback: number): number => {
        const value = call.args[index];
        return typeof value === 'number' ? value : fallback;
    };
    const move = (relative: boolean) => (call: ScriptCall) => {
        act(call, relative ? 'moveRelative' : 'move', {
            kind: 'move',
            x: number(call, 0, 0),
            z: number(call, 1, 0),
            speed: number(call, 2, 1),
            relative
        });
        return undefined;
    };
    const lookAt = (member: string, at: (call: ScriptCall) => ScriptVector3) => (call: ScriptCall) => {
        act(call, member, { kind: 'lookAt', location: at(call) });
        return undefined;
    };
    return implementations
        .implement(GAMETEST, 'SimulatedPlayer', 'chat', (call) => {
            act(call, 'chat', { kind: 'chat', message: String(call.args[0]) });
            return undefined;
        })
        .implement(GAMETEST, 'SimulatedPlayer', 'disconnect', (call) => {
            const { id } = entityKeyOf(call.state);
            if (world.entity(id) === undefined) throw invalidEntity('call', 'disconnect', { id, typeId: PLAYER });
            world.simulatedPlayers?.remove(id);
            return undefined;
        })
        .implement(GAMETEST, 'SimulatedPlayer', 'jump', (call) => act(call, 'jump', { kind: 'jump' }))
        .implement(GAMETEST, 'SimulatedPlayer', 'move', move(false))
        .implement(GAMETEST, 'SimulatedPlayer', 'moveRelative', move(true))
        .implement(GAMETEST, 'SimulatedPlayer', 'stopMoving', (call) => {
            act(call, 'stopMoving', { kind: 'stopMoving' });
            return undefined;
        })
        .implement(
            GAMETEST,
            'SimulatedPlayer',
            'lookAtLocation',
            lookAt('lookAtLocation', (call) => vectorArgument(call, 0))
        )
        .implement(
            GAMETEST,
            'SimulatedPlayer',
            'lookAtBlock',
            lookAt('lookAtBlock', (call) => add(floor(vectorArgument(call, 0)), { x: 0.5, y: 0.5, z: 0.5 }))
        )
        .implement(
            GAMETEST,
            'SimulatedPlayer',
            'lookAtEntity',
            lookAt('lookAtEntity', (call) => {
                const target = world.entity(entityKeyOf(call.stateOf(call.args[0] ?? null)).id);
                if (target === undefined) throw invalidEntity('call', 'lookAtEntity');
                return target.location;
            })
        )
        .implement(GAMETEST, 'SimulatedPlayer', 'attack', (call) => act(call, 'attack', { kind: 'attack' }))
        .implement(GAMETEST, 'SimulatedPlayer', 'attackEntity', (call) => {
            const target = entityKeyOf(call.stateOf(call.args[0] ?? null));
            return act(call, 'attackEntity', { kind: 'attackEntity', entity: target.id });
        })
        .implement(GAMETEST, 'SimulatedPlayer', 'useItem', (call) =>
            act(call, 'useItem', { kind: 'useItem', item: itemOf(call.stateOf(call.args[0] ?? null)) })
        );
};
