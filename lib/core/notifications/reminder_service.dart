import 'package:domain_expansion/core/database/app_database.dart';
import 'package:domain_expansion/core/formatting/formatters.dart';
import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

class ReminderService {
  ReminderService(
    this._plugin, {
    Future<void> Function(int id)? cancelNotification,
    Future<void> Function()? cancelAllNotifications,
  }) : _cancelNotification = cancelNotification,
       _cancelAllNotifications = cancelAllNotifications;
  final FlutterLocalNotificationsPlugin _plugin;
  final Future<void> Function(int id)? _cancelNotification;
  final Future<void> Function()? _cancelAllNotifications;
  int notificationHour = 9;

  Future<void> initialize() async {
    tz_data.initializeTimeZones();
    final localTimezone = await FlutterTimezone.getLocalTimezone();
    tz.setLocalLocation(tz.getLocation(localTimezone.identifier));
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
    );
    await _plugin.initialize(settings);
  }

  Future<bool> requestPermission() async {
    final ios = await _plugin
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: true, sound: true);
    final mac = await _plugin
        .resolvePlatformSpecificImplementation<
          MacOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: true, sound: true);
    final android = await _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();
    return ios ?? mac ?? android ?? true;
  }

  Future<void> configureFromDatabase(AppDatabase database) async {
    final rawHour = await database.getMetadataValue(
      'default_notification_hour',
    );
    notificationHour = (int.tryParse(rawHour ?? '') ?? 9).clamp(0, 23).toInt();
  }

  Future<void> rescheduleDomain(
    DomainRecord domain,
    List<ReminderRecord> reminders,
  ) async {
    await cancelDomain(domain.id, reminders: reminders);
    await _scheduleDomain(domain, reminders);
  }

  Future<void> _scheduleDomain(
    DomainRecord domain,
    List<ReminderRecord> reminders,
  ) async {
    if (domain.id == null ||
        domain.isArchived ||
        domain.lifecycleState != LifecycleState.active) {
      return;
    }
    for (final reminder in reminders.where((item) => item.isEnabled)) {
      final date = _targetDate(domain, reminder);
      if (date == null) continue;
      final scheduled = DateTime(
        date.year,
        date.month,
        date.day,
      ).subtract(Duration(days: reminder.daysBefore));
      final now = DateTime.now();
      if (!scheduled.isAfter(now)) continue;
      final scheduledTime = tz.TZDateTime(
        tz.local,
        scheduled.year,
        scheduled.month,
        scheduled.day,
        notificationHour,
      );
      final amount = domain.renewalCostMinor == null
          ? ''
          : ' Expected cost: ${formatMoney(domain.renewalCostMinor, domain.currency)}.';
      final targetLabel = _targetType(domain, reminder) == 'billing'
          ? 'billing'
          : 'expiration';
      await _plugin.zonedSchedule(
        _notificationId(domain.id!, reminder),
        '${domain.name} reminder',
        '${reminder.daysBefore == 0 ? 'Today' : '${reminder.daysBefore} days'} until $targetLabel.$amount',
        scheduledTime,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'domain_reminders',
            'Domain reminders',
            channelDescription: 'Domain billing and expiration reminders',
          ),
          iOS: DarwinNotificationDetails(),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );
    }
  }

  Future<void> cancelDomain(
    int? domainId, {
    Iterable<ReminderRecord> reminders = const [],
  }) async {
    if (domainId == null) return;
    final ids = <int>{
      for (final reminder in reminders)
        ..._notificationIdsForReminder(domainId, reminder),
    };
    for (final id in ids) {
      if (_cancelNotification != null) {
        await _cancelNotification(id);
      } else {
        await _plugin.cancel(id);
      }
    }
  }

  Future<void> rescheduleAll(AppDatabase database) async {
    await configureFromDatabase(database);
    if (_cancelAllNotifications != null) {
      await _cancelAllNotifications();
    } else {
      await _plugin.cancelAll();
    }
    final domains = await database.getDomains(includeArchived: true);
    final remindersByDomain = await database.getRemindersByDomain();
    const batchSize = 8;
    final pending = <Future<void>>[];
    for (final domain in domains) {
      pending.add(
        _scheduleDomain(domain, remindersByDomain[domain.id] ?? const []),
      );
      if (pending.length == batchSize) {
        await Future.wait(pending);
        pending.clear();
      }
    }
    if (pending.isNotEmpty) {
      await Future.wait(pending);
    }
  }

  DateTime? _targetDate(DomainRecord domain, ReminderRecord reminder) {
    final target = _targetType(domain, reminder);
    return target == 'billing'
        ? domain.effectiveBillingDate
        : domain.effectiveExpirationDate;
  }

  String _targetType(DomainRecord domain, ReminderRecord reminder) {
    if (reminder.targetType == 'billing' ||
        reminder.targetType == 'expiration') {
      return reminder.targetType;
    }
    return domain.renewalIntent == RenewalIntent.renew
        ? 'billing'
        : 'expiration';
  }

  Iterable<int> _notificationIdsForReminder(
    int domainId,
    ReminderRecord reminder,
  ) sync* {
    final currentBase = reminder.id == null
        ? _notificationIdForOffset(domainId, reminder.daysBefore)
        : reminder.id! * 2;
    yield currentBase;
    yield currentBase + 1;

    // Clean up IDs created by versions before reminders had stable IDs.
    final legacyBase = _notificationIdForOffset(domainId, reminder.daysBefore);
    if (legacyBase != currentBase) {
      yield legacyBase;
      yield legacyBase + 1;
    }
  }

  int _notificationId(int domainId, ReminderRecord reminder) {
    final base = reminder.id == null
        ? _notificationIdForOffset(domainId, reminder.daysBefore)
        : reminder.id! * 2;
    return base + (reminder.targetType == 'expiration' ? 1 : 0);
  }

  int _notificationIdForOffset(int domainId, int offset) =>
      domainId * 1000 + offset * 2;
}
