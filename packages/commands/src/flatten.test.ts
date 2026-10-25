import { argument as sourcelessArgument, literal } from '@jsprismarine/brigadier';
import type { ArgumentType } from '@jsprismarine/brigadier';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import {
    blockPositionArgument,
    entityArgument,
    integerArgument,
    nbtPathArgument,
    stringArgument
} from './argumentTypes';
import { flattenCommandTree } from './flatten';
import { CommandRegistry } from './tree';

interface TestSource {
    readonly level: number;
}

/**
 * `argument`, bound to this file's source type.
 *
 * `argument` cannot infer the source from its own parameters, so bare calls build a node over
 * `unknown` that will not compose with the literals around it.
 */
const argument = <T>(name: string, type: ArgumentType<T>) => sourcelessArgument<TestSource, T>(name, type);

const succeed = () => 1;

const shapesOf = (registry: CommandRegistry<TestSource>, name: string) =>
    flattenCommandTree(registry)
        .commands.find((command) => command.name === name)
        ?.overloads.map((overload) => overload.parameters.map((parameter) => parameter.shape));

describe('flattening a representable tree', () => {
    it('turns a literal chain into one overload per leaf', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(
            literal<TestSource>('time')
                .then(literal<TestSource>('set').then(argument('amount', integerArgument()).executes(succeed)))
                .then(literal<TestSource>('query').then(literal<TestSource>('daytime').executes(succeed))),
            { description: 'Changes or queries the time.' }
        );

        // `CommandNode.addChild` sorts siblings, so the overloads come out in
        // the order the client would see them, not in registration order.
        expect(shapesOf(registry, 'time')).toEqual([
            [
                { kind: 'enum', name: 'OPTION_QUERY', values: ['query'] },
                { kind: 'enum', name: 'OPTION_DAYTIME', values: ['daytime'] }
            ],
            [
                { kind: 'enum', name: 'OPTION_SET', values: ['set'] },
                { kind: 'basic', type: 'INT' }
            ]
        ]);
    });

    it('does not drop a nested literal, which is the gap the old flattener had', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(
            literal<TestSource>('scoreboard').then(
                literal<TestSource>('objectives').then(
                    literal<TestSource>('add').then(argument('name', stringArgument()).executes(succeed))
                )
            )
        );

        const [overload] = shapesOf(registry, 'scoreboard') ?? [];
        expect(overload).toEqual([
            { kind: 'enum', name: 'OPTION_OBJECTIVES', values: ['objectives'] },
            { kind: 'enum', name: 'OPTION_ADD', values: ['add'] },
            { kind: 'basic', type: 'ID' }
        ]);
    });

    it('collapses sibling literals whose continuations are identical into one enum', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(
            literal<TestSource>('weather')
                .then(literal<TestSource>('clear').executes(succeed))
                .then(literal<TestSource>('rain').executes(succeed))
                .then(literal<TestSource>('thunder').executes(succeed))
        );

        expect(shapesOf(registry, 'weather')).toEqual([
            [{ kind: 'enum', name: 'OPTION_CLEAR_RAIN_THUNDER', values: ['clear', 'rain', 'thunder'] }]
        ]);
    });

    it('keeps literals apart when their continuations differ', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(
            literal<TestSource>('gamerule')
                .then(
                    literal<TestSource>('doDaylightCycle').then(argument('value', stringArgument()).executes(succeed))
                )
                .then(
                    literal<TestSource>('randomTickSpeed').then(argument('value', integerArgument()).executes(succeed))
                )
        );

        expect(shapesOf(registry, 'gamerule')).toHaveLength(2);
    });

    it('emits an empty overload for an executable root', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(literal<TestSource>('list').executes(succeed));

        expect(shapesOf(registry, 'list')).toEqual([[]]);
    });

    it('folds an alias into the owning command instead of listing it twice', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(
            literal<TestSource>('teleport').then(argument('destination', entityArgument()).executes(succeed)),
            { aliases: ['tp'] }
        );

        const { commands } = flattenCommandTree(registry);
        expect(commands.map((command) => command.name)).toEqual(['teleport']);
        expect(commands[0]?.aliases).toEqual(['tp']);
    });

    it('filters by CommandNode.canUse the way Java does', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(literal<TestSource>('say').then(argument('message', stringArgument()).executes(succeed)));
        registry.register(
            literal<TestSource>('stop')
                .requires((source: TestSource) => source.level >= 4)
                .executes(succeed)
        );

        const visible = flattenCommandTree(registry, { source: { level: 0 } });
        const privileged = flattenCommandTree(registry, { source: { level: 4 } });

        expect(visible.commands.map((command) => command.name)).toEqual(['say']);
        expect(privileged.commands.map((command) => command.name)).toEqual(['say', 'stop']);
    });
});

