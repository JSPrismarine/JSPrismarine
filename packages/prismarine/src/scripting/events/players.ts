/**
 * The world events of a level's players that their sessions raise: a game mode change and its
 * guard, a change of dimension, an emote, a button and an input mode a client's input reports,
 * and, by comparing each player with the last script flush, a new hotbar slot, a changed stack
 * and a sneak started or stopped.
 */
import { getGametypeId } from '@jsprismarine/minecraft';
import { InputMode } from '@jsprismarine/protocol';
import type { ScriptEventValue, ScriptGameEvent } from '@jsprismarine/script-host/host/world';

import type { Item } from '../../item/Item';
import type PlayerSession from '../../player/PlayerSession';
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { gameModeName } from '../levelScriptAccess';
import { blockValue, dimensionValue, fieldsOf, itemValue, permutationValue, playerValue, vectorValue } from './values';
import type { WorldEventSource } from './worldEvents';

/** Each input mode as the Script API's `InputMode` names it. */
const INPUT_MODES: Readonly<Partial<Record<InputMode, string>>> = {
    [InputMode.Mouse]: 'KeyboardAndMouse',
    [InputMode.Touch]: 'Touch',
    [InputMode.GamePad]: 'Gamepad',
    [InputMode.MotionController_Deprecated]: 'MotionController'
};

/** The hotbar's slots, which `PlayerInventoryType` calls `Hotbar`; the rest of the 36 are `Inventory`. */
const HOTBAR_SIZE = 9;

/** The main slots of a player's inventory, the hotbar first. */
const INVENTORY_SIZE = 36;

/** What a stack is, for telling whether a slot changed: its type, count, name and wear. */
const stackKey = (item: Item | null): string =>
    item === null || item.getName() === 'minecraft:air' || item.getAmount() <= 0
        ? ''
        : `${item.getName()}\n${item.getAmount()}\n${item.getCustomName() ?? ''}\n${item.getDurability()}`;

/** What the last flush saw of a player. */
interface SeenPlayer {
    readonly slot: number;
    readonly sneaking: boolean;
    readonly keys: readonly string[];
    readonly items: readonly (Item | null)[];
    /** The stack on the cursor, null for none. */
    readonly cursor: Item | null;
}

