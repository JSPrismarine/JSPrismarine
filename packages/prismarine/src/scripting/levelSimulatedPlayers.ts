/**
 * The GameTest simulated players of one level: real players, each with a `PlayerSession`, a store
 * player and an entity in the world, whose connection reaches no client. The session manager lists
 * them, so commands, chat, other clients and scripts see each as any other player.
 *
 * A simulated player does what a client's input would make a player do, through the same verbs:
 * its chat goes through the chat manager's guards, a walk or a jump moves it through
 * `PlayerSession.setPlayerPosition` as a client's movement does, and a swing goes through
 * `meleeAttack` as an attack packet does, an item use goes past the item use guards as a click on
 * nothing does, and a break goes through `World.breakBlock` as a client's does. Scripts drive it from the script flush, and a replay
 * runs the same scripts, so it needs no input of its own in the replay trace
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)).
 */
import { createHash } from 'node:crypto';

import { Vector3 } from '@jsprismarine/math';
import { PositionMode } from '@jsprismarine/protocol';
import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';
import { InetAddress } from '@jsprismarine/raknet';
import type {
    ScriptGameMode,
    ScriptSimulatedPlayers,
    SimulatedPlayerAction
} from '@jsprismarine/script-host/host/world';

import { Chat, ChatType } from '../chat/Chat';
import { usePastGuards } from '../item/interaction';
import { itemFromContent } from '../item/itemFromContent';
import { meleeAttack } from '../entity/Combat';
import { entityIds } from '../entity/entityIds';
import { EYE_HEIGHT } from '../entity/playerEyes';
import { StorePlayer } from '../entity/storePlayer';
import type { Subject } from '../identity/Subject';
import ClientConnection from '../network/ClientConnection';
import { latestCodec } from '../network/codec/CodecRegistry';
import { createConnectedPlayer } from '../network/createConnectedPlayer';
import type PlayerSession from '../network/PlayerSession';
import { TransportNames } from '../network/transport/Transport';
import type { TransportConnection } from '../network/transport/Transport';
import type Server from '../Server';
import type { Level } from '../world/Level';

/** Blocks a player walks in a tick at full speed: 4.317 blocks a second. */
const WALK_PER_TICK = 4.317 / 20;

/** A jump's upward speed, and the gravity and drag each tick takes from it, in blocks a tick. */
const JUMP_VELOCITY = 0.42;
const GRAVITY = 0.08;
const DRAG = 0.98;

/** How far a survival player's swing reaches, in blocks. */
const REACH = 3;

/** What one simulated player is doing: its walk, and its jump while it is in the air. */
interface Motion {
    walk?: { readonly x: number; readonly z: number; readonly speed: number; readonly relative: boolean };
    jump?: { velocity: number; readonly ground: number };
    /** The block it is breaking, which it tries each tick until the block is gone. */
    breaking?: { readonly x: number; readonly y: number; readonly z: number };
}

/** One simulated player of the level. */
interface Simulated {
    readonly session: PlayerSession;
    readonly connection: ClientConnection;
    readonly connectionId: number;
    readonly motion: Motion;
}

/**
 * A transport connection that goes nowhere: what the server sends a simulated player is encoded
 * and dropped, as no client reads it.
 */
const nowhere = (id: number): TransportConnection => ({
    id,
    address: new InetAddress('0.0.0.0', 0),
    capabilities: { encrypted: false, reliableOrdered: true, maxFrameSize: Number.MAX_SAFE_INTEGER },
    // No transport carries it; it reports as the default one, which is reliable and ordered like it.
    transport: TransportNames.raknet,
    sendFrame: () => {},
    close: () => {}
});

