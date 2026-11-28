import { describe, expect, it } from 'vitest';

import { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import type { StoreActor } from '../entity/data/storeActors';
import { PlayerComponents } from '../entity/playerComponents';
import type { SessionPlayer } from './sessionPlayers';
import type PlayerSession from './PlayerSession';
import { stub } from '../testing/stub.test.helper';
import type { Level } from '../world/Level';
import { Scoreboard } from '../world/Scoreboard';
import type { World } from '../world/World';
import { scoreDeath, tickPlayerScores } from './playerScores';

/** What the fake player reads as, which a test changes between ticks. */
interface Vitals {
    health: number;
    sneaking: boolean;
    sleeping: boolean;
    readonly components: PlayerComponents;
}

/** A player named `name` on a level whose scoreboard is `board`, with no other players to tell. */
const playerOn = (board: Scoreboard, name: string, vitals: Vitals) => {
    const level = stub<Level>({ getScoreboard: () => board });
    const players: PlayerSession[] = [];
    const world = stub<World>({
        getLevel: () => level,
        viewerOf: (runtimeId) => players.find((each) => each.runtimeId === runtimeId)
    });
    const session = stub<PlayerSession>({
        runtimeId: 1n,
        getWorld: () => world,
        getServer: () => stub({ getSessionManager: () => stub({ getSessions: () => [] }) }),
        getPlayer: () =>
            stub<SessionPlayer>({
                getName: () => name,
                getHealth: () => vitals.health,
                getFood: () => vitals.components.get('vitals.food'),
                isSneaking: () => vitals.sneaking,
                isSleeping: () => vitals.sleeping,
                getComponents: () => vitals.components,
                getExperience: () => vitals.components.experience()
            }),
        released: () => {}
    });
    players.push(session);
    const actor = stub<StoreActor>({
        getType: () => 'minecraft:player',
        getRuntimeId: () => session.runtimeId,
        getWorld: () => world
    });
    return { session, actor, world };
};

const fresh = (): Vitals => ({
    health: 20,
    sneaking: false,
    sleeping: false,
    components: new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {})
});

describe('tickPlayerScores', () => {
    it('adds a tick of play time to the player’s score, from wherever a command left it', () => {
        const board = new Scoreboard();
        board.add('play_time', 'minecraft.custom:minecraft.play_time');
        board.add('notes', 'dummy');
        const { session } = playerOn(board, 'Steve', fresh());

        tickPlayerScores(session);
        tickPlayerScores(session);
        expect(board.score('Steve', 'play_time')).toBe(2);

        board.setScore('Steve', 'play_time', 100);
        tickPlayerScores(session);
        expect(board.score('Steve', 'play_time')).toBe(101);
        expect(board.score('Steve', 'notes')).toBeUndefined();
    });

    it('counts sneaking only while sneaking, and takes the rest count away while asleep', () => {
        const board = new Scoreboard();
        board.add('sneak', 'minecraft.custom:minecraft.sneak_time');
        board.add('rest', 'minecraft.custom:minecraft.time_since_rest');
        const vitals = fresh();
        const { session } = playerOn(board, 'Steve', vitals);

        tickPlayerScores(session);
        vitals.sneaking = true;
        tickPlayerScores(session);
        expect(board.score('Steve', 'sneak')).toBe(1);
        expect(board.score('Steve', 'rest')).toBe(2);

        vitals.sleeping = true;
        tickPlayerScores(session);
        expect(board.score('Steve', 'rest')).toBeUndefined();
    });

    it('sets a vitals objective to the player’s reading, rounding health up', () => {
        const board = new Scoreboard();
        board.add('hp', 'health');
        board.add('hunger', 'food');
        board.add('lvl', 'level');
        const vitals = fresh();
        const { session } = playerOn(board, 'Steve', vitals);

        vitals.health = 13.5;
        vitals.components.set('vitals.food', 6);
        vitals.components.experience().setLevel(7);
        tickPlayerScores(session);

        expect(board.score('Steve', 'hp')).toBe(14);
        expect(board.score('Steve', 'hunger')).toBe(6);
        expect(board.score('Steve', 'lvl')).toBe(7);
    });
});

describe('scoreDeath', () => {
    it('counts the death for the victim, ends its time since death and credits the player who killed it', () => {
        const board = new Scoreboard();
        board.add('deaths', 'deathCount');
        board.add('since', 'minecraft.custom:minecraft.time_since_death');
        board.add('kills', 'totalKillCount');
        board.add('pvp', 'playerKillCount');
        board.add('zombies', 'minecraft.killed:minecraft.zombie');
        const victim = playerOn(board, 'Alex', fresh());
        const killer = playerOn(board, 'Steve', fresh());
        tickPlayerScores(victim.session);

        scoreDeath(victim.actor, killer.actor);
        scoreDeath(stub<StoreActor>({ getType: () => 'minecraft:zombie', getWorld: () => victim.world }), killer.actor);

        expect(board.score('Alex', 'deaths')).toBe(1);
        expect(board.score('Alex', 'since')).toBeUndefined();
        expect(board.score('Steve', 'kills')).toBe(2);
        expect(board.score('Steve', 'pvp')).toBe(1);
        expect(board.score('Steve', 'zombies')).toBe(1);
    });
});
