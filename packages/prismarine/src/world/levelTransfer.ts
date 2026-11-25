/**
 * Moving a player from one level to another
 * ([ADR 0029](../../../../docs/adr/0029-worlds-are-levels-the-server-manages.md)).
 *
 * Each level keeps the player's record for itself, so a player who changes levels leaves one
 * record behind and picks up another: their inventory, health, experience and game mode, and the
 * place they were in that level. A level they have never been in starts them fresh, at its spawn.
 * The client is told the new level's game rules, clock, weather, custom dimensions and
 * scoreboard, which belong to the level rather than to the player.
 */
import { LevelEvent } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import LevelEventPacket from '@jsprismarine/protocol/bedrock/packet/LevelEventPacket';
import { OVERWORLD_STEM_ID } from '@jsprismarine/worldgen';

import { scoreboardPackets } from '../command/host/scoreboard';
import type { WorldPlayerData } from '../config/JsonConfigTypes';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { customDimensionData } from '../network/customDimensionData';
import type PlayerSession from '../player/PlayerSession';
import { keyOfPlayer } from '../playerIdentity';
import type Server from '../Server';
import { toNetworkGameRule } from './GameRuleManager';
import type { Level } from './Level';
import { lastPlayerRecord } from './PlayerRecords';
import { sharedParts, withSharedParts } from './playerDataGroups';
import { applyPlayerRecord, playerRecordOf, recordedPosition } from './playerRecord';
import type { MoveTarget } from './portal/DimensionTravel';
import { spawnTarget } from './portal/DimensionTravel';

/** The level event data that starts rain or a storm at full strength. */
const FULL_INTENSITY = 65535;

/**
 * The record a player starts a level with when they have never been in it: an empty inventory,
 * full health and hunger, no experience, no spawn point and the server's game mode.
 */
export const freshPlayerRecord = (gamemode: string): Partial<WorldPlayerData> => ({
    gamemode,
    inventory: { items: [], handSlot: 0, armor: [], offhand: [], enderChest: [] },
    health: 20,
    food: 20,
    saturation: 5,
    experience: { level: 0, progress: 0 },
    flying: false
});

/**
 * Tells a player's client the state that belongs to their new level: every game rule, the time
 * of day, the weather, the custom dimensions and the scoreboard's display slots.
 */
const sendLevelState = (session: PlayerSession, level: Level): void => {
    const rules = [...level.getGameRuleManager().getGameRules()].map(([name, [value, editable]]) =>
        toNetworkGameRule(name, value, editable)
    );
    const weather = level.getWeather().current();
    // The stops first: the client keeps a lightning level of its own, as `WorldWeather` says.
    const events: Array<readonly [LevelEvent, number]> = [
        [LevelEvent.STOP_THUNDERSTORM, 0],
        [LevelEvent.STOP_RAINING, 0]
    ];
    if (weather !== 'clear') events.push([LevelEvent.START_RAINING, FULL_INTENSITY]);
    if (weather === 'thunder') events.push([LevelEvent.START_THUNDERSTORM, FULL_INTENSITY]);
    const dimensions = customDimensionData(level);
    session.released(
        Promise.all([
            session.sendGameRules(rules),
            session.sendTime(level.getDayTime()),
            ...events.map(([eventId, data]) => session.send(new LevelEventPacket({ eventId, position: null, data }))),
            ...(dimensions === undefined ? [] : [session.send(dimensions)]),
            ...scoreboardPackets(level.getScoreboard()).map((packet) => session.send(packet))
        ]).then(() => {})
    );
};

/**
 * Moves a player to another level: to the place they last were there, or to its spawn when they
 * have never been in it or `toSpawn` asks for it. Between two levels of a `player-data-groups`
 * group, the parts the group shares come along from the player as they are, the position too
 * when it is shared. Their record in the level they leave is saved
 * as they leave, and their record in the level they arrive in, or a fresh one, is put on them as
 * they arrive. A move within the player's own level goes to its spawn.
 *
 * @param server - The server.
 * @param session - The player.
 * @param level - The level to move them to.
 * @param options - `toSpawn` sends them to the level's spawn even when they were there before.
 * @returns Whether the move landed.
 */
export const transferToLevel = async (
    server: Server,
    session: PlayerSession,
    level: Level,
    options: { readonly toSpawn?: boolean } = {}
): Promise<boolean> => {
    const overworld = level.loadedWorld(OVERWORLD_STEM_ID);
    if (overworld === undefined) return false;
    const player = session.getPlayer();
    const facing = { yaw: player.yaw, pitch: player.pitch };
    const travel = server.getDimensionTravel();
    if (session.getWorld().getLevel() === level) return travel.moveTo(session, spawnTarget(overworld, facing));

    const defaultGamemode = server.getConfig().getGamemode();
    const record = await lastPlayerRecord(player, overworld, level);
    // A record with no position is the one a level answers for a player it has never seen.
    const fresh = record.data.position === undefined;
    // The parts a group of levels shares come along from the player as they are now.
    const from = session.getWorld();
    const carried = playerRecordOf(player, { key: keyOfPlayer(player), server }, from.getDimension());
    const parts = sharedParts(server.getConfig().getPlayerDataGroups(), from.getLevel().name, level.name);
    const data = withSharedParts(carried, fresh ? freshPlayerRecord(defaultGamemode) : record.data, parts);
    const recorded = options.toSpawn === true ? undefined : recordedPosition(data);
    // The world the arrival's dimension names, the record's or the shared one, or the Overworld.
    const arrival =
        data.dimension !== undefined && level.getStems().has(data.dimension)
            ? await level.world(data.dimension)
            : overworld;
    const target: MoveTarget =
        recorded === undefined
            ? spawnTarget(overworld, facing)
            : {
                  ready: () => ({
                      world: arrival,
                      position: new Vector3(recorded.x, recorded.y - EYE_HEIGHT, recorded.z),
                      yaw: recorded.yaw,
                      pitch: recorded.pitch
                  }),
                  prepare: async () => {}
              };

    const landed = await travel.moveTo(session, target, () => {
        // After the change, so the record of the level left was written from the player as they
        // were there, and the viewers of that level never see the new one's inventory.
        applyPlayerRecord(player, data, defaultGamemode, server.getContent());
        session.released(
            Promise.all([
                session.sendInventory(),
                session.sendAttributes(),
                session.sendGamemode(),
                session.sendAbilities()
            ]).then(() => {})
        );
        sendLevelState(session, level);
    });
    if (landed) {
        const entry = server.getWorldManager().getEntryLevel();
        await server
            .getWorldManager()
            .getPlayerLevels()
            .set(keyOfPlayer(player), level === entry ? undefined : level.id);
    }
    return landed;
};
