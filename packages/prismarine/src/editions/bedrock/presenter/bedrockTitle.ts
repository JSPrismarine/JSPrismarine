/** Titles, subtitles and the action bar in Bedrock's `SetTitle` packet. */
import { TitleType } from '@jsprismarine/minecraft';
import SetTitlePacket from '@jsprismarine/protocol/bedrock/packet/SetTitlePacket';

import type { ShownTitle } from '../../../player/presenter/SessionPresenter';

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

/**
 * One title instruction as the packet carries it.
 *
 * `clear`, `reset` and `times` write no text, which is why the instruction is
 * a union rather than a kind plus a string: a `times` form sent as text is a
 * title reading "20".
 * @param title - The instruction.
 * @returns The packet.
 */
export const titlePacketOf = (title: ShownTitle): SetTitlePacket => {
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
