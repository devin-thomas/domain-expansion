import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:domain_expansion/core/notifications/reminder_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'cancels only the notification IDs represented by a domain reminders list',
    () async {
      final cancelled = <int>[];
      final service = ReminderService(
        FlutterLocalNotificationsPlugin(),
        cancelNotification: (id) async => cancelled.add(id),
      );

      await service.cancelDomain(
        7,
        reminders: [
          ReminderRecord(
            id: 1,
            domainId: 7,
            daysBefore: 30,
            targetType: 'default',
            isEnabled: true,
            createdAt: DateTime(2026),
            updatedAt: DateTime(2026),
          ),
          ReminderRecord(
            id: 2,
            domainId: 7,
            daysBefore: 7,
            targetType: 'expiration',
            isEnabled: true,
            createdAt: DateTime(2026),
            updatedAt: DateTime(2026),
          ),
        ],
      );

      expect(cancelled, containsAll(<int>[7060, 7061, 7014, 7015]));
      expect(cancelled, hasLength(4));
    },
  );
}
