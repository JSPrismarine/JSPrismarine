import Tag from './internal/Tag';
import TagType from './internal/TagType';

export default class ListTag extends Tag {
    public tagType: TagType;
    public type = TagType.List;

    constructor(value: (Tag | null)[], name: string, tagType = TagType.End) {
        super(value, name);
        this.tagType = tagType;
    }
}
