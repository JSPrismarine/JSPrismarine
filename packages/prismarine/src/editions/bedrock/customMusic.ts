/**
 * The packets that start, queue and stop the music a script or `/music` plays for a client.
 *
 * A Bedrock Dedicated Server sends each as a `LevelEventGenericPacket` whose event names the
 * action and whose data is a headless network NBT compound. Captured from 1.26.60.6:
 * `playMusic('music.game', { fade: 1, loop: true, volume: 0.5 })` sends `PLAY_CUSTOM_MUSIC` with
 * `fadeSeconds` 1, `repeatMode` 1, `trackName` `music.game` and `volume` 0.5, and `stopMusic()`
 * sends `STOP_CUSTOM_MUSIC` with `fadeSeconds` 0 alone.
 */
import { LevelEvent } from '@jsprismarine/minecraft';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import LevelEventGenericPacket from '@jsprismarine/protocol/bedrock/packet/LevelEventGenericPacket';

import { nbtBytesOf } from '../../nbtBytes';

/** A track to start, or to play once the one playing ends. */
export interface CustomMusicTrack {
    readonly action: 'play' | 'queue';
    readonly track: string;
    readonly volume: number;
    /** Seconds the track fades in over. */
    readonly fade: number;
    readonly loop: boolean;
}

/** Stops the music, fading out over `fade` seconds. */
export interface CustomMusicStop {
    readonly action: 'stop';
    readonly fade?: number;
}

/**
 * The compound's entries without its type byte, its empty name and nothing else: the two bytes
 * `nbtBytesOf` writes in front of a root compound named `''`.
 */
const headless = (tags: NBTTagCompound): Buffer => Buffer.from(nbtBytesOf(tags).subarray(2));

/** The packet that plays, queues or stops a client's music. */
export const customMusicPacket = (music: CustomMusicTrack | CustomMusicStop): LevelEventGenericPacket => {
    const packet = new LevelEventGenericPacket();
    const tags = new NBTTagCompound('');
    // BDS writes the entries in name order, as its compounds keep them.
    tags.addValue('fadeSeconds', new Types.FloatVal(music.fade ?? 0));
    if (music.action === 'stop') {
        packet.eventId = LevelEvent.STOP_CUSTOM_MUSIC;
    } else {
        packet.eventId = music.action === 'play' ? LevelEvent.PLAY_CUSTOM_MUSIC : LevelEvent.QUEUE_CUSTOM_MUSIC;
        tags.addValue('repeatMode', new Types.ByteVal(music.loop ? 1 : 0));
        tags.addValue('trackName', new Types.StringVal(music.track));
        tags.addValue('volume', new Types.FloatVal(music.volume));
    }
    packet.serializedEventData = headless(tags);
    return packet;
};
