/**
 * Small readers the loopback scenario files share: the text a player was shown, and a wait for a
 * player who left to be gone from the server.
 */
import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';

/** How far a player's eyes sit above its feet; positions on the wire are the eyes'. */
export const EYE_HEIGHT = 1.62;

/**
 * Every line the player was shown, oldest first: chat and system text, then the messages and
 * parameters of each command output, since the server answers a player's command with either.
 * @param player - The player whose screen is read.
 * @param from - How many chat lines and command outputs to skip, from an earlier {@link shownCount}.
 */
export const shownText = (player: LoopbackPlayer, from: ShownCount = { chat: 0, outputs: 0 }): string[] => [
    ...player.world
        .chat()
        .slice(from.chat)
        .map((text) => [text.message, ...(text.parameters ?? [])].join(' ')),
    ...player.world
        .commandOutput()
        .slice(from.outputs)
        .flatMap((output) =>
            output.outputMessages.map((message) => [message.messageId, ...message.parameters].join(' '))
        )
];

/** Where a player's chat and command output stood, for {@link shownText} to read what came after. */
export interface ShownCount {
    readonly chat: number;
    readonly outputs: number;
}

/** How many chat lines and command outputs the player has been shown so far. */
export const shownCount = (player: LoopbackPlayer): ShownCount => ({
    chat: player.world.chat().length,
    outputs: player.world.commandOutput().length
});

/** Whether the player was shown a line containing `text` after `from`. */
export const wasShown = (player: LoopbackPlayer, text: string | RegExp, from?: ShownCount): boolean =>
    shownText(player, from).some((line) => (typeof text === 'string' ? line.includes(text) : text.test(line)));

/**
 * Disconnects a player and ticks until the server no longer has a session for the name, so a
 * rejoin under it finds the record the leave saved.
 */
export const leaveAndWait = async (jsp: LoopbackServer, player: LoopbackPlayer): Promise<void> => {
    player.leave();
    await jsp.until(() => player.session() === undefined, `the server still has a session for ${player.name}`);
    // The leave hands the record's save to work outside the tick, and a rejoin in the very next
    // ticks read the record from before it: a script property and a Nether position came back
    // lost. A retail rejoin takes seconds, so the wait stands in for that.
    await jsp.tick(40);
};
