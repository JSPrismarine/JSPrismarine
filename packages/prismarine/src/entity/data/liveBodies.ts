/**
 * The body a client is sent for each data-driven entity.
 *
 * A {@link DataEntity} is a component set and a position. It is not an
 * {@link Entity}, so nothing tracks it, nothing serializes it and no client
 * ever hears about it. This index closes that gap: one {@link GenericEntity}
 * per data entity, added to the live world when the runtime announces a spawn
 * and taken out again when it announces a removal.
 *
 * `GenericEntity` and not one of the 111 written classes, and the distinction
 * is the whole point. A `Zombie` runs `Mob.update`, which runs the legacy goal
 * set and the legacy physics, and two systems steering one body fight each
 * other every tick. `GenericEntity` inherits `Entity.update`, which only runs
 * the invulnerability timer down, so the data runtime is the only thing
 * driving it. The client draws a Bedrock mob from its identifier either way.
 *
 * Health crosses in both directions, because both sides can change it. The
 * runtime's `minecraft:health` attribute is the truth; a blow that arrived
 * through the legacy damage pipeline - a player swinging at the body - shows
 * up here as the live health having dropped below what was last written, and
 * that difference is handed back to the runtime so the loot, the death and
 * the retaliation all happen in one place.
 */
import { Vector3 } from '@jsprismarine/math';

import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import { Attribute, AttributeIds } from '../Attribute';
import type { Entity } from '../Entity';
import { GenericEntity } from '../GenericEntity';
import type { DataEntity } from './DataEntity';
import type { EntityRuntime } from './EntityRuntime';

/** How far an entity has to move before the movement is worth putting on the wire, in blocks. */
const MOVEMENT_EPSILON = 1e-4;

/** What {@link LiveBodies} is built over. */
export interface LiveBodiesOptions {
    /** The live world, read at call time, because the runtime outlives any one world load. */
    world(): World | undefined;
    /** Receives everything the mirror met and could not carry out. */
    report(message: string): void;
}

/** One live body per data-driven entity, kept in step with it. */
export class LiveBodies {
    private readonly bodies = new Map<number, Entity>();
    /** The health last written onto each body, which is how a legacy blow is noticed. */
    private readonly written = new Map<number, number>();
    private readonly options: LiveBodiesOptions;

    public constructor(options: LiveBodiesOptions) {
        this.options = options;
    }

    /** The live body of one data entity, or undefined when it has none. */
    public bodyOf(id: number): Entity | undefined {
        return this.bodies.get(id);
    }

    /** How many bodies are in the world, which is what a test counts. */
    public get size(): number {
        return this.bodies.size;
    }

    /**
     * Puts a body in the world for an entity the runtime just made.
     *
     * The maximum health is the type's rather than `Attributes.getDefaults`'
     * twenty, so a client draws a ten-health cow with five hearts instead of
     * with two and a half.
     */
    public add(entity: DataEntity): void {
        const world = this.options.world();
        if (world === undefined) return;

        const at = entity.position;
        const body = new GenericEntity({
            identifier: entity.identifier,
            position: Position.fromVector3(new Vector3(at.x, at.y, at.z), world),
            yaw: entity.body.yaw,
            headYaw: entity.body.yaw,
            pitch: entity.body.pitch
        });

        const health = entity.instance.attributes.get('health');
        if (health !== undefined) {
            body.attributes.setAttribute(
                new Attribute({
                    name: AttributeIds.Health,
                    min: 0,
                    max: health.max,
                    def: health.max,
                    value: health.current
                })
            );
            this.written.set(entity.id, health.current);
        }

        this.bodies.set(entity.id, body);
        void world.addEntity(body).catch((error: unknown) => this.failed('add', error));
    }

    /** Takes the body of an entity the runtime removed back out of the world. */
    public drop(entity: DataEntity): void {
        const body = this.bodies.get(entity.id);
        this.bodies.delete(entity.id);
        this.written.delete(entity.id);
        if (body === undefined) return;

        const world = this.options.world();
        if (world === undefined) return;
        void world.removeEntity(body).catch((error: unknown) => this.failed('remove', error));
    }

    /**
     * Brings every body back in step with its entity, after a tick of the
     * runtime.
     *
     * Damage first and position second. A blow that landed this tick has to
     * reach the runtime before the loot and the removal it may cause, and a
     * body that is removed has no position left to send.
     *
     * @returns The movement broadcasts, which the caller awaits with the rest
     *   of its tick.
     */
    public sync(runtime: EntityRuntime): readonly Promise<void>[] {
        const moves: Promise<void>[] = [];

        for (const entity of runtime.all()) {
            const body = this.bodies.get(entity.id);
            if (body === undefined) continue;

            this.takeLegacyDamage(runtime, entity, body);
            // Removed by the damage above, in which case its body has gone with it.
            if (!this.bodies.has(entity.id)) continue;

            this.showHealth(entity, body);
            const move = this.showPosition(entity, body);
            if (move !== undefined) moves.push(move);
        }

        return moves;
    }

    /** Forgets every body, for a world that is closing. */
    public clear(): void {
        this.bodies.clear();
        this.written.clear();
    }

    /**
     * Hands the runtime whatever the legacy damage pipeline took off the body.
     *
     * The source travels with it, so a player who hits a zombie is who the
     * zombie's `hurt_by_target` goes after.
     */
    private takeLegacyDamage(runtime: EntityRuntime, entity: DataEntity, body: Entity): void {
        const expected = this.written.get(entity.id);
        if (expected === undefined) return;

        const taken = expected - body.getHealth();
        if (taken <= 0) return;

        const source = body.getLastDamageSource();
        const attacker = source?.attacker;
        runtime.hurt(
            entity,
            attacker === null || attacker === undefined ? undefined : Number(attacker.getRuntimeId()),
            source?.cause ?? 'generic',
            taken
        );
    }

    /** Writes the runtime's health onto the body, where the attribute flush will find it. */
    private showHealth(entity: DataEntity, body: Entity): void {
        const health = entity.instance.attributes.get('health');
        if (health === undefined) return;

        body.attributes.setValue(AttributeIds.Health, health.current);
        this.written.set(entity.id, health.current);
    }

    /** Moves the body to where the runtime put the entity, when that is anywhere new. */
    private showPosition(entity: DataEntity, body: Entity): Promise<void> | undefined {
        const at = entity.position;
        const here = body.getPosition();
        const still =
            Math.abs(here.getX() - at.x) < MOVEMENT_EPSILON &&
            Math.abs(here.getY() - at.y) < MOVEMENT_EPSILON &&
            Math.abs(here.getZ() - at.z) < MOVEMENT_EPSILON &&
            body.yaw === entity.body.yaw &&
            body.pitch === entity.body.pitch;
        if (still) return undefined;

        return body.setPosition({
            position: new Vector3(at.x, at.y, at.z),
            yaw: entity.body.yaw,
            headYaw: entity.body.yaw,
            pitch: entity.body.pitch
        });
    }

    private failed(what: string, error: unknown): void {
        this.options.report(`could not ${what} the body of a data-driven entity: ${String(error)}`);
    }
}
