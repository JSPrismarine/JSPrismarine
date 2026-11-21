// Compares the spike's C noise stack with @jsprismarine/worldgen's, bit for bit and by time.
// Run from packages/worldgen after a build: node --no-warnings ../../docs/research/spikes/native-noise/compare.mjs <libnoise path>
import { readFileSync } from 'node:fs';

import { RandomState } from '../../../../packages/worldgen/dist/RandomState.js';
import { WorldgenData } from '../../../../packages/worldgen/dist/WorldgenData.js';

const library = process.argv[2];
const registry = JSON.parse(
    readFileSync(new URL('../../../../packages/worldgen/vectors/26.3/surface-registries.json', import.meta.url), 'utf8')
);
const parse = (documents) => new Map(Object.entries(documents).map(([id, document]) => [id, JSON.parse(document)]));
const data = new WorldgenData({
    densityFunctions: parse(registry.densityFunctions),
    noises: parse(registry.noises),
    noiseSettings: parse(registry.noiseSettings)
});
const state = new RandomState(data, 1234n, data.settings('minecraft:overworld'));
const ffi = process.getBuiltinModule('node:ffi');
const native = ffi.dlopen(library, {
    jsp_stack_create: { arguments: ['pointer', 'pointer', 'int32'], return: 'pointer' },
    jsp_stack_fill: { arguments: ['pointer', 'pointer', 'pointer', 'int32'], return: 'void' }
}).functions;

const N = 200_000;
const fastest = (run) => {
    let best = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 7; round++) {
        const start = performance.now();
        run();
        best = Math.min(best, performance.now() - start);
    }
    return ((best * 1e6) / N).toFixed(1);
};

for (const id of [
    'minecraft:continentalness',
    'minecraft:erosion',
    'minecraft:ridge',
    'minecraft:jagged',
    'minecraft:cave_cheese',
    'minecraft:ore_veininess'
]) {
    const noise = state.noise(id);
    const layers = noise.layers;
    const perms = new Uint8Array(layers.length * 256);
    const params = new Float64Array(layers.length * 5);
    layers.forEach((layer, index) => {
        // The permutation table is protected in TypeScript; the spike reads it directly.
        perms.set(layer.noise.perms, index * 256);
        params.set(
            [layer.noise.offsetX, layer.noise.offsetY, layer.noise.offsetZ, layer.frequency, layer.amplitude],
            index * 5
        );
    });
    const handle = native.jsp_stack_create(
        ffi.getRawPointer(perms.buffer),
        ffi.getRawPointer(params.buffer),
        layers.length
    );

    const xyz = new Float64Array(N * 3);
    const out = new Float64Array(N);
    let seed = 7;
    for (let index = 0; index < xyz.length; index++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        xyz[index] = (seed / 4294967296 - 0.5) * 60000;
    }
    native.jsp_stack_fill(handle, ffi.getRawPointer(xyz.buffer), ffi.getRawPointer(out.buffer), N);
    let mismatches = 0;
    for (let index = 0; index < N; index++) {
        if (!Object.is(noise.get3(xyz[index * 3], xyz[index * 3 + 1], xyz[index * 3 + 2]), out[index])) mismatches++;
    }
    const typescript = fastest(() => {
        let sum = 0;
        for (let index = 0; index < N; index++)
            sum += noise.get3(xyz[index * 3], xyz[index * 3 + 1], xyz[index * 3 + 2]);
        return sum;
    });
    const batch = fastest(() =>
        native.jsp_stack_fill(handle, ffi.getRawPointer(xyz.buffer), ffi.getRawPointer(out.buffer), N)
    );
    console.log(`${id} layers=${layers.length} mismatches=${mismatches} ns/sample ts=${typescript} c-batch=${batch}`);
    if (mismatches > 0) process.exitCode = 1;
}
