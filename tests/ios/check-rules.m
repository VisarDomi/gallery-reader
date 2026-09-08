// Diagnostic only: ask Apple's WebKit runtime to load the built extension and
// report manifest/rule compiler errors. Does not alter Safari preferences.
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        NSURL *root = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]] isDirectory:YES];
        [WKWebExtension extensionWithResourceBaseURL:root completionHandler:^(WKWebExtension *extension, NSError *error) {
            if (error) { NSLog(@"CREATE: %@", error); exit(1); }
            NSLog(@"PARSE: %@", extension.errors);
            WKWebExtensionContext *context = [[WKWebExtensionContext alloc] initForExtension:extension];
            [context setPermissionStatus:WKWebExtensionContextPermissionStatusGrantedExplicitly forPermission:@"declarativeNetRequestWithHostAccess"];
            [context setPermissionStatus:WKWebExtensionContextPermissionStatusGrantedExplicitly forURL:[NSURL URLWithString:@"https://hitomi.la/"]];
            [context setPermissionStatus:WKWebExtensionContextPermissionStatusGrantedExplicitly forURL:[NSURL URLWithString:@"https://imhentai.xxx/"]];
            WKWebExtensionController *controller = [[WKWebExtensionController alloc] init];
            NSError *loadError = nil;
            BOOL loaded = [controller loadExtensionContext:context error:&loadError];
            NSLog(@"LOAD: %d %@", loaded, loadError);
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
                NSLog(@"RUNTIME: %@", context.errors);
                NSLog(@"CONTEXTS: %lu", (unsigned long)controller.extensionContexts.count);
                exit(context.errors.count ? 1 : 0);
            });
        }];
        [[NSRunLoop mainRunLoop] run];
    }
    return 0;
}
