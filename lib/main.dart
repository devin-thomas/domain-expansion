import 'package:domain_expansion/app/app.dart';
import 'package:domain_expansion/core/database/app_database.dart';
import 'package:domain_expansion/core/providers/providers.dart';
import 'package:domain_expansion/core/notifications/reminder_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final database = AppDatabase();
  await database.open();
  final reminders = ReminderService(FlutterLocalNotificationsPlugin());
  await reminders.initialize();
  await reminders.configureFromDatabase(database);
  runApp(
    ProviderScope(
      overrides: [
        databaseProvider.overrideWithValue(database),
        reminderServiceProvider.overrideWithValue(reminders),
      ],
      child: const DomainExpansionApp(),
    ),
  );
}
