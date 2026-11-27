import { entity_identifiers } from '@jsprismarine/bedrock-data/v2225';
import { ActorType } from '@jsprismarine/minecraft/generated/v2225/ActorType';
import { describe, expect, it } from 'vitest';

import { DamageCause } from '../../../entity/DamageCause';
import { advertisedActorTypes } from '../../../testing/advertisedActorTypes.test-utils';
import { actorTypeOf, commandTelemetryOf, killTelemetryOf } from './bedrockTelemetry';

// The unique ids the pinned BDS 1.26.60 gave its player and the pig it punched, and the bytes it
// sent; `LegacyTelemetryEventPacket.test.ts` in the protocol package decodes the same three.
const BDS_PLAYER = -4294967295n;
const BDS_PIG = -4294967287n;

const bytesOf = (packet: ReturnType<typeof commandTelemetryOf>): string => {
    packet.encode();
    return packet.getBuffer().toString('hex');
};

describe('the telemetry a Bedrock client is sent', () => {
    it('reports a command the player ran as BDS did', () => {
        expect(bytesOf(commandTelemetryOf(BDS_PLAYER, '/me waves'))).toBe('41fdffffff1f1601080200026d6500');
    });

    it('reports a mob the player punched to death as BDS did', () => {
        const kill = killTelemetryOf({
            kind: 'killedMob',
            player: BDS_PLAYER,
            victim: BDS_PIG,
            cause: DamageCause.Attack,
            projectile: undefined
        });
        expect(bytesOf(kill)).toBe('41fdffffff1f080104fdffffff1fedffffff1f02040100');
    });

    it('reports the player killed by a zombie as BDS did', () => {
        const death = killTelemetryOf({
            kind: 'killedBy',
            player: BDS_PLAYER,
            killer: 'minecraft:zombie',
            cause: DamageCause.Attack
        });
        expect(bytesOf(death)).toBe('41fdffffff1f0c0106c0ac18000400');
    });

    it('names the projectile that dealt a killing blow by its actor type', () => {
        const kill = killTelemetryOf({
            kind: 'killedMob',
            player: 1n,
            victim: 2n,
            cause: DamageCause.Projectile,
            projectile: 'minecraft:arrow'
        });
        expect(kill.eventData).toMatchObject({ instigatorChildActorType: ActorType.ARROW, damageSource: 3 });
    });
});

describe('actorTypeOf', () => {
    it('gives every actor the 2225 client is told of a type of its own, not a category', () => {
        // A category's low byte is 0: `MINECART` is every minecart, `MOB` every mob.
        const unresolved = [...advertisedActorTypes(entity_identifiers)].filter(
            (identifier) => (actorTypeOf(identifier) & 0xff) === 0 || actorTypeOf(identifier) === ActorType.UNDEFINED
        );
        expect(unresolved).toEqual([]);
    });

    it('reports an addon entity as Undefined', () => {
        expect(actorTypeOf('example:goblin')).toBe(ActorType.UNDEFINED);
    });
});
