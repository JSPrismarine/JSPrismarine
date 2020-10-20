import Prismarine from "../../Prismarine";
import LoggerBuilder from "../../utils/Logger";

function withDeprecated(date: Date) {
    const removedOn = new Date(date.setDate(date.getDate() + 7));

    return (target: any, propertyKey: string) => {
        const original = target.descriptor.value;

        target.descriptor.value = function () {
            this.getLogger().warn(`§c[${target.key}] is deprecated and will be removed on §l§e${removedOn.toISOString().split('T')[0]}§r!`);
            return original.apply(this, arguments);
        };

        return target;
    };
};

export default withDeprecated;