/** The players of one level, as their scripts hear them. */
export const playerEvents = (server: Server, level: Level): WorldEventSource => {
    const { events } = server.getKernel();
    const here = (session: PlayerSession): boolean => session.getWorld().getLevel() === level;
    let listener: ((event: ScriptGameEvent) => void) | undefined;
    const seen = new Map<bigint, SeenPlayer>();

    /** Reads a player as the next flush compares it, or undefined once they have left. */
    const read = (session: PlayerSession): SeenPlayer | undefined => {
        try {
            const player = session.getPlayer();
            const inventory = player.getInventory();
            const items = inventory.container('inventory').items();
            const cursor = inventory.container('cursor').get(0);
            return {
                cursor,
                slot: inventory.getHandSlot(),
                sneaking: player.isSneaking(),
                keys: items.map(stackKey),
                items
            };
        } catch {
            return undefined;
        }
    };

    const compare = (session: PlayerSession, emit: (event: ScriptGameEvent) => void): void => {
        const now = read(session);
        const before = seen.get(session.runtimeId);
        if (now === undefined) return;
        seen.set(session.runtimeId, now);
        if (before === undefined) return;
        const player = playerValue(session.runtimeId);
        if (now.sneaking !== before.sneaking) {
            emit({
                event: now.sneaking ? 'EntityStartSneakingAfterEvent' : 'EntityStopSneakingAfterEvent',
                fields: { entity: player }
            });
        }
        for (let slot = 0; slot < INVENTORY_SIZE; slot++) {
            const was = before.items[slot];
            const is = now.items[slot];
            if (before.keys[slot] === now.keys[slot] || was === undefined || is === undefined) continue;
            const quantityOnly = was?.getName() === is?.getName() && before.keys[slot] !== '' && now.keys[slot] !== '';
            emit({
                event: 'PlayerInventoryItemChangeAfterEvent',
                fields: fieldsOf({
                    player,
                    slot,
                    inventoryType: slot < HOTBAR_SIZE ? 'Hotbar' : 'Inventory',
                    beforeItemStack: itemValue(was),
                    itemStack: itemValue(is),
                    quantityOnly
                })
            });
        }
        if (before.cursor !== null && (now.cursor === null || stackKey(now.cursor) !== stackKey(before.cursor))) {
            emit({
                event: 'PlayerCursorItemReleaseAfterEvent',
                fields: fieldsOf({ player, item: itemValue(before.cursor) })
            });
        }
        if (now.cursor !== null && (before.cursor === null || stackKey(now.cursor) !== stackKey(before.cursor))) {
            emit({
                event: 'PlayerCursorItemGrabAfterEvent',
                fields: fieldsOf({ player, item: itemValue(now.cursor) })
            });
        }
        if (now.slot !== before.slot) {
            emit({
                event: 'PlayerHotbarSelectedSlotChangeAfterEvent',
                fields: fieldsOf({
                    player,
                    previousSlotSelected: before.slot,
                    newSlotSelected: now.slot,
                    itemStack: itemValue(now.items[now.slot] ?? null)
                })
            });
        }
    };

    const gameMode = (mode: number): ScriptEventValue | undefined => gameModeName(mode);

    return {
        guard: (guard) =>
            events.on('playerSetGamemode', (event) => {
                const session = event.getSession();
                if (!here(session) || event.isCanceled()) return;
                const from = gameMode(event.getPreviousGamemode());
                const to = gameMode(event.getGamemode());
                if (from === undefined || to === undefined || from === to) return;
                const verdict = guard({
                    event: 'PlayerGameModeChangeBeforeEvent',
                    fields: { player: playerValue(session.runtimeId), fromGameMode: from, toGameMode: to }
                });
                if (verdict.veto) {
                    event.preventDefault();
                    return;
                }
                const wanted = verdict.fields.toGameMode;
                if (typeof wanted === 'string' && wanted !== to) event.setGamemode(getGametypeId(wanted.toLowerCase()));
            }),
        events: (heard) => {
            listener = heard;
            const stops = [
                events.on('playerGamemodeChanged', (event) => {
                    const session = event.getSession();
                    const from = gameMode(event.getFrom());
                    const to = gameMode(event.getTo());
                    if (!here(session) || from === undefined || to === undefined) return;
                    heard({
                        event: 'PlayerGameModeChangeAfterEvent',
                        fields: { player: playerValue(session.runtimeId), fromGameMode: from, toGameMode: to }
                    });
                }),
                events.on('playerDimensionChanged', (event) => {
                    if (event.getTo().getLevel() !== level) return;
                    const from = event.getFromFeet();
                    const to = event.getToFeet();
                    heard({
                        event: 'PlayerDimensionChangeAfterEvent',
                        fields: {
                            player: playerValue(event.getSession().runtimeId),
                            fromDimension: dimensionValue(event.getFrom()),
                            fromLocation: vectorValue(from.getX(), from.getY(), from.getZ()),
                            toDimension: dimensionValue(event.getTo()),
                            toLocation: vectorValue(to.getX(), to.getY(), to.getZ())
                        }
                    });
                }),
                events.on('playerEmote', (event) => {
                    const session = event.getSession();
                    if (!here(session)) return;
                    heard({
                        event: 'PlayerEmoteAfterEvent',
                        fields: { player: playerValue(session.runtimeId), personaPieceId: event.getEmote() }
                    });
                }),
                events.on('playerCraft', (event) => {
                    const session = event.getSession();
                    if (!here(session)) return;
                    const station = event.getStation();
                    const world = event.getWorld();
                    heard({
                        event: 'PlayerCraftRecipeAfterEvent',
                        fields: fieldsOf({
                            player: playerValue(session.runtimeId),
                            itemStack: itemValue(event.getItem()),
                            block: station === undefined ? undefined : blockValue(world, station),
                            permutation: station === undefined ? undefined : permutationValue(station)
                        })
                    });
                }),
                events.on('playerScriptMessage', (event) => {
                    const session = event.getSession();
                    if (!here(session)) return;
                    heard({
                        event: 'MessageReceiveAfterEvent',
                        fields: {
                            player: playerValue(session.runtimeId),
                            id: event.getMessageId(),
                            message: event.getMessage()
                        }
                    });
                }),
                events.on('playerButtonInput', (event) => {
                    const session = event.getSession();
                    if (!here(session)) return;
                    heard({
                        event: 'PlayerButtonInputAfterEvent',
                        fields: {
                            player: playerValue(session.runtimeId),
                            button: event.getButton(),
                            newButtonState: event.isPressed() ? 'Pressed' : 'Released'
                        }
                    });
                }),
                events.on('playerInputModeChange', (event) => {
                    const session = event.getSession();
                    const previous = INPUT_MODES[event.getPrevious()];
                    const next = INPUT_MODES[event.getNext()];
                    if (!here(session) || previous === undefined || next === undefined) return;
                    heard({
                        event: 'PlayerInputModeChangeAfterEvent',
                        fields: {
                            player: playerValue(session.runtimeId),
                            previousInputModeUsed: previous,
                            newInputModeUsed: next
                        }
                    });
                })
            ];
            return () => {
                listener = undefined;
                for (const stop of stops) stop();
            };
        },
        poll: () => {
            const emit = listener;
            const present = new Set<bigint>();
            for (const session of server.getSessionManager().getSessions()) {
                if (!here(session)) continue;
                present.add(session.runtimeId);
                compare(session, (event) => emit?.(event));
            }
            for (const id of seen.keys()) if (!present.has(id)) seen.delete(id);
        }
    };
};
