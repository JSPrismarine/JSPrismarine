import Tag from './internal/Tag';
import TagType from './internal/TagType';

export default class ListTag extends Tag {
    listType: any;
    type: TagType = TagType.List;

    constructor(type: any, value: any, name: any) {
        super(value, name);
        this.listType = type;
    }
}
