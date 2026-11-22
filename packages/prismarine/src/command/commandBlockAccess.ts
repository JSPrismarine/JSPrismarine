/**
 * Who may open and edit a command block or a command block minecart: Java's
 * `Player.canUseGameMasterBlocks`, an operator in creative mode. Bedrock Dedicated Server asks the
 * same of a player before it shows the command block screen.
 */
import { Gametype } from '@jsprismarine/minecraft';

/** What the check reads of a player: their operator status and their game mode. */
export interface CommandBlockEditor {
    isOp(): boolean;
    readonly gamemode: number;
}

/** Whether a player may open and edit command blocks. */
export const mayEditCommandBlocks = (player: CommandBlockEditor): boolean =>
    player.isOp() && player.gamemode === Gametype.CREATIVE;
