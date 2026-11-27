/**
 * The `server` group of the server's `CommandHost`: chat, titles, operators
 * and the lifecycle verbs.
 *
 * Titles go through each player's session presenter, so a client of either
 * edition is shown them.
 */
import type { EntityRef, ServerCommandHost } from '@jsprismarine/commands';

import type Server from '../../Server';
import AnimateEntityPacket from '@jsprismarine/protocol/bedrock/packet/AnimateEntityPacket';
import CameraShakePacket, {
    CameraShakeAction,
    CameraShakeType
} from '@jsprismarine/protocol/bedrock/packet/CameraShakePacket';
import PlayerFogPacket from '@jsprismarine/protocol/bedrock/packet/PlayerFogPacket';
import TransferPacket from '@jsprismarine/protocol/bedrock/packet/TransferPacket';
import { messageOf } from '../../addons/addonPack';
import type { MessageKind } from '../../player/presenter/SessionPresenter';
import { UnlockedRecipes, changeRecipes } from './recipes';
import { carryOut, entityRefOf, playerSessionOf, resolveEntity, sessionsOf } from './support';
import { PrismarineCommandErrors } from '@jsprismarine/errors/prismarine/command';

/**
 * How the client shows each of the four message kinds a command sends.
 *
 * `raw` is the `rawtext` object `/tellraw` takes, which the client parses
 * itself. `emote` has no kind of its own, so `/me` goes out as plain text,
 * which is what the client shows for it anyway.
 */
const MESSAGE_KINDS: Readonly<Record<'chat' | 'whisper' | 'emote' | 'raw', MessageKind>> = {
    chat: 'chat',
    whisper: 'whisper',
    emote: 'raw',
    raw: 'rawText'
};

