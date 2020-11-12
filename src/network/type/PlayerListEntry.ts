import Skin from '../../utils/skin/Skin';
import UUID from '../../utils/uuid';

export default class PlayerListEntry {
    public uuid!: UUID;
    public uniqueEntityId!: bigint;
    public name!: string;
    public xuid!: string;
    public platformChatId!: string;
    public buildPlatform!: number;
    public skin!: Skin;
    public isTeacher: boolean = false;
    public isHost: boolean = false;
}
