#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>
#import <stdbool.h>

extern void hydropace_notification_action(const char *action);
extern void hydropace_notification_authorization_changed(bool granted);

static NSString *const HydropaceCategory = @"water-reminder";
static NSString *const HydropaceActionDrink = @"drink";
static NSString *const HydropaceActionSnooze = @"snooze";
static NSString *const HydropaceActionSkip = @"skip";

static UNUserNotificationCenter *hydropace_current_center(void) {
  NSString *extension = NSBundle.mainBundle.bundleURL.pathExtension;
  if (extension == nil || [extension caseInsensitiveCompare:@"app"] != NSOrderedSame) {
    NSLog(@"[native-notify] current process is not an app bundle; using fallback sender");
    return nil;
  }

  @try {
    return [UNUserNotificationCenter currentNotificationCenter];
  } @catch (NSException *exception) {
    NSLog(@"[native-notify] currentNotificationCenter exception: %@", exception);
    return nil;
  }
}

@interface HydropaceUNDelegate : NSObject <UNUserNotificationCenterDelegate>
@end

@implementation HydropaceUNDelegate

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler {
  UNNotificationPresentationOptions options = UNNotificationPresentationOptionSound;

  if (@available(macOS 11.0, *)) {
    options |= UNNotificationPresentationOptionBanner;
    options |= UNNotificationPresentationOptionList;
  } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    options |= UNNotificationPresentationOptionAlert;
#pragma clang diagnostic pop
  }

  completionHandler(options);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler {
  NSString *identifier = response.actionIdentifier;

  if ([identifier isEqualToString:UNNotificationDefaultActionIdentifier]) {
    hydropace_notification_action("open");
  } else if ([identifier isEqualToString:HydropaceActionDrink]) {
    hydropace_notification_action("drink");
  } else if ([identifier isEqualToString:HydropaceActionSnooze]) {
    hydropace_notification_action("snooze");
  } else if ([identifier isEqualToString:HydropaceActionSkip] ||
             [identifier isEqualToString:UNNotificationDismissActionIdentifier]) {
    hydropace_notification_action("skip");
  }

  completionHandler();
}

@end

static HydropaceUNDelegate *HydropaceDelegate = nil;

static void hydropace_register_category(UNUserNotificationCenter *center) {
  UNNotificationAction *drink =
      [UNNotificationAction actionWithIdentifier:HydropaceActionDrink
                                           title:@"我喝了"
                                         options:UNNotificationActionOptionNone];
  UNNotificationAction *snooze =
      [UNNotificationAction actionWithIdentifier:HydropaceActionSnooze
                                           title:@"5 分钟后"
                                         options:UNNotificationActionOptionNone];
  UNNotificationAction *skip =
      [UNNotificationAction actionWithIdentifier:HydropaceActionSkip
                                           title:@"跳过"
                                         options:UNNotificationActionOptionNone];

  UNNotificationCategoryOptions options = UNNotificationCategoryOptionCustomDismissAction;
  UNNotificationCategory *category =
      [UNNotificationCategory categoryWithIdentifier:HydropaceCategory
                                             actions:@[ drink, snooze, skip ]
                                   intentIdentifiers:@[]
                                             options:options];
  [center setNotificationCategories:[NSSet setWithObject:category]];
}

bool hydropace_native_notify_setup(void) {
  UNUserNotificationCenter *center = hydropace_current_center();
  if (center == nil) {
    return false;
  }

  if (HydropaceDelegate == nil) {
    HydropaceDelegate = [HydropaceUNDelegate new];
  }

  center.delegate = HydropaceDelegate;
  hydropace_register_category(center);

  UNAuthorizationOptions options =
      UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge;
  [center requestAuthorizationWithOptions:options
                        completionHandler:^(BOOL granted, NSError *_Nullable error) {
                          if (error != nil) {
                            NSLog(@"[native-notify] authorization error: %@", error);
                            hydropace_notification_authorization_changed(false);
                          } else {
                            NSLog(@"[native-notify] authorization granted=%@", granted ? @"YES" : @"NO");
                            hydropace_notification_authorization_changed(granted);
                          }
                        }];
  return true;
}

bool hydropace_native_notify_send(const char *title, const char *body) {
  if (title == NULL || body == NULL) {
    return false;
  }

  UNUserNotificationCenter *center = hydropace_current_center();
  if (center == nil) {
    return false;
  }

  UNMutableNotificationContent *content = [UNMutableNotificationContent new];
  content.title = [NSString stringWithUTF8String:title];
  content.body = [NSString stringWithUTF8String:body];
  content.sound = [UNNotificationSound defaultSound];
  content.categoryIdentifier = HydropaceCategory;
  content.threadIdentifier = @"water-reminder";

  NSString *identifier =
      [NSString stringWithFormat:@"water-reminder-%lld",
                                 (long long)([[NSDate date] timeIntervalSince1970] * 1000.0)];
  UNNotificationRequest *request =
      [UNNotificationRequest requestWithIdentifier:identifier content:content trigger:nil];

  [center addNotificationRequest:request
           withCompletionHandler:^(NSError *_Nullable error) {
             if (error != nil) {
               NSLog(@"[native-notify] add request error: %@", error);
               hydropace_notification_authorization_changed(false);
             } else {
               NSLog(@"[native-notify] notification request queued: %@", identifier);
             }
           }];

  return true;
}
