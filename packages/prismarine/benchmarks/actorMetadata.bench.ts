/**
 * Actor metadata cost per ticking entity: `pnpm bench:actor-metadata`.
 *
 * Runs the live-body sync decision for 300 entities over many ticks, once the way it was (build the
 * whole projection every tick and compare it with the last) and once the way it is now (compare the
 * small set of per-tick inputs and build a projection only when they moved). Reports projections
 * built, CPU per entity-tick and a digest of every projection that changed, which must match.
 */
import { createHash } from 'node:crypto';

import {
    actorMetadataInputs,
    actorMetadataProjection,
    sameActorMetadataInputs,
    sameActorMetadataProjection
} from '../src/entity/data/actorMetadata';
import type { ActorMetadataInputs, ActorMetadataProjection } from '../src/entity/data/actorMetadata';
import { referenceActorMetadataProjection } from '../src/entity/data/actorMetadata.reference.test.helper';
import { FLOOR_Y, TestEntityWorld, entityFixture } from '../src/entity/data/testing';

const ENTITIES = 300;
const TICKS = 400;

/** Fresh entities for each run, so one run's leftover state cannot reach the other. */
const spawnEntities = () => {
    const fixture = entityFixture(new TestEntityWorld());
    return Array.from({ length: ENTITIES }, (_, index) => {
        const entity = fixture.runtime.spawn('minecraft:cow', {
            x: (index % 20) + 0.5,
            y: FLOOR_Y + 1,
            z: Math.floor(index / 20) + 0.5
        });
        if (entity === undefined) throw new Error('the fixture declares no minecraft:cow');
        return entity;
    });
};

/** A few entities change something every so often, the way a burning or renamed mob does. */
const disturb = (entities: ReturnType<typeof spawnEntities>, tick: number): void => {
    for (let index = 0; index < entities.length; index += 25) {
        const entity = entities[index]!;
        entity.body.fireTicks = (tick + index) % 60 < 20 ? 10 : 0;
        if (tick % 100 === index % 100) entity.body.nameTag = tick % 200 === 0 ? 'A' : 'B';
    }
};

const run = (shipped: boolean): { projections: number; cpuMicros: number; digest: string } => {
    const entities = spawnEntities();
    const lastProjection = new Map<number, ActorMetadataProjection>();
    const lastInputs = new Map<number, ActorMetadataInputs>();
    const digest = createHash('sha256');
    let projections = 0;

    const sync = (tick: number): void => {
        for (const [index, entity] of entities.entries()) {
            const changed = (metadata: ActorMetadataProjection) => {
                if (sameActorMetadataProjection(lastProjection.get(index), metadata)) return;
                lastProjection.set(index, metadata);
                digest.update(
                    JSON.stringify(metadata, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
                );
                digest.update(`@${index}:${tick};`);
            };
            if (shipped) {
                const inputs = actorMetadataInputs(entity);
                if (sameActorMetadataInputs(lastInputs.get(index), inputs)) continue;
                lastInputs.set(index, inputs);
                projections += 1;
                changed(actorMetadataProjection(entity));
            } else {
                projections += 1;
                changed(referenceActorMetadataProjection(entity));
            }
        }
    };

    for (let tick = 0; tick < 20; tick++) sync(tick);
    projections = 0;
    const cpuBefore = process.cpuUsage();
    for (let tick = 20; tick < 20 + TICKS; tick++) {
        disturb(entities, tick);
        sync(tick);
    }
    const cpu = process.cpuUsage(cpuBefore);
    return { projections, cpuMicros: cpu.user + cpu.system, digest: digest.digest('hex').slice(0, 12) };
};

for (const shipped of [false, true]) {
    const { projections, cpuMicros, digest } = run(shipped);
    console.log(
        `${shipped ? 'inputs first' : 'every tick '}  entities=${ENTITIES} ticks=${TICKS} projections built=${projections} ` +
            `cpu=${(cpuMicros / (ENTITIES * TICKS)).toFixed(3)}us/entity-tick digest=${digest}`
    );
}
