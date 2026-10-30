/**
 * The `server` group of the server's `CommandHost`: chat, titles, operators
 * and the lifecycle verbs.
 *
 * Three of these send a packet this server had written and never used -
 * `SetTitlePacket`, `TransferPacket` and `StopSoundPacket` - which is why
 * `/title`, `/transfer` and `/stopsound` were unreachable before the command
 * layer landed rather than unimplementable.
 */
import type { EntityRef, ServerCommandHost, TitleInstruction } from '@jsprismarine/commands';
import { TitleType } from '@jsprismarine/minecraft';

import type Server from '../../Server';
import AnimateEntityPacket from '../../network/packet/AnimateEntityPacket';
import CameraShakePacket, { CameraShakeAction, CameraShakeType } from '../../network/packet/CameraShakePacket';
import PlayerFogPacket from '@jsprismarine/protocol/packet/PlayerFogPacket';
import SetTitlePacket from '../../network/packet/SetTitlePacket';
import TransferPacket from '../../network/packet/TransferPacket';
import TextPacketType from '../../network/type/TextPacketType';
import { UnlockedRecipes, changeRecipes } from './recipes';
import { carryOut, entityRefOf, playersOf, resolveEntity, resolvePlayer } from './support';

/**
 * How the client renders each of the four message kinds a command sends.
 *
 * `raw` is the `rawtext` object `/tellraw` takes, which the client parses
 * itself - `TextObject` is the type that tells it to. `emote` has no type of
 * its own on Bedrock, so `/me` goes out as plain text, which is what the
 * client shows for it anyway.
 */
const MESSAGE_TYPES: Readonly<Record<'chat' | 'whisper' | 'emote' | 'raw', TextPacketType>> = {
    chat: TextPacketType.Chat,
    whisper: TextPacketType.Whisper,
    emote: TextPacketType.Raw,
    raw: TextPacketType.TextObject
};

/**
 * The title slot each form writes.
 *
 * Two of them per slot: `/titleraw` sends a `rawtext` object, and the client
 * only parses one in the `*_TEXT_OBJECT` types, so the raw flag picks the
 * second column rather than being written into the text.
 */
const TITLE_TYPES: Readonly<Record<'title' | 'subtitle' | 'actionbar', readonly [plain: TitleType, raw: TitleType]>> = {
    title: [TitleType.TITLE, TitleType.TITLE_TEXT_OBJECT],
    subtitle: [TitleType.SUBTITLE, TitleType.SUBTITLE_TEXT_OBJECT],
    actionbar: [TitleType.ACTIONBAR, TitleType.ACTIONBAR_TEXT_OBJECT]
};

/** The shake type and action numbers the packet writes, by the name a command spells. */
const SHAKE_TYPES: Readonly<Record<'positional' | 'rotational', CameraShakeType>> = {
    positional: CameraShakeType.Positional,
    rotational: CameraShakeType.Rotational
};

/**
 * One title instruction as the packet carries it.
 *
 * `clear`, `reset` and `times` write no text, which is why the instruction is
 * a union rather than a kind plus a string: a `times` form sent as text is a
 * title reading "20".
 */
const titlePacketOf = (title: TitleInstruction): SetTitlePacket => {
    const packet = new SetTitlePacket();
    switch (title.kind) {
        case 'clear':
            packet.titleType = TitleType.CLEAR;
            return packet;

        case 'reset':
            packet.titleType = TitleType.RESET;
            return packet;

        case 'times':
            packet.titleType = TitleType.TIMES;
            packet.fadeInTime = title.fadeIn;
            packet.stayTime = title.stay;
            packet.fadeOutTime = title.fadeOut;
            return packet;

        default:
            packet.titleType = TITLE_TYPES[title.kind][title.raw === true ? 1 : 0];
            packet.titleText = title.text;
            return packet;
    }
};

/** One layer of a player's fog stack: what to render, and what `/fog pop` calls it. */
interface FogLayer {
    readonly fogId: string;
    readonly userId: string;
}

/** Drops the topmost layer with one user id, which is what `/fog pop` does. */
const dropLast = (stack: readonly FogLayer[], userId: string): FogLayer[] => {
    const index = stack.findLastIndex((layer) => layer.userId === userId);
    return index < 0 ? [...stack] : [...stack.slice(0, index), ...stack.slice(index + 1)];
};

/**
 * Builds the `server` group.
 *
 * @param server - The live server every verb reads and writes through.
 */
