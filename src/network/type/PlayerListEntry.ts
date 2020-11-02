import type UUID from "../../utils/UUID";
import type Skin from '../../utils/skin/Skin';

export default class PlayerListEntry {
    public uuid!: UUID;
    public uniqueEntityId!: number;
    public name!: string;
    public xuid!: string;
    public platformChatId!: string;
    public buildPlatform!: number;
    public skin!: Skin;
    public isTeacher!: boolean;
    public isHost!: boolean;
}
