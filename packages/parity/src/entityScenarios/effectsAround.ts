import type { EntityPosition } from '@jsprismarine/entities';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { javaEntityClassName, javaMethodOf, pushedNumbers } from './javaEntityCode.ts';
import { SANDBOX_ORIGIN, inSandbox } from './sandbox.ts';
import type { EntitySubject } from './subjects.ts';
import { mappedEntity } from './subjects.ts';
import { switchGroups } from './reactions.ts';
import { realStack } from '../serverStack.ts';
import { RaidManager } from '@jsprismarine/prismarine/world/raid/RaidManager';
import { javaOperations } from '../javaClassFile.ts';

/**
 * The effects a mob gives the entities around it or riding it: a puffed pufferfish's poison and a
 * nautilus's breath. Each scenario runs the server's entity runtime and reads Java's side from the
 * pinned jar.
 */

/** The subjects for a list of Java entity types the server runs. */
const subjectsOf = (javaIds: readonly string[]): readonly EntitySubject[] =>
    javaIds.flatMap((javaId) => mappedEntity(javaId) ?? []);

/** The numbers a Java class's method pushes right after the last time it reads a field. */
const numbersAfterField = (javaId: string, method: string, field: string): readonly number[] => {
    const found = javaMethodOf(javaEntityClassName(javaId), method);
    if (found === undefined) return [];
    const operations = javaOperations(found.method);
    const at = operations.findLastIndex((operation) => operation.kind === 'field' && operation.target === field);
    return at < 0
        ? []
        : operations.slice(at + 1).flatMap((operation) => (operation.kind === 'number' ? [operation.value] : []));
};

/** Where a scenario stands a second entity, `distance` blocks east of the subject. */
const beside = (distance: number): EntityPosition => ({ ...SANDBOX_ORIGIN, x: SANDBOX_ORIGIN.x + distance });

/** `Pufferfish.STATE_FULL`, the puff state of a fully puffed pufferfish. */
const FULL_PUFF = 2;

/** The id the rider player is filed under. */
const RIDER = 930_001;

