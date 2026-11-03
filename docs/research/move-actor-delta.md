# MoveActorDelta compression measurement

## Decision

Keep `MoveActorAbsolutePacket` as the server's movement update. The measured `MoveActorDeltaPacket` stream used 4.34% more compressed bytes across the tested protocols and viewers. Encoding the same delta stream once per entity or once per viewer produced identical bytes, so per-viewer state adds no bandwidth benefit in this measurement.

The comparison covers movement packets only. It does not include entity spawn packets, RakNet headers, or IP and UDP headers. The trace comes from seeded runs of the data-driven `EntityRuntime`, not a live server capture. Each viewer sees the same actors, and the runtime has no separate head-yaw field, so the benchmark uses body yaw for both yaw values. These limits make the result a decision for the current fan-out design, not a claim about every live world.

## Method

[`entityMovementDelta.bench.ts`](../../packages/prismarine/benchmarks/entityMovementDelta.bench.ts) records 100 ticks from three deterministic runtime scenarios: one zombie pursuing two players walking in circles, one distant cow with no players nearby, and 128 sheep and cows. The runtime uses the vanilla behavior definitions and a flat stone floor with air above it. Seeds 71, 72, and 73 fix the scenarios. The benchmark records each actor's changed pose once per tick, then replays that sequence through both packet formats.

Each tick is encoded as a compressed batch with the production compression level and threshold. The benchmark tests protocol codecs 2193 and 2225, using ZLIB level 7 and a 256-byte threshold, and records ten viewers per codec. The byte counts include the encoded compressed batch buffer. The per-viewer check decodes each delta stream and compares its digest with the per-entity stream.

## Results

Compressed bytes per viewer and protocol:

| Scenario | Updates | Absolute | Delta | Delta change |
|---|---:|---:|---:|---:|
| Walking | 100 | 2,100 | 2,276 | +8.38% |
| Idle | 3 | 63 | 54 | -14.29% |
| Farm mobs | 6,642 | 93,110 | 97,074 | +4.26% |
| Total across 2 codecs and 10 viewers per codec | 6,745 | 1,905,460 | 1,988,080 | +4.34% |

For each scenario and protocol, the delta stream encoded per entity and the delta stream encoded per viewer had the same compressed byte count and decoded digest. The total therefore shows no bandwidth difference between those two state models. The existing [`entityMovementFanout.bench.ts`](../../packages/prismarine/benchmarks/entityMovementFanout.bench.ts) also confirms that the shared absolute movement fan-out gives all 20 viewers the same decoded packet digest.

Delta packets do save bytes in the idle sample, but they cost more in the walking and farm samples, which account for nearly all recorded updates. The aggregate result does not justify adding per-viewer movement state, teleport invalidation, and resynchronization behavior. Revisit the decision if a recorded live-server trace shows a clear reduction under the same compression settings.

## Reproduction

```sh
pnpm --filter @jsprismarine/prismarine run bench:entity-movement-delta
pnpm --filter @jsprismarine/prismarine run bench:entity-movement-fanout
```