describe('flattening what Bedrock cannot represent', () => {
    it('reports an argument type Bedrock has no parameter type for, and sends a string', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(
            literal<TestSource>('data').then(
                literal<TestSource>('get').then(
                    argument('target', blockPositionArgument()).then(
                        argument('path', nbtPathArgument()).executes(succeed)
                    )
                )
            )
        );

        const { commands, notes } = flattenCommandTree(registry);

        expect(commands[0]?.overloads[0]?.parameters.at(-1)?.shape).toEqual({ kind: 'basic', type: 'ID' });
        expect(notes).toEqual([
            {
                command: 'data',
                path: 'data get target path',
                reason: 'no-bedrock-type',
                severity: 'degraded',
                message: 'Bedrock has no nbt_path parameter type, so it is sent as a string.'
            }
        ]);
    });

    it('reports an argument type from outside the package rather than guessing', () => {
        const registry = new CommandRegistry<TestSource>();
        registry.register(
            literal<TestSource>('custom').then(
                argument('value', { parse: (reader) => reader.readString() }).executes(succeed)
            )
        );

        const { commands, notes } = flattenCommandTree(registry);

        expect(commands[0]?.overloads[0]?.parameters[0]?.shape).toEqual({ kind: 'basic', type: 'ID' });
        expect(notes[0]).toMatchObject({ reason: 'untyped-argument', severity: 'degraded' });
    });

    it('notes a fork and still emits the overload', () => {
        const registry = new CommandRegistry<TestSource>();
        const target = registry.register(
            literal<TestSource>('ping').then(literal<TestSource>('now').executes(succeed))
        );
        registry.register(
            literal<TestSource>('asall').then(argument('targets', entityArgument()).fork(target, { apply: () => [] }))
        );

        const { commands, notes } = flattenCommandTree(registry);
        const asall = commands.find((command) => command.name === 'asall');

        expect(asall?.overloads.map((overload) => overload.parameters.map((parameter) => parameter.shape))).toEqual([
            [
                { kind: 'basic', type: 'SELECTION' },
                { kind: 'enum', name: 'OPTION_NOW', values: ['now'] }
            ]
        ]);
        expect(notes.filter((note) => note.reason === 'fork')).toEqual([
            {
                command: 'asall',
                path: 'asall targets',
                reason: 'fork',
                severity: 'degraded',
                message: 'The node forks, which the client cannot do. The fan-out happens server-side.'
            }
        ]);
    });

    it('cuts a branch where a node is its own child and says so', () => {
        const registry = new CommandRegistry<TestSource>();
        // Geyser hit this with an argument that lists itself as a child, which
        // the builder API cannot express, so the cycle is made on the node.
        const node = registry.register(literal<TestSource>('loop').executes(succeed));
        node.addChild(node);

        const { notes } = flattenCommandTree(registry);
        expect(notes.filter((note) => note.reason === 'self-child')).toEqual([
            {
                command: 'loop',
                path: 'loop loop',
                reason: 'self-child',
                severity: 'dropped',
                message: 'The node is its own child, so the branch was cut.'
            }
        ]);
    });

    it('cuts the expansion at the overload limit and says how many it produced', () => {
        const registry = new CommandRegistry<TestSource>();
        const builder = literal<TestSource>('wide');
        for (let index = 0; index < 10; index += 1) {
            builder.then(
                literal<TestSource>(`option${index}`).then(argument(`a${index}`, integerArgument()).executes(succeed))
            );
        }
        registry.register(builder);

        const { commands, notes } = flattenCommandTree(registry, { overloadLimit: 4 });

        expect(commands[0]?.overloads).toHaveLength(4);
        expect(notes.filter((note) => note.reason === 'overload-limit')).toEqual([
            {
                command: 'wide',
                path: 'wide',
                reason: 'overload-limit',
                severity: 'dropped',
                message: 'The expansion produced 10 overloads and was cut at 4.'
            }
        ]);
    });
});

