/**
 * The `server` group of the server's `CommandHost`: chat, titles, operators
 * and the lifecycle verbs.
 *
 * Three of these send a packet this server had written and never used -
 * `SetTitlePacket`, `TransferPacket` and `StopSoundPacket` - which is why
 * `/title`, `/transfer` and `/stopsound` were unreachable before the command
 * layer landed rather than unimplementable.
 */
import type { EntityRef, ServerCommandHost } from '@jsprismarine/commands';
import { TitleType } from '@jsprismarine/minecraft';

import type Server from '../../Server';
import SetTitlePacket from '../../network/packet/SetTitlePacket';
import TransferPacket from '../../network/packet/TransferPacket';
import TextPacketType from '../../network/type/TextPacketType';
import { carryOut, entityRefOf, playersOf, resolvePlayer, unsupported } from './support';

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

/** The title slot each of `/title`'s five forms writes. */
const TITLE_TYPES: Readonly<Record<'title' | 'subtitle' | 'actionbar' | 'clear' | 'reset', TitleType>> = {
    title: TitleType.TITLE,
    subtitle: TitleType.SUBTITLE,
    actionbar: TitleType.ACTIONBAR,
    clear: TitleType.CLEAR,
    reset: TitleType.RESET
};

/**
 * Builds the `server` group.
 *
 * @param server - The live server every verb reads and writes through.
 */
export const serverSideCommandHost = (server: Server): ServerCommandHost => {
    const operator = (ref: EntityRef, op: boolean): boolean => {
        const player = resolvePlayer(server, ref);
        if (player === undefined) return false;
        if (server.getPermissionManager().isOp(player.getName()) === op) return false;

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

        recipes: () => unsupported('per-player recipe unlocking'),

        sendMessage: (targets, kind, text) => {
            for (const player of playersOf(server, targets)) {
                carryOut(player.sendMessage(text, MESSAGE_TYPES[kind]), undefined);
            }
        },

        sendTitle: (targets, kind, text) => {
            for (const player of playersOf(server, targets)) {
                const packet = new SetTitlePacket();
                packet.titleType = TITLE_TYPES[kind];
                packet.titleText = text;
                carryOut(player.getNetworkSession().send(packet), undefined);
            }
        },

        usage: (command) => server.getCommandManager().usageLines(command)
    };
};