/** The shake type and action numbers the packet writes, by the name a command spells. */
const SHAKE_TYPES: Readonly<Record<'positional' | 'rotational', CameraShakeType>> = {
    positional: CameraShakeType.Positional,
    rotational: CameraShakeType.Rotational
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
export const serverSideCommandHost = (
    server: Server,
    onStopRequested: (shutdown: Promise<void>) => void
): ServerCommandHost => {
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

    /** Shows every client the tick rate and whether the game is frozen, as vanilla does on a change. */
    const showTicking = (): void => {
        const control = server.getTickControl();
        const ticking = { rate: control.getTickRate(), frozen: control.isFrozen() };
        for (const session of server.getSessionManager().getSessions()) {
            carryOut(session.presenter.showTicking(ticking), undefined);
        }
    };

    /** Shows every client the steps a frozen game runs, or 0 when a step ends. */
    const showTickStep = (ticks: number): void => {
        for (const session of server.getSessionManager().getSessions()) {
            carryOut(session.presenter.showTickStep(ticks), undefined);
        }
    };

    const operator = (ref: EntityRef, op: boolean): boolean => {
        const identity = playerSessionOf(server, ref)?.identity;
        if (identity === undefined) return false;
        if (server.getPermissionManager().isOp(identity.subject) === op) return false;

        return carryOut(server.getPermissionManager().setOp(identity.name, op), true);
    };

    return {
        allowList: {
            add: (name) => server.getAllowList().add({ name, ignoresPlayerLimit: false }),
            remove: (name) => server.getAllowList().remove({ name }),
            entries: () => server.getAllowList().getEntries(),
            // Bedrock Dedicated Server refuses to turn the list on without online authentication:
            // a name is all an offline login claims, so anybody could join under a listed one.
            setEnabled: (enabled) => {
                if (enabled && !server.getConfig().getOnlineMode()) return false;
                server.getAllowList().setEnabled(enabled);
                return true;
            },
            reload: () => server.getAllowList().reload()
        },
        addOperator: (player) => operator(player, true),
        removeOperator: (player) => operator(player, false),

        kick: (ref, reason) => {
            const session = playerSessionOf(server, ref);
            if (session === undefined) return false;

            return carryOut(session.kick(reason), true);
        },

        listPlayers: () =>
            server
                .getSessionManager()
                .getSessions()
                .map((session) => entityRefOf(session)),

        // Kept alive on purpose: the process exiting from inside a command
        // would take the dispatch's own feedback with it.
        stop: () => {
            // A failed shutdown fails the command, so the sender is told and the process entry
            // exits with a code that says so.
            const shutdown = server.shutdown({ stayAlive: true }).then((stopped) => {
                if (!stopped) throw new PrismarineCommandErrors.UncleanShutdown();
            });
            onStopRequested(shutdown);
            return carryOut(shutdown, undefined);
        },
        // Bedrock's `/reload`: the behavior pack functions compile again from their files, the
        // scripts start over, and the server keeps running. The permission files are read again with them.
        // The addons sync first, so a pack dropped into or taken out of `addons/` counts, and the
        // sync reloads the scripts. One that fails to read its files still leaves the scripts reloaded.
        reload: () => {
            server.getCommandManager().reloadFunctions();
            const scripts = server
                .getAddons()
                .sync({ reload: 'always' })
                .then(
                    () => undefined,
                    (error: unknown) => {
                        server.getLogger().error(`Could not sync the addons: ${messageOf(error)}`);
                        return server.reloadScripts();
                    }
                );
            return carryOut(Promise.all([scripts, server.getPermissionManager().reload()]), undefined);
        },

        ticking: {
            rate: () => server.getTickControl().getTickRate(),
            setRate: (rate) => {
                server.getTickControl().setTickRate(rate);
                showTicking();
            },
            tickMs: () => server.getTickMs(),
            measuredRate: () => server.getTPS(),
            frozen: () => server.getTickControl().isFrozen(),
            setFrozen: (frozen) => {
                server.getTickControl().setFrozen(frozen);
                showTicking();
            },
            step: (ticks) => {
                const stepping = server.getTickControl().step(ticks);
                if (stepping) showTickStep(ticks);
                return stepping;
            },
            stopStep: () => {
                const stopped = server.getTickControl().stopStep();
                if (stopped) showTickStep(0);
                return stopped;
            },
            sprint: (ticks) => server.getTickControl().sprint(ticks),
            stopSprint: () => server.getTickControl().stopSprint()
        },

        transfer: (ref, host, port) => {
            const session = playerSessionOf(server, ref);
            if (session === undefined) return false;

            const packet = new TransferPacket({
                address: host,
                port,
                reloadWorld: false,
                gatheringsConfig: null,
                transferSettings: null
            });
            return carryOut(session.send(packet), true);
        },

        recipes: (players, recipe, give) =>
            changeRecipes(server, unlocked, server.getContent().recipes, players, recipe, give),

        sendMessage: (targets, kind, text) => {
            // The protocol only sends these messages to connected clients. Mirror public
            // server messages into the logger so the headless console and saved logs can see
            // what the game sent; whispers remain private to their recipients.
            if (kind !== 'whisper') server.getLogger().info(text);
            for (const session of sessionsOf(server, targets)) {
                carryOut(session.sendMessage({ message: text, kind: MESSAGE_KINDS[kind] }), undefined);
            }
        },

        sendTitle: (targets, title) => {
            for (const session of sessionsOf(server, targets)) {
                carryOut(session.presenter.showTitle(title), undefined);
            }
        },

        shakeCamera: (targets, shake) => {
            const sessions = sessionsOf(server, targets);
            for (const session of sessions) {
                const packet = new CameraShakePacket();
                packet.intensity = shake.intensity;
                packet.seconds = shake.seconds;
                packet.shakeType = SHAKE_TYPES[shake.shakeType];
                packet.shakeAction = shake.action === 'stop' ? CameraShakeAction.Stop : CameraShakeAction.Add;
                carryOut(session.send(packet), undefined);
            }
            return sessions.length;
        },

        setFog: (targets, change) => {
            let changed = 0;
            for (const session of sessionsOf(server, targets)) {
                const stack = fogStacks.get(session.runtimeId) ?? [];
                const next =
                    change.mode === 'push'
                        ? [...stack, { fogId: change.fogId, userId: change.userId }]
                        : change.mode === 'remove'
                          ? stack.filter((layer) => layer.userId !== change.userId)
                          : // `pop` takes the topmost layer with that id; `remove`
                            // takes every one of them. Java has neither.
                            dropLast(stack, change.userId);
                if (next.length === stack.length && change.mode !== 'push') continue;

                fogStacks.set(session.runtimeId, next);
                const packet = new PlayerFogPacket({ fogStack: next.map((layer) => layer.fogId) });
                carryOut(session.send(packet), undefined);
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

            const packet = new AnimateEntityPacket({
                animation: request.animation,
                nextState: request.nextState ?? '',
                stopExpression: request.stopExpression ?? '',
                stopExpressionVersion: 0,
                controller: request.controller ?? '',
                blendOutTime: request.blendOutTime ?? 0,
                runtimeIds: entities.map((entity) => entity.getRuntimeId())
            });

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