/** A UUID a simulated player's name and number decide, so a replay gives it the same one. */
const uuidOf = (name: string, number: number): UUID => {
    const hex = createHash('sha256').update(`simulated:${number}:${name}`).digest('hex');
    return UUID.fromString(
        `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
    );
};

/** The yaw and pitch that look from `from` to `to`, in Bedrock's degrees. */
const lookAt = (from: Vector3, to: { readonly x: number; readonly y: number; readonly z: number }) => {
    const dx = to.x - from.getX();
    const dy = to.y - from.getY();
    const dz = to.z - from.getZ();
    const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
    const pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    return { yaw, pitch };
};

/**
 * Builds the simulated players of one level's scripts.
 * @param server - The server whose sessions, chat and content the players use.
 * @param level - The level the players join.
 */
export const levelSimulatedPlayers = (server: Server, level: Level): ScriptSimulatedPlayers => {
    const players = new Map<string, Simulated>();
    /**
     * Connection ids below zero, so a simulated player never takes a number the transports hand
     * out and a recorded trace keys its connections the same way in a replay.
     */
    let nextConnection = -1;
    let spawned = 0;

    const worldOf = (dimension: string) =>
        [...level.worlds()].find((world) => world.getDimension().bedrockName === dimension);

    /** Moves a player's eyes and look as a client's movement input does. */
    const move = (session: PlayerSession, eyes: Vector3, look: { yaw: number; pitch: number }): void => {
        session.released(
            session.setPlayerPosition({
                position: eyes,
                type: PositionMode.Normal,
                yaw: look.yaw,
                pitch: look.pitch,
                headYaw: look.yaw
            })
        );
    };

    const remove = (id: string): void => {
        const simulated = players.get(id);
        if (simulated === undefined) return;
        players.delete(id);
        simulated.connection.closePlayerSession();
        server.getSessionManager().remove(simulated.connectionId);
    };

    const act = ({ session, motion }: Simulated, action: SimulatedPlayerAction): boolean => {
        const player = session.getPlayer();
        switch (action.kind) {
            case 'chat':
                void server
                    .getChatManager()
                    .send(new Chat({ sender: session, message: action.message, type: ChatType.CHAT }))
                    .catch((error: unknown) => server.getLogger().error(error));
                return true;
            case 'jump':
                if (motion.jump !== undefined) return false;
                motion.jump = { velocity: JUMP_VELOCITY, ground: player.getFeetY() };
                return true;
            case 'move':
                motion.walk = { x: action.x, z: action.z, speed: action.speed, relative: action.relative };
                return true;
            case 'stopMoving':
                motion.walk = undefined;
                return true;
            case 'lookAt':
                move(session, player.getPosition(), lookAt(player.getPosition(), action.location));
                return true;
            case 'attack':
            case 'attackEntity': {
                const attacker = session.getActor();
                if (attacker === undefined) return false;
                const world = session.getWorld();
                const eyes = player.getPosition();
                const candidates =
                    action.kind === 'attackEntity'
                        ? [world.getActor(BigInt(action.entity))].filter((each) => each !== null)
                        : world
                              .getActors()
                              .filter((each) => each !== attacker && each.getPosition().distanceTo(eyes) <= REACH + 1)
                              .sort((a, b) => a.getPosition().distanceTo(eyes) - b.getPosition().distanceTo(eyes));
                const [target] = candidates;
                if (target === undefined) return false;
                return meleeAttack(attacker, target, {
                    reach: REACH,
                    damage: player.getInventory().getItemInHand().getAttackDamage()
                });
            }
            case 'useItem': {
                // The stack the script names, not the one in hand, as BDS uses it; it acts as a
                // click on nothing, past the item use guards.
                const item = itemFromContent(action.item.typeId, server.getContent());
                if (item === null) return false;
                const user = {
                    getRuntimeId: () => session.getRuntimeId(),
                    getServer: () => server,
                    getWorld: () => session.getWorld()
                };
                return usePastGuards(user, item.withCount(action.item.amount));
            }
            case 'breakBlock':
                motion.breaking = action.location;
                return true;
        }
    };

    /**
     * A tick of a simulated player's break: the block breaks through the world's break, past its
     * guards, from the tick after the script asked, and a canceled break tries again the next
     * tick, as the `player-feedback` scenario recorded. The break takes no time in any game mode.
     */
    const breakStep = ({ session, motion }: Simulated): void => {
        const at = motion.breaking;
        if (at === undefined) return;
        const world = session.getWorld();
        const block = world.loadedBlockAt(at.x, at.y, at.z);
        if (
            block === undefined ||
            block.name === 'minecraft:air' ||
            world.breakBlock(new Vector3(at.x, at.y, at.z), session.getPlayer())
        ) {
            motion.breaking = undefined;
        }
    };

    /** Moves one player a tick on: a step of its walk, and its jump until it lands. */
    const step = ({ session, motion }: Simulated): void => {
        if (motion.walk === undefined && motion.jump === undefined) return;
        const player = session.getPlayer();
        const eyes = player.getPosition();
        let { x, z } = { x: eyes.getX(), z: eyes.getZ() };
        let feet = player.getFeetY();
        const { walk, jump } = motion;
        if (walk !== undefined) {
            const length = Math.hypot(walk.x, walk.z);
            if (length > 0) {
                const distance = WALK_PER_TICK * walk.speed;
                let dx = (walk.x / length) * distance;
                let dz = (walk.z / length) * distance;
                if (walk.relative) {
                    // Left and forward of where the player faces.
                    const yaw = (player.yaw * Math.PI) / 180;
                    const forward = { x: -Math.sin(yaw), z: Math.cos(yaw) };
                    const left = { x: forward.z, z: -forward.x };
                    [dx, dz] = [left.x * dx + forward.x * dz, left.z * dx + forward.z * dz];
                }
                x += dx;
                z += dz;
            }
        }
        if (jump !== undefined) {
            feet += jump.velocity;
            jump.velocity = (jump.velocity - GRAVITY) * DRAG;
            if (feet <= jump.ground) {
                feet = jump.ground;
                motion.jump = undefined;
            }
        }
        move(session, new Vector3(x, feet + EYE_HEIGHT, z), { yaw: player.yaw, pitch: player.pitch });
    };

    return {
        spawn: (name: string, dimension: string, location, gameMode: ScriptGameMode) => {
            const world = worldOf(dimension);
            if (world === undefined) return undefined;
            const connectionId = nextConnection--;
            const connection = new ClientConnection(nowhere(connectionId), server.getLogger());
            connection.codec = latestCodec;
            connection.phase = 'play';
            const subject: Subject = { kind: 'offline', name };
            const player = new StorePlayer(entityIds.next(), {
                uuid: uuidOf(name, spawned++),
                name,
                xuid: '',
                subject
            });
            server.getSessionManager().add(connectionId, connection);
            const session = createConnectedPlayer({
                server,
                connection,
                player,
                identity: { name, xuid: '', uuid: player.getUUID().toString(), subject },
                world
            });
            session.joinSimulated(location, gameMode.toLowerCase());
            world.addPlayer(session);
            session.released(session.addToPlayerList());
            session.released(session.completeSpawn());
            server.getLogger().info(`Player Spawned: ${name} xuid: , pfid: `);
            const id = String(session.runtimeId);
            players.set(id, { session, connection, connectionId, motion: {} });
            return id;
        },
        remove,
        act: (id, action) => {
            const simulated = players.get(id);
            return simulated === undefined ? false : act(simulated, action);
        },
        tick: () => {
            for (const simulated of players.values()) {
                breakStep(simulated);
                step(simulated);
            }
        }
    };
};
