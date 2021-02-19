import UUID from '../../utils/UUID';

class CommandOriginData {
    public type!: number;
    public uuid!: UUID;
    public requestId!: string;
    public uniqueEntityId!: bigint;
}

export default CommandOriginData;
