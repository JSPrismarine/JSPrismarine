/**
 * Waits for sends that were all queued before this was called, in the order they were made.
 *
 * A send queues its packet before its first await (`MinecraftSession.sendDataPacket`), so a
 * method that calls each send in turn and hands the promises here has queued every packet when
 * it returns, and has written everything it writes. Awaiting each send in turn instead queued
 * the next packet, and made the writes after it, only once the transport framed the last.
 *
 * @param sends - The sends, already started.
 * @returns Settles once the transport has framed every packet, and rejects with the first failure.
 */
export const allSent = async (sends: readonly Promise<void>[]): Promise<void> => {
    await Promise.all(sends);
};
