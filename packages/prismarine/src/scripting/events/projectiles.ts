/**
 * `world.afterEvents.projectileHitEntity` and `projectileHitBlock`, from the server's
 * `projectileHit` event.
 */
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { blockValue, dimensionValue, entityValue, fieldsOf, vectorValue } from './values';
import type { WorldEventSource } from './worldEvents';

/** The face a projectile moving this way strikes first: the one it moves against the most. */
const faceAgainst = ({ x, y, z }: { readonly x: number; readonly y: number; readonly z: number }): string => {
    const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)];
    if (ay >= ax && ay >= az) return y > 0 ? 'Down' : 'Up';
    if (ax >= az) return x > 0 ? 'West' : 'East';
    return z > 0 ? 'North' : 'South';
};

/** The projectile hits of one level. */
export const projectileEvents = (server: Server, level: Level): WorldEventSource => ({
    events: (listener) =>
        server.getKernel().events.on('projectileHit', (event) => {
            const world = event.getWorld();
            if (world.getLevel() !== level) return;
            const owner = event.getOwner();
            const at = event.getLocation();
            const velocity = event.getVelocity();
            const target = event.getTarget();
            const common = {
                projectile: entityValue(event.getProjectile()),
                source: owner === null ? undefined : entityValue(owner),
                dimension: dimensionValue(world),
                location: vectorValue(at.x, at.y, at.z),
                hitVector: vectorValue(velocity.x, velocity.y, velocity.z)
            };
            if ('entity' in target) {
                listener({
                    event: 'ProjectileHitEntityAfterEvent',
                    fields: fieldsOf({ ...common, hitEntity: entityValue(target.entity) })
                });
                return;
            }
            const { x, y, z } = target.block;
            listener({
                event: 'ProjectileHitBlockAfterEvent',
                fields: fieldsOf({
                    ...common,
                    hitBlock: blockValue(world, { x, y, z }),
                    hitFace: faceAgainst(velocity),
                    hitFaceLocation: vectorValue(at.x - x, at.y - y, at.z - z)
                })
            });
        })
});
