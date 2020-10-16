import type UUID from "../../utils/UUID";
import type Skin from '../../utils/skin/Skin';


class PlayerListEntry {
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
export default PlayerListEntry;
