# Spike: the noise stack in C, called through `node:ffi`

Run 2026-11-21 for phase 6 of [the terrain generation rearchitecture](../../../plans/worldgen-rearchitecture.md), on an Apple M1 Pro with Node.js 26.12.1 and Apple clang. The machine was shared; every timing below is indicative and carries its load average. The counts and the bit comparison are the results.

## Question

Can a C library reproduce worldgen's noise bit for bit, and what does a call through `node:ffi` cost? Noise is the largest cost left in terrain generation: about 15% of a single-thread `bench:chunks` profile with its octave stacks, after phases 0 to 4.

## What was built

[`noise.c`](noise.c) is Java's `ImprovedNoise` sample and the octave stack `NormalNoise.create` builds, written in the rounding of `packages/worldgen/src/noise/PerlinNoise.ts`, `NoiseStack.ts` and `GradientNoise.ts`:

- every `f32(...)` there is one `float` operation here, and everything else is `double`;
- it is compiled with `-ffp-contract=off`, so no multiply and add fuse.

A stack is registered once from its permutation tables and per-layer offsets, frequency and amplitude. It is then sampled one position per call (`jsp_stack_get3`) or a buffer of positions per call (`jsp_stack_fill`), with both buffers passed as raw pointers from `ffi.getRawPointer`.

## Results

**Bit for bit.** [`compare.mjs`](compare.mjs) samples six vanilla overworld noises (continentalness, erosion, ridge, jagged, cave_cheese, ore_veininess; 2 to 32 Perlin layers) at 200,000 positions each over ±30,000 blocks, with seed 1234, from the committed registry vectors. There were **0 mismatches** in 1.2 million samples, comparing the float bits with `Object.is`.

**Time per sample** (indicative; best of seven rounds of 200,000):

| Noise | Layers | TypeScript | C, one call per buffer |
| --- | --- | --- | --- |
| continentalness | 18 | 1,100 ns | 244 ns |
| erosion | 8 | 514 ns | 110 ns |
| jagged | 32 | 2,023 ns | 433 ns |
| cave_cheese | 14 | 891 ns | 190 ns |
| ore_veininess | 2 | 132 ns | 28 ns |

The first run was at load average 13 to 16. A rerun from these files at 20 to 23 gave the same bits and a C advantage of 3.4 to 9.3 times. Per Perlin layer, that is about 60 ns in TypeScript against about 14 ns in C.

**Call cost** ([`ffi-calls.mjs`](ffi-calls.mjs), [`tiny.c`](tiny.c); empty functions, 1,000,000 calls, load average 20 to 23):

| Signature | ns per call |
| --- | --- |
| `(f64) -> f64` | 6.9 |
| `(f64, f64, f64) -> f64` | 6.9 |
| `(f64, f64, f64, f64) -> f64` | 7.1 |
| `(int32, f64, f64, f64) -> f64` | 194 |
| `(int32, int32) -> int32` | 36 |

These are wall-clock figures on a loaded machine, so they are indicative only. On Node.js 26.12.1 here, the all-`f64` signatures cost about 7 ns a call, one `int32` argument about 190 ns, and the first version of the per-sample entry, which took its handle as a pointer, about 200 ns. Node.js documents integer and pointer arguments as eligible for its fast path too, so this spike does not establish why they were slower. It only shows that the all-`f64` shape was the fast one in this setup.

## What follows for phase 6

1. **The kernel can be bit-exact.** Writing every rounding step out explicitly and compiling without contraction was enough for these noises. The test for a native kernel is this comparison, run in CI against the TypeScript implementation and the Java vectors.
2. **Per-sample calls look viable with all-`f64` signatures, the shape that measured fastest here.**
   - A stack's handle travels as an `f64` index into a table in the library. That is a choice this spike's measurements support, not a requirement of `node:ffi`.
   - A native `Noise` with all-`f64` calls can replace each noise leaf of the density program without the volume runtime of phase 2. That is about 7 ns of call cost against about 250 to 2,000 ns of work per sample.
   - Buffer calls amortize even that, but need callers that have a batch of positions.
3. **Order of work this implies:**
   1. A package with the C kernel and its bindings, with TypeScript noise as the fallback wherever no build is installed.
   2. Worldgen uses the native stacks for `NormalNoise` when the library loads.
   3. Blended and smeared noise, the aquifer and the density program follow, each by the same bit comparison.
4. **Packaging comes with it.** `native-network` and `script-host` each carry their own copy of the platform key, manifest, digest check and install script, and share the build and release workflow through `scripts/native/packages.mts` and `.github/workflows/native-library.yml`. A third native package should take the shared copy out first rather than make a third.
5. **Not measured here:** `bun:ffi` and scriptc's FFI for these signatures (`worldgen-kernel-runtime-options.md` measured scalar calls at 5.8 and 0.9 ns), Windows, Linux, and the effect on a whole chunk.

## Reproduction

```sh
cc -O2 -ffp-contract=off -fPIC -shared -o /tmp/libnoise.dylib docs/research/spikes/native-noise/noise.c
cc -O2 -fPIC -shared -o /tmp/libtiny.dylib docs/research/spikes/native-noise/tiny.c
pnpm exec turbo run build --filter=@jsprismarine/worldgen
cd packages/worldgen
node --no-warnings ../../docs/research/spikes/native-noise/compare.mjs /tmp/libnoise.dylib
node --no-warnings ../../docs/research/spikes/native-noise/ffi-calls.mjs /tmp/libtiny.dylib
uptime
```