export const serverSideCommandHost = (server: Server): ServerCommandHost => {
    /**
     * Each player's fog stack, keyed by runtime id.
     *
     * `PlayerFogPacket` carries the whole stack every time, so the server is
     * the thing that remembers it; a client has no way to be asked what it is
     * rendering. A player who leaves takes their runtime id with them and the
     * entry is dead weight, which is why the key is the id rather than the
     * player.
     */
    const fogStacks = new Map<bigint, readonly FogLayer[]>();

    /** Which recipes each player has unlocked; see {@link UnlockedRecipes}. */
    const unlocked = new UnlockedRecipes();

    const operator = (ref: EntityRef, op: boolean): boolean => {
        const player = resolvePlayer(server, ref);
        if (player === undefined) return false;
        if (server.getPermissionManager().isOp(player.getUUID().toString()) === op) return false;

        return carryOut(server.getPermissionManager().setOp(player.getName(), op), true);
    };

    return {
        addOperator: (player) => operator(player, true),
        removeOperator: (player) => operator(player, false),

        kick: (ref, reason) => {
            const player = resolvePlayer(server, ref);
            if (player === undefined) return false;

            return carryOut(player.kick(reason), true);
        },

        listPlayers: () => server.getSessionManager().getAllPlayers().map(entityRefOf),

        // Kept alive on purpose: the process exiting from inside a command
        // would take the dispatch's own feedback with it.
        stop: () => carryOut(server.shutdown({ stayAlive: true }), undefined),
        reload: () => carryOut(server.reload(), undefined),

        transfer: (ref, host, port) => {
            const player = resolvePlayer(server, ref);
            if (player === undefined) return false;

            const packet = new TransferPacket();
            packet.address = host;
            packet.port = port;
            return carryOut(player.getNetworkSession().send(packet), true);
        },

        recipes: (players, recipe, give) =>
            changeRecipes(server, unlocked, server.getContent().recipes, players, recipe, give),

        sendMessage: (targets, kind, text) => {
            // The protocol only sends these messages to connected clients. Mirror public
            // server messages into the logger so the headless console and saved logs can see
            // what the game sent; whispers remain private to their recipients.
            if (kind !== 'whisper') server.getLogger().info(text);
            for (const player of playersOf(server, targets)) {
                carryOut(player.sendMessage(text, MESSAGE_TYPES[kind]), undefined);
            }
        },

        sendTitle: (targets, title) => {
            for (const player of playersOf(server, targets)) {
                carryOut(player.getNetworkSession().send(titlePacketOf(title)), undefined);
            }
        },

        shakeCamera: (targets, shake) => {
            const players = playersOf(server, targets);
            for (const player of players) {
                const packet = new CameraShakePacket();
                packet.intensity = shake.intensity;
                packet.seconds = shake.seconds;
                packet.shakeType = SHAKE_TYPES[shake.shakeType];
                packet.shakeAction = shake.action === 'stop' ? CameraShakeAction.Stop : CameraShakeAction.Add;
                carryOut(player.getNetworkSession().send(packet), undefined);
            }
            return players.length;
        },

        setFog: (targets, change) => {
            let changed = 0;
            for (const player of playersOf(server, targets)) {
                const stack = fogStacks.get(player.getRuntimeId()) ?? [];
                const next =
                    change.mode === 'push'
                        ? [...stack, { fogId: change.fogId, userId: change.userId }]
                        : change.mode === 'remove'
                          ? stack.filter((layer) => layer.userId !== change.userId)
                          : // `pop` takes the topmost layer with that id; `remove`
                            // takes every one of them. Java has neither.
                            dropLast(stack, change.userId);
                if (next.length === stack.length && change.mode !== 'push') continue;

                fogStacks.set(player.getRuntimeId(), next);
                const packet = new PlayerFogPacket({ fogStack: next.map((layer) => layer.fogId) });
                carryOut(player.getNetworkSession().send(packet), undefined);
                changed += 1;
            }
            return changed;
        },

        playAnimation: (targets, request) => {
            const entities = targets.flatMap((ref) => {
                const entity = resolveEntity(server, ref);
                return entity === undefined ? [] : [entity];
            });
            if (entities.length === 0) return 0;

            const packet = new AnimateEntityPacket();
            packet.animation = request.animation;
            packet.nextState = request.nextState ?? '';
            packet.stopExpression = request.stopExpression ?? '';
            packet.controller = request.controller ?? '';
            packet.blendOutTime = request.blendOutTime ?? 0;
            packet.runtimeIds = entities.map((entity) => entity.getRuntimeId());

            // One packet naming every actor, which is what the field is for.
            // Sent to everyone who can see them, because an animation is drawn
            // by the watching client rather than by the one that owns the mob.
            const world = entities[0]!.getWorld();
            carryOut(Promise.resolve(server.getWorldReplicators().for(world).send(packet)), undefined);
            return entities.length;
        },

        usage: (command) => server.getCommandManager().usageLines(command)
    };
};
