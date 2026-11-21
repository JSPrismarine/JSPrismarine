/**
 * What a player's last `PlayerAuthInputPacket` said that the Script API reads: the movement
 * vector, the jump and sneak buttons, the input mode, and whether the player glides or emotes.
 * `InputInfo`, `Player.isJumping`, `isGliding` and `isEmoting` read it through the level's entity
 * systems.
 */
import { PlayerAuthInputData } from '@jsprismarine/protocol/bedrock/wire/structures/PlayerAuthInput';

/** A player's input as the scripts read it. */
export interface PlayerInputSnapshot {
    /** The movement input, `x` sideways and `y` forward, each from -1 to 1. */
    readonly movement: { readonly x: number; readonly y: number };
    readonly jump: boolean;
    readonly sneak: boolean;
    /** The client's `InputMode`: 1 mouse and keyboard, 2 touch, 3 gamepad, 4 motion controller. */
    readonly inputMode: number;
    readonly gliding: boolean;
    readonly emoting: boolean;
}

/** The fields of an input this reads. */
interface InputFields {
    readonly moveVector: { readonly x: number; readonly y: number };
    readonly inputData: ReadonlySet<number>;
    readonly inputMode: number;
}

const inputs = new WeakMap<object, PlayerInputSnapshot>();

/**
 * Records a player's latest input. Gliding holds from the input that starts it to the one that
 * stops it.
 * @param player - The player's session, which keys the record.
 */
export const recordPlayerInput = (player: object, input: InputFields): void => {
    const before = inputs.get(player);
    const gliding = input.inputData.has(PlayerAuthInputData.START_GLIDING)
        ? true
        : input.inputData.has(PlayerAuthInputData.STOP_GLIDING)
          ? false
          : (before?.gliding ?? false);
    inputs.set(player, {
        movement: { x: input.moveVector.x, y: input.moveVector.y },
        jump: input.inputData.has(PlayerAuthInputData.JUMP_DOWN),
        sneak: input.inputData.has(PlayerAuthInputData.SNEAK_DOWN),
        inputMode: input.inputMode,
        gliding,
        emoting: input.inputData.has(PlayerAuthInputData.EMOTING)
    });
};

/** A player's latest input, or undefined before their client sent any. */
export const playerInputOf = (player: object): PlayerInputSnapshot | undefined => inputs.get(player);