describe('flattening the /execute redirect cycle', () => {
    /** The `/execute` shape in miniature: subcommands that redirect back, plus `run`. */
    const buildExecute = () => {
        const registry = new CommandRegistry<TestSource>();
        const execute = registry.register(literal<TestSource>('execute'), {
            description: 'Runs a command as another entity.',
            permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
            requiresCheats: true
        });

        execute.addChild(
            literal<TestSource>('as')
                .then(argument('origin', entityArgument()).fork(execute, { apply: () => [] }))
                .build()
        );
        execute.addChild(
            literal<TestSource>('at')
                .then(argument('origin', entityArgument()).fork(execute, { apply: () => [] }))
                .build()
        );
        execute.addChild(
            literal<TestSource>('if')
                .then(
                    literal<TestSource>('entity').then(
                        argument('target', entityArgument()).executes(succeed).redirect(execute)
                    )
                )
                .build()
        );
        execute.addChild(
            literal<TestSource>('unless')
                .then(
                    literal<TestSource>('entity').then(
                        argument('target', entityArgument()).executes(succeed).redirect(execute)
                    )
                )
                .build()
        );
        execute.addChild(literal<TestSource>('run').redirect(registry.getRoot()).build());
        return registry;
    };

    it('spells the subcommands the way Mojang does: one-value enums and a chained tail', () => {
        const { commands } = flattenCommandTree(buildExecute());
        const execute = commands[0]!;

        expect(
            execute.overloads.map((overload) => ({
                chaining: overload.chaining,
                parameters: overload.parameters.map((parameter) => parameter.shape)
            }))
        ).toEqual([
            {
                chaining: true,
                parameters: [
                    { kind: 'enum', name: 'OPTION_AS_AT', values: ['as', 'at'] },
                    { kind: 'basic', type: 'SELECTION' },
                    { kind: 'chained', name: 'EXECUTECHAINEDOPTION_0' }
                ]
            },
            {
                chaining: true,
                parameters: [
                    { kind: 'enum', name: 'OPTION_IF_UNLESS', values: ['if', 'unless'] },
                    { kind: 'enum', name: 'OPTION_ENTITY', values: ['entity'] },
                    { kind: 'basic', type: 'SELECTION' },
                    { kind: 'chained', name: 'EXECUTECHAINEDOPTION_0' }
                ]
            },
            {
                chaining: false,
                parameters: [
                    { kind: 'enum', name: 'OPTION_RUN', values: ['run'] },
                    { kind: 'basic', type: 'CODEBUILDERARGS' }
                ]
            }
        ]);
    });

    it('makes the chained tail optional exactly where the node executes on its own', () => {
        const { commands } = flattenCommandTree(buildExecute());
        const optional = commands[0]!.overloads.map((overload) => overload.parameters.at(-1)?.optional);

        // `execute as @e` is not a command; `execute if entity @e` is.
        expect(optional).toEqual([false, true, false]);
    });

    it('builds the chained table from the subcommand keywords', () => {
        const { commands } = flattenCommandTree(buildExecute());

        expect(commands[0]?.chainedSubcommands).toEqual([
            { name: 'EXECUTECHAINEDOPTION_0', values: ['as', 'at', 'if', 'run', 'unless'] }
        ]);
    });

    it('reports the cycle and the root redirect rather than dropping either', () => {
        const { notes } = flattenCommandTree(buildExecute());
        const reasons = notes.map((note) => note.reason);

        expect(reasons).toContain('redirect-cycle');
        expect(reasons).toContain('redirect-to-root');
        expect(notes.filter((note) => note.reason === 'redirect-cycle')[0]?.message).toContain(
            'is a cycle no overload list can hold'
        );
        expect(notes.every((note) => note.severity === 'degraded')).toBe(true);
    });
});