/** The scenarios of the effects a mob gives around it. */
export const effectsAroundScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'pufferfish-poisons',
        java: 'A fully puffed pufferfish poisons a mob it touches for 60 ticks per puff state, 120.',
        reference:
            'Java Pufferfish.touch (hurtServer 1 + puffState, then Poison 60 * puffState) and Pufferfish.STATE_FULL, read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:pufferfish']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:mob_effect'],
        run: (subject) => {
            const perState = numbersAfterField(subject.javaId, 'touch', 'MobEffects.POISON')[0];
            if (perState === undefined) return "Java's pufferfish no longer poisons what it touches";
            const java = perState * FULL_PUFF;
            const poisoned = inSandbox(subject.bedrock, 'minecraft:water', (sandbox) => {
                if (
                    switchGroups(
                        sandbox,
                        (group) => group === 'minecraft:full_puff',
                        (group) => group.includes('puff')
                    ).length === 0
                )
                    return 'the server pufferfish has no full puff';
                const cow = sandbox.stack.runtime.spawn('minecraft:cow', SANDBOX_ORIGIN);
                if (cow === undefined) return 'the sandbox could not put a cow beside it';
                for (let tick = 1; tick <= 20; tick += 1) {
                    sandbox.tick(1);
                    const poison = cow.body.statusEffects.get('minecraft:poison');
                    if (poison !== undefined) return poison.durationTicks;
                }
                return undefined;
            });
            if (typeof poisoned === 'string') return poisoned;
            if (poisoned === undefined)
                return `touching it fully puffed poisons a cow for nothing, where Java poisons it for ${java} ticks`;
            return Math.abs(poisoned - java) <= 2
                ? undefined
                : `touching it fully puffed poisons a cow for ${poisoned} ticks, where Java poisons it for ${java}`;
        }
    },
    {
        name: 'nautilus-breath',
        java: 'A tamed, saddled nautilus gives the player riding it Breath of the Nautilus for 60 ticks, in water and out of it.',
        reference:
            'Java AbstractNautilus.tick and applyEffects (Breath of the Nautilus 60 ticks to a player passenger without it, renewed every 40 game ticks), read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:nautilus', 'minecraft:zombie_nautilus']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:mob_effect', 'minecraft:environment_sensor'],
        run: (subject) => {
            const java = numbersAfterField(subject.javaId, 'applyEffects', 'MobEffects.BREATH_OF_THE_NAUTILUS').find(
                (value) => value > 1
            );
            if (java === undefined) return "Java's nautilus no longer gives its rider breath";
            const differences: string[] = [];
            for (const medium of ['minecraft:water', 'air'] as const) {
                const breath = inSandbox(subject.bedrock, medium, (sandbox) => {
                    const { runtime } = sandbox.stack;
                    switchGroups(
                        sandbox,
                        (group) => /_tame$|_tame_adult$|_saddled_on_ground$/.test(group),
                        (group) => group.includes('wild')
                    );
                    const player = runtime.spawnPlayer(RIDER, beside(1));
                    const mount = runtime.mobById(sandbox.entity.id);
                    if (player === undefined || mount === undefined) return 'the sandbox could not put a rider on it';
                    sandbox.stack.world.players = [
                        { id: player.id, identifier: player.identifier, position: player.position }
                    ];
                    runtime.mount(player.body, mount);
                    for (let tick = 1; tick <= 40; tick += 1) {
                        sandbox.tick(1);
                        const effect = player.body.statusEffects.get('minecraft:breath_of_the_nautilus');
                        if (effect !== undefined) return effect.durationTicks;
                    }
                    return undefined;
                });
                if (typeof breath === 'string') return breath;
                const where = medium === 'air' ? 'out of water' : 'in water';
                if (breath === undefined)
                    differences.push(`${where} its rider gets no breath, where Java gives ${java} ticks`);
                else if (Math.abs(breath - java) > 2)
                    differences.push(`${where} its rider gets breath for ${breath} ticks, where Java gives ${java}`);
            }
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    },
    {
        name: 'axolotl-rewards-its-player',
        java: 'A player who kills what an axolotl is fighting gets Regeneration for 100 ticks, or 100 more up to 2400, and loses Mining Fatigue.',
        reference:
            'Java Axolotl.onStopAttacking (a player killer within 20 blocks) and Axolotl.applySupportingEffects (Regeneration min(2400, 100 + remaining)), read from the pinned jar',
        subjects: () => subjectsOf(['minecraft:axolotl']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:combat_regeneration'],
        run: (subject) => {
            // `endsWithin(2399)`, then `Math.min(2400, 100 + remaining)`: the reward is the number after the cap.
            const found = javaMethodOf(javaEntityClassName(subject.javaId), 'applySupportingEffects');
            const numbers = found === undefined ? [] : pushedNumbers(found.method);
            const java = numbers[numbers.indexOf(2400) + 1];
            if (java === undefined) return "Java's axolotl no longer rewards the player who kills its target";
            const reward = inSandbox(subject.bedrock, 'minecraft:water', (sandbox) => {
                const { runtime } = sandbox.stack;
                const cod = runtime.spawn('minecraft:cod', beside(1));
                const player = runtime.spawnPlayer(RIDER, beside(3));
                if (cod === undefined || player === undefined)
                    return 'the sandbox could not put a cod and a player beside it';
                sandbox.stack.world.players = [
                    { id: player.id, identifier: player.identifier, position: player.position }
                ];
                sandbox.entity.body.target = cod.id;
                runtime.damage({
                    target: cod.id,
                    attacker: player.id,
                    cause: 'entity_attack',
                    amount: 100,
                    source: { route: 'mob_attack', feedback: false, remembered: true }
                });
                return player.body.statusEffects.get('minecraft:regeneration')?.durationTicks;
            });
            if (typeof reward === 'string') return reward;
            if (reward === undefined)
                return `a player who kills the cod it fights gets no Regeneration, where Java gives ${java} ticks`;
            return Math.abs(reward - java) <= 1
                ? undefined
                : `a player who kills the cod it fights gets Regeneration for ${reward} ticks, where Java gives ${java}`;
        }
    },
    {
        name: 'bad-omen-in-a-village',
        java: 'A survival player who brings Bad Omen into a village spends it for Raid Omen of the same level, for 600 ticks, and one outside a village keeps it.',
        reference:
            'Java BadOmenMobEffect.applyEffectTick (ServerLevel.isVillage, Raid Omen 600 ticks at the same amplifier, setRaidOmenPosition), read from the pinned jar; issue #3160',
        subjects: () => subjectsOf(['minecraft:player']),
        idOf: (subject) => subject.javaId,
        aspects: () => ['minecraft:environment_sensor', 'minecraft:spell_effects'],
        run: () => {
            const found = javaMethodOf('net/minecraft/world/effect/BadOmenMobEffect', 'applyEffectTick');
            const java = found === undefined ? undefined : pushedNumbers(found.method).find((value) => value > 1);
            if (java === undefined) return "Java's Bad Omen no longer turns into Raid Omen";
            const { runtime, world } = realStack();
            // A village of one bell, far from every other fixture, taken away again below.
            const village = { x: 70_000.5, y: 64, z: 70_000.5 };
            const bell = { x: 70_000, y: 64, z: 70_000 };
            world.setBlock(bell, 'minecraft:bell');
            const outcomes = [village, { ...village, x: village.x + 200 }].map((at) => {
                let level = 1;
                const granted: number[] = [];
                const manager = new RaidManager({
                    difficulty: () => 2,
                    random: () => 0.5,
                    players: () => [
                        {
                            id: RIDER,
                            position: at,
                            get badOmenLevel() {
                                return level;
                            },
                            clearBadOmen: () => {
                                level = 0;
                            },
                            grantRaidOmen: (_amplifier, ticks) => void granted.push(ticks),
                            grantHero: () => undefined
                        }
                    ],
                    villageCenterAt: (position) => runtime.villageCenterNear(position),
                    isVillage: (position) => runtime.villageCenterNear(position) !== undefined,
                    surfaceAt: () => undefined,
                    spawnRaider: () => undefined,
                    raiderAlive: () => false
                });
                manager.tick();
                return { kept: level, granted };
            });
            world.setBlock(bell, 'minecraft:air');
            const [inside, outside] = outcomes;
            const differences: string[] = [];
            if (inside === undefined || inside.kept !== 0 || inside.granted[0] !== java)
                differences.push(
                    `in a village it keeps Bad Omen ${inside?.kept ?? 1} and gets Raid Omen for ${inside?.granted[0] ?? 0} ticks, where Java spends it for ${java}`
                );
            if (outside === undefined || outside.kept !== 1 || outside.granted.length > 0)
                differences.push('outside a village it spends its Bad Omen, where Java keeps it');
            return differences.length === 0 ? undefined : differences.join('; ');
        }
    }
];
