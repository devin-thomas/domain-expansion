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
  }) : _cancelNotification = cancelNotification;
  final FlutterLocalNotificationsPlugin _plugin;
  final Future<void> Function(int id)? _cancelNotification;
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
      for (final reminder in reminders) ...[
        _notificationIdForOffset(domainId, reminder.daysBefore),
        _notificationIdForOffset(domainId, reminder.daysBefore) + 1,
      ],
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
    final domains = await database.getDomains(includeArchived: true);
    for (final domain in domains) {
      await rescheduleDomain(
        domain,
        domain.id == null ? const [] : await database.getReminders(domain.id!),
      );
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

  int _notificationId(int domainId, ReminderRecord reminder) =>
      _notificationIdForOffset(domainId, reminder.daysBefore) +
      (reminder.targetType == 'expiration' ? 1 : 0);

  int _notificationIdForOffset(int domainId, int offset) =>
      domainId * 1000 + offset * 2;
}
