import LoggerBuilder from '../utils/Logger';

const withDeprecated = (date: Date, replacement?: string) => {
    const removedOn = new Date(date.setDate(date.getDate() + 7));
    return (target: any, propertyKey: string, descriptor: any) => {
        // Fix javascript & typescript different runtime fuckery
        if (!descriptor) descriptor = target.descriptor || descriptor.descriptor;
        if (!target.descriptor) target.descriptor = descriptor.descriptor;
        if (!target.value) target.value = descriptor?.value || target?.value;
        if (!propertyKey) propertyKey = target.key || descriptor.key;

        const targetMethod = target.value;
        target.value = function (...args: any[]) {
            (this?.getLogger?.() || new LoggerBuilder()).warn(
                `§c${propertyKey}§r is deprecated and will be removed on §l§e${
                    removedOn.toISOString().split('T')[0]
                }§r${replacement ? `. Use §2${replacement}§r instead` : ''}!`
            );

            return targetMethod.apply(this, args);
        };

        target.descriptor = descriptor;
        target.descriptor.value = target.value; // More js fuckery
        return target;
    };
};

export default withDeprecated;
