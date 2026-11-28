/**
 * A Java client's `Player Action` as the intents a Bedrock client's actions decode into: the
 * `mineBlock` its block actions do, the `dropHeldItem` of the drop key and the `releaseItem` of
 * letting go of the use button ([ADR 0027](../../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 */
import { Gametype } from '@jsprismarine/minecraft';
import type { JavaPayload } from '@jsprismarine/protocol/java/packet/JavaPacket';
import type { PlayerAction } from '@jsprismarine/protocol/java/packet/play';
import { PlayerActionStatus } from '@jsprismarine/protocol/java/packet/play';

import type { Intent, MiningStep } from '../../input/Intent';

/** The `Player Action` fields, as the packet decodes. */
type PlayerActionFields = JavaPayload<typeof PlayerAction>;

/**
 * The mining step a status stands for. A creative player's start is the whole break, as a Java
 * client in creative sends nothing more; a survival client says it finished with `Stop`.
 * @param status - The packet's status.
 * @param gamemode - The player's game mode.
 * @returns The step, or undefined for a status that is not mining, or that the server does not
 *   act on, such as a change of the face mined.
 */
const stepOf = (status: number, gamemode: Gametype): MiningStep | undefined => {
    switch (status) {
        case PlayerActionStatus.StartDestroyBlock:
            return gamemode === Gametype.CREATIVE ? 'instant' : 'start';
        case PlayerActionStatus.AbortDestroyBlock:
            return 'abort';
        case PlayerActionStatus.StopDestroyBlock:
            return 'finish';
        default:
            return undefined;
    }
};

/**
 * Whether a status is one of the block statuses, which the client numbered for a `Block Changed
 * Ack` and waits on, whether the server acted on it or not.
 * @param status - The packet's status.
 */
export const isBlockStatus = (status: number): boolean => status <= PlayerActionStatus.StopDestroyBlock;

/**
 * The intent a `Player Action` decodes into. The server times every Java break, and a Java
 * client breaks a block that gives way at once on the start alone.
 * @param action - The packet.
 * @param gamemode - The player's game mode.
 * @returns The intent, or undefined for a status that is not mining.
 */
export const javaMiningIntentOf = (
    { status, position, face }: PlayerActionFields,
    gamemode: Gametype
): Intent<'mineBlock'> | undefined => {
    const step = stepOf(status, gamemode);
    if (step === undefined) return undefined;
    return { kind: 'mineBlock', step, position, face, serverTimed: true, breaksIfInstant: true };
};

/**
 * The intent a `Player Action`'s drop key decodes into: one item, or the whole stack with Ctrl.
 * @param status - The packet's status.
 * @returns The intent, or undefined for a status that is not a drop.
 */
export const javaDropIntentOf = (status: number): Intent<'dropHeldItem'> | undefined => {
    if (status === PlayerActionStatus.DropItem) return { kind: 'dropHeldItem', all: false };
    if (status === PlayerActionStatus.DropAllItems) return { kind: 'dropHeldItem', all: true };
    return undefined;
};

/**
 * The intent a `Player Action` that lets go of the use button decodes into, which looses a drawn
 * bow's arrow or cuts a meal short.
 * @param status - The packet's status.
 * @returns The intent, or undefined for any other status.
 */
export const javaReleaseIntentOf = (status: number): Intent<'releaseItem'> | undefined =>
    status === PlayerActionStatus.ReleaseUseItem ? { kind: 'releaseItem', action: 'release' } : undefined;
