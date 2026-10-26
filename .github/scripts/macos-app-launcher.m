#import <Foundation/Foundation.h>

int main(void) {
    @autoreleasepool {
        NSString *commandPath = [[NSBundle mainBundle] pathForResource:@"JSPrismarine" ofType:@"command"];
        if (commandPath == nil) {
            fprintf(stderr, "JSPrismarine.command is missing from the app bundle.\n");
            return 1;
        }

        NSTask *terminal = [[NSTask alloc] init];
        terminal.executableURL = [NSURL fileURLWithPath:@"/usr/bin/open"];
        terminal.arguments = @[@"-a", @"Terminal", commandPath];

        NSError *error = nil;
        if (![terminal launchAndReturnError:&error]) {
            fprintf(stderr, "Could not open Terminal: %s\n", error.localizedDescription.UTF8String);
            return 1;
        }
    }

    return 0;
}
