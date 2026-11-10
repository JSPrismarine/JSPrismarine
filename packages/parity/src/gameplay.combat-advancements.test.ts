import type { DamageIntent } from '@jsprismarine/prismarine/entity/data/damagePipeline';
import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { realStack } from './serverStack.ts';
import { reportParityCases } from './trackerCases.ts';

/** The runtime id the player swinging in this scenario goes by. */
const PLAYER_ID = 9_000_001;

/** A player's sword on a mob, as the legacy melee path hands it to the store. */
const swing = (target: number, amount: number): DamageIntent => ({
    target,
    attacker: PLAYER_ID,
    cause: 'entity_attack',
    amount,
    source: { route: 'melee', graced: true, mitigated: true }
});

describeFamily(
    FAMILIES.gameplayCombatAdvancements,
    [REFERENCES.bedrockBehaviorPack, REFERENCES.javaEntityAttributes],
    () => {
        it('hears a player blow and a player kill inside the blow, before the death removes the mob', () => {
            const { runtime, world } = realStack();
            world.players = [{ id: PLAYER_ID, identifier: 'minecraft:player', position: { x: 2.5, y: 64, z: 0.5 } }];
            const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: 64, z: 0.5 });
            if (cow === undefined) throw new Error('the Java stack declares no minecraft:cow');
            const startingHealth = cow.instance.attributes.get('health')?.current ?? 0;

            const heard: { died: boolean; inStore: boolean; health: number | undefined; taken: number }[] = [];
            const commitsBefore = world.commits.length;
            world.onCommit = (commit) =>
                heard.push({
                    died: commit.died,
                    inStore: runtime.byId(commit.target.id) !== undefined,
                    health: commit.target.instance.attributes.get('health')?.current,
                    taken: commit.taken
                });

            runtime.damage(swing(cow.id, 2));
            const heardAfterHit = heard.length;
            runtime.damage(swing(cow.id, 100));
            const removedInCall = runtime.byId(cow.id) === undefined;
            world.onCommit = undefined;
            world.players = [];

            const hurt = heardAfterHit === 1 && heard[0]?.inStore === true && heard[0].health === startingHealth - 2;
            const killed =
                heard.length === 2 &&
                heard[1]?.died === true &&
                heard[1].inStore &&
                heard[1].health === 0 &&
                removedInCall;
            reportParityCases(FAMILIES.gameplayCombatAdvancements, import.meta.filename, [
                {
                    id: 'minecraft:player_hurt_entity/timing',
                    title: 'minecraft:player_hurt_entity',
                    context: 'Heard inside the blow, after the health is taken',
                    status: hurt ? 'passed' : 'failed'
                },
                {
                    id: 'minecraft:player_killed_entity/timing',
                    title: 'minecraft:player_killed_entity',
                    context: 'Heard inside the killing blow, before the store removes the victim',
                    status: killed ? 'passed' : 'failed'
                }
            ]);

            expect(world.commits.length - commitsBefore).toBe(2);
            expect(heard).toEqual([
                { died: false, inStore: true, health: startingHealth - 2, taken: 2 },
                // Inside the hurt cooldown the first swing started, so it lands for the difference.
                { died: true, inStore: true, health: 0, taken: 100 - 2 }
            ]);
            expect(removedInCall).toBe(true);
        });
    },
    { tags: ['real-data'] }
);
