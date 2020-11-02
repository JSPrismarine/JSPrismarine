import type UUID from '../../utils/UUID';


class CommandOriginData {
    public type!: number;
    public uuid!: UUID;
    public requestId!: string;
    public uniqueEntityId: number|null = null;
    
}
export default CommandOriginData;
