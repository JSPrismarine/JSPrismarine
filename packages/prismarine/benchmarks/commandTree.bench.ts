/**
 * Measures vanilla command registration, argument shape description, flattening, and recipient fanout.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:commands [samples] [players]`.
 */
import os from 'node:os';

import { flattenCommandTree, registerVanillaCommands, resourceArgument } from '@jsprismarine/commands';
import type Server from '../src/Server';
import { CommandManager } from '../src/command/CommandManager';
import { stub } from '../src/testing/stub.test.helper';

const args = process.argv.slice(2).filter((argument) => argument !== '--');
const SAMPLES = Number.parseInt(args[0] ?? '5', 10);
const PLAYER_COUNT = Number.parseInt(args[1] ?? '64', 10);
const WARMUPS = 1;

for (const [name, value] of [
    ['samples', SAMPLES],
    ['players', PLAYER_COUNT]
] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

const median = (values: readonly number[]): number =>
    [...values].sort((left, right) => left - right)[values.length >> 1]!;

const measure = <T>(label: string, operation: () => T): { readonly medianMs: number; readonly result: T } => {
    for (let index = 0; index < WARMUPS; index += 1) operation();
    const samples: number[] = [];
    let result!: T;
    for (let index = 0; index < SAMPLES; index += 1) {
        const started = performance.now();
        result = operation();
        samples.push(performance.now() - started);
    }
    const medianMs = median(samples);
    console.log(`${label}: median ${medianMs.toFixed(3)} ms (${SAMPLES} samples)`);
    return { medianMs, result };
};

const registry = registerVanillaCommands();
measure('registerVanillaCommands', () => registerVanillaCommands());

const resource = resourceArgument(
    'minecraft:item',
    Array.from({ length: 2_000 }, (_unused, index) => `benchmark:item_${index}`)
);
const shapeIterations = 500;
const shapeSample = measure('resource argument shape descriptions', () => {
    let values = 0;
    for (let index = 0; index < shapeIterations; index += 1) {
        const shape = resource.describeBedrock();
        if (shape?.kind === 'enum') values += shape.values.length;
    }
    return values;
});

const flattenSample = measure('flattenCommandTree', () => flattenCommandTree(registry));
console.log(
    `flatten output: ${flattenSample.result.commands.length} commands, ${flattenSample.result.notes.length} notes`
);

const manager = new CommandManager(stub<Server>());
const baseCommands = manager.getVanillaCommandList();
const recipientPermissions = Array.from({ length: PLAYER_COUNT }, (_unused, player) => {
    const granted = new Set<string>();
    for (let index = 0; index < baseCommands.length; index += 1) {
        if ((index + player) % 5 === 0) granted.add(`minecraft.command.${baseCommands[index]!.name}`);
    }
    return granted;
});
const fanout = measure('cached command list recipient fanout', () => {
    let visibleCommands = 0;
    for (const permissions of recipientPermissions) {
        for (const command of manager.getVanillaCommandList()) {
            if (permissions.has(`minecraft.command.${command.name}`)) visibleCommands += 1;
        }
    }
    return visibleCommands;
});

console.log(
    JSON.stringify({
        platform: `${os.platform()} ${os.arch()}`,
        node: process.version,
        players: PLAYER_COUNT,
        visibleCommands: fanout.result,
        shapeValueReads: shapeSample.result,
        sameCachedTree: manager.getVanillaCommandList() === baseCommands
    })
);
