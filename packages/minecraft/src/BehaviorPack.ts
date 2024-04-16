export interface BehaviorPack {
    id: string;
    version: string;
    size: bigint;
    contentKey: string;
    subpackName: string;
    contentId: string;
    scripting: boolean;
}
