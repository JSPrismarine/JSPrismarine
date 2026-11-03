/**
 * Compares walker and compiled wire layouts in monomorphic and megamorphic call sites.
 *
 * Run with pnpm --filter @jsprismarine/protocol run bench:layout.
 */
import BinaryStream from '@jsprismarine/binaryutils';
import { performance } from 'node:perf_hooks';

import { wireDefinitions } from '../src/wire/definitions';
import { isGated } from '../src/wire/define';
import * as t from '../src/wire/fieldTypes';
import type { WireLayout } from '../src/wire/WireLayout';
import { layoutAt } from '../src/wire/WireLayout';

const PROTOCOL_VERSION = 2225;
const ITERATIONS = 500_000;
const WARMUP_ITERATIONS = 50_000;
const SAMPLES = 5;
const primitiveTypes: ReadonlySet<object> = new Set([
    t.uint8,
    t.bool,
    t.varint32,
    t.varuint32,
    t.varint64,
    t.varuint64,
    t.lf32,
    t.li16,
    t.li32,
    t.int8,
    t.string,
    t.lu64,
    t.li64,
    t.byteArray,
    t.vec3,
    t.blockPos,
    t.i32,
    t.lu16,
    t.lu32
]);

interface LayoutSample {
    readonly name: string;
    readonly walker: WireLayout;
    readonly compiled: WireLayout;
    readonly payload: Record<string, unknown>;
    readonly encoded: Buffer;
    readonly decodeStream: BinaryStream;
}

const samples: LayoutSample[] = [...wireDefinitions.values()]
    .filter((definition) => {
        const fields = Object.values(definition.fields);
        return fields.length > 0 && fields.every((spec) => primitiveTypes.has(isGated(spec) ? spec.of : spec));
    })
    .map((definition) => {
        const walker = layoutAt(definition, PROTOCOL_VERSION, false);
        const compiled = layoutAt(definition, PROTOCOL_VERSION, true);
        if (compiled.implementation !== 'compiled') {
            throw new Error('Dynamic wire-layout compilation is unavailable in this runtime');
        }

        const payload = walker.decode(new BinaryStream(Buffer.alloc(256)));
        const walkerOutput = new BinaryStream(undefined, 0, 256);
        walker.encode(walkerOutput, payload);
        const encoded = Buffer.from(walkerOutput.getWriteBuffer());
        const compiledOutput = new BinaryStream(undefined, 0, 256);
        compiled.encode(compiledOutput, payload);
        if (!compiledOutput.getWriteBuffer().equals(encoded)) {
            throw new Error(definition.name + ' compiled bytes differ from the field walker');
        }

        return { name: definition.name, walker, compiled, payload, encoded, decodeStream: new BinaryStream(encoded) };
    });

if (samples.length < 2) throw new Error('Expected at least two primitive-only wire definitions');

const monomorphic = [samples[0]!];
const megamorphic = samples;
let decodedSink: Record<string, unknown> | undefined;

const runEncode = (
    layouts: readonly LayoutSample[],
    implementation: 'walker' | 'compiled',
    iterations: number
): void => {
    const stream = new BinaryStream(undefined, 0, 256);
    for (let index = 0; index < iterations; index++) {
        const sample = layouts[index % layouts.length]!;
        sample[implementation].encode(stream, sample.payload);
        stream.resetWrite();
    }
};

const runDecode = (
    layouts: readonly LayoutSample[],
    implementation: 'walker' | 'compiled',
    iterations: number
): void => {
    for (let index = 0; index < iterations; index++) {
        const sample = layouts[index % layouts.length]!;
        sample.decodeStream.reuse(sample.encoded);
        decodedSink = sample[implementation].decode(sample.decodeStream);
    }
};

const median = (values: readonly number[]): number => {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.floor(ordered.length / 2)]!;
};

const measure = (name: string, run: (iterations: number) => void): void => {
    run(WARMUP_ITERATIONS);
    const measurements: number[] = [];
    for (let sample = 0; sample < SAMPLES; sample++) {
        const started = performance.now();
        run(ITERATIONS);
        measurements.push(((performance.now() - started) * 1_000_000) / ITERATIONS);
    }
    console.log(
        JSON.stringify({
            benchmark: 'protocol-wire-layout',
            case: name,
            nsPerPacket: median(measurements)
        })
    );
};

for (const implementation of ['walker', 'compiled'] as const) {
    measure('monomorphic-encode-' + implementation, (iterations) => runEncode(monomorphic, implementation, iterations));
    measure('megamorphic-encode-' + implementation, (iterations) => runEncode(megamorphic, implementation, iterations));
    measure('monomorphic-decode-' + implementation, (iterations) => runDecode(monomorphic, implementation, iterations));
    measure('megamorphic-decode-' + implementation, (iterations) => runDecode(megamorphic, implementation, iterations));
}

console.log(
    JSON.stringify({
        benchmark: 'protocol-wire-layout',
        protocolVersion: PROTOCOL_VERSION,
        primitiveLayoutCount: samples.length,
        monomorphicDefinition: monomorphic[0]!.name,
        decodedFieldCount: Object.keys(decodedSink ?? {}).length
    })
);
