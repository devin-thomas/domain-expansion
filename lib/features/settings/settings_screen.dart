import 'package:domain_expansion/core/database/app_database.dart';
import 'package:domain_expansion/core/import_export/export_service.dart';
import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:domain_expansion/core/providers/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _offsets = TextEditingController();
  final _exportService = ExportService();
  CurrencyCode _currency = CurrencyCode.usd;
  TimeOfDay _notificationTime = const TimeOfDay(hour: 9, minute: 0);
  bool _notificationsEnabled = false;
  bool _loading = true;
  bool _saving = false;
  bool _notificationsBusy = false;
  bool _backupBusy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final database = ref.read(databaseProvider);
    final metadata = await database.getMetadata();
    _currency =
        CurrencyCode.tryFromCode(metadata['default_currency'] ?? '') ??
        CurrencyCode.usd;
    _offsets.text = metadata['default_reminder_offsets'] ?? '30,14,7,1';
    final hour =
        int.tryParse(metadata['default_notification_hour'] ?? '9') ?? 9;
    _notificationTime = TimeOfDay(hour: hour.clamp(0, 23).toInt(), minute: 0);
    _notificationsEnabled = metadata['notifications_enabled'] == '1';
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    _offsets.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
          children: [
            Text('Defaults', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    DropdownButtonFormField<CurrencyCode>(
                      initialValue: _currency,
                      decoration: const InputDecoration(
                        labelText: 'Default currency',
                      ),
                      items: CurrencyCode.values
                          .map(
                            (value) => DropdownMenuItem(
                              value: value,
                              child: Text('${value.code} (${value.symbol})'),
                            ),
                          )
                          .toList(),
                      onChanged: (value) => setState(() => _currency = value!),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _offsets,
                      decoration: const InputDecoration(
                        labelText: 'Reminder offsets',
                        helperText:
                            'Up to 12 offsets from 0 to 3660 days, e.g. 30,14,7,1',
                      ),
                      keyboardType: TextInputType.number,
                    ),
                    const SizedBox(height: 14),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Notification time'),
                      subtitle: Text(_notificationTime.format(context)),
                      trailing: const Icon(Icons.schedule),
                      onTap: () async {
                        final selected = await showTimePicker(
                          context: context,
                          initialTime: _notificationTime,
                        );
                        if (selected != null) {
                          setState(() => _notificationTime = selected);
                        }
                      },
                    ),
                    Align(
                      alignment: Alignment.centerRight,
                      child: FilledButton(
                        onPressed: _saving ? null : _save,
                        child: _saving
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Text('Save defaults'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Notifications',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Card(
              child: ListTile(
                leading: const Icon(Icons.notifications_outlined),
                title: Text(
                  _notificationsEnabled
                      ? 'Notifications enabled'
                      : 'Permission not requested',
                ),
                subtitle: const Text('Reminders stay on this device.'),
                trailing: _notificationsBusy
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : OutlinedButton(
                        onPressed: _requestNotifications,
                        child: Text(_notificationsEnabled ? 'Check' : 'Enable'),
                      ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Backup and restore',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.ios_share),
                    title: const Text('Export JSON'),
                    subtitle: const Text(
                      'Full-fidelity, human-readable backup',
                    ),
                    onTap: _backupBusy
                        ? null
                        : () => _export(ExportFormat.json),
                  ),
                  ListTile(
                    leading: const Icon(Icons.data_object),
                    title: const Text('Export YAML'),
                    subtitle: const Text('Human-readable full-fidelity backup'),
                    onTap: _backupBusy
                        ? null
                        : () => _export(ExportFormat.yaml),
                  ),
                  ListTile(
                    leading: const Icon(Icons.table_chart_outlined),
                    title: const Text('Export XLSX'),
                    subtitle: const Text('Workbook for Excel or Google Sheets'),
                    onTap: _backupBusy
                        ? null
                        : () => _export(ExportFormat.xlsx),
                  ),
                  ListTile(
                    leading: const Icon(Icons.storage_outlined),
                    title: const Text('Export SQLite'),
                    subtitle: const Text('Portable database backup'),
                    onTap: _backupBusy
                        ? null
                        : () => _export(ExportFormat.sqlite),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.file_upload_outlined),
                    title: const Text('Import backup'),
                    subtitle: const Text(
                      'Preview conflicts before changing local data',
                    ),
                    onTap: _backupBusy ? null : _import,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text('About', style: Theme.of(context).textTheme.titleLarge),
            Card(
              child: Column(
                children: [
                  const ListTile(
                    title: Text('Domain Expansion'),
                    subtitle: Text('Website Domain Tracker'),
                  ),
                  ListTile(
                    title: const Text('App version'),
                    trailing: const Text('0.1.0'),
                  ),
                  ListTile(
                    title: const Text('Database schema'),
                    trailing: FutureBuilder<String?>(
                      future: ref
                          .read(databaseProvider)
                          .getMetadataValue('schema_version'),
                      builder: (_, snapshot) => Text(snapshot.data ?? '2'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 3,
        onDestinationSelected: (index) {
          if (index == 0) context.go('/');
          if (index == 1) context.go('/domains');
          if (index == 2) context.go('/reports');
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            label: 'Home',
          ),
          NavigationDestination(icon: Icon(Icons.language), label: 'Domains'),
          NavigationDestination(
            icon: Icon(Icons.analytics_outlined),
            label: 'Reports',
          ),
          NavigationDestination(icon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final rawValues = _offsets.text.split(',');
    final values = rawValues
        .map((value) => int.tryParse(value.trim()))
        .toList();
    final validValues = values.whereType<int>().toSet();
    if (rawValues.any((value) => value.trim().isEmpty) ||
        values.any(
          (value) =>
              value == null || value < 0 || value > maxReminderDaysBefore,
        ) ||
        validValues.isEmpty ||
        validValues.length > maxReminderOffsets) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Use up to 12 whole-number offsets from 0 to 3660 days.',
          ),
        ),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final normalized = validValues.toList()..sort((a, b) => b.compareTo(a));
      final database = ref.read(databaseProvider);
      await database.setMetadataValue('default_currency', _currency.code);
      await database.setMetadataValue(
        'default_reminder_offsets',
        normalized.join(','),
      );
      await database.setMetadataValue(
        'default_notification_hour',
        '${_notificationTime.hour}',
      );
      _offsets.text = normalized.join(',');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Settings saved')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not save settings: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _requestNotifications() async {
    if (_notificationsBusy) return;
    setState(() => _notificationsBusy = true);
    try {
      final granted = await ref
          .read(reminderServiceProvider)
          .requestPermission();
      await ref
          .read(databaseProvider)
          .setMetadataValue('notifications_enabled', granted ? '1' : '0');
      if (mounted) setState(() => _notificationsEnabled = granted);
      if (granted) {
        await ref
            .read(reminderServiceProvider)
            .rescheduleAll(ref.read(databaseProvider));
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              granted
                  ? 'Notifications are ready.'
                  : 'Notifications remain disabled.',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update notifications: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _notificationsBusy = false);
    }
  }

  Future<void> _export(ExportFormat format) async {
    if (_backupBusy) return;
    setState(() => _backupBusy = true);
    try {
      final size = MediaQuery.sizeOf(context);
      await _exportService.exportAndShare(
        ref.read(databaseProvider),
        format,
        sharePositionOrigin: Rect.fromLTWH(0, 0, size.width, size.height),
      );
    } catch (error, stackTrace) {
      debugPrint('Backup export failed: $error\n$stackTrace');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_backupErrorMessage(error, importing: false))),
        );
      }
    } finally {
      if (mounted) setState(() => _backupBusy = false);
    }
  }

  Future<void> _import() async {
    if (_backupBusy) return;
    setState(() => _backupBusy = true);
    try {
      final document = await _exportService.pickImport();
      if (!mounted) return;
      final domainCount = (document.snapshot['domains'] as List).length;
      final reminderCount = (document.snapshot['reminders'] as List).length;
      final policy = await showDialog<ImportConflictPolicy>(
        context: context,
        builder: (context) => SimpleDialog(
          title: Text('Import ${document.name}?'),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
              child: Text(
                '$domainCount domains and $reminderCount reminders found. Choose how duplicates should be handled.',
              ),
            ),
            SimpleDialogOption(
              onPressed: () =>
                  Navigator.pop(context, ImportConflictPolicy.skip),
              child: const Text('Skip existing domains'),
            ),
            SimpleDialogOption(
              onPressed: () =>
                  Navigator.pop(context, ImportConflictPolicy.replace),
              child: const Text('Replace existing domains'),
            ),
            SimpleDialogOption(
              onPressed: () =>
                  Navigator.pop(context, ImportConflictPolicy.merge),
              child: const Text('Merge existing domains'),
            ),
          ],
        ),
      );
      if (policy == null) return;
      final summary = await ref
          .read(databaseProvider)
          .importSnapshot(document.snapshot, policy);
      await ref
          .read(reminderServiceProvider)
          .rescheduleAll(ref.read(databaseProvider));
      ref.invalidate(domainsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Imported ${summary.created} new, ${summary.updated} updated, ${summary.skipped} skipped.',
            ),
          ),
        );
      }
    } on ImportCancelledException {
      return;
    } catch (error, stackTrace) {
      debugPrint('Backup import failed: $error\n$stackTrace');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_backupErrorMessage(error, importing: true))),
        );
      }
    } finally {
      if (mounted) setState(() => _backupBusy = false);
    }
  }

  String _backupErrorMessage(Object error, {required bool importing}) {
    if (error is FormatException) {
      return importing
          ? 'This file is not a valid Domain Expansion backup.'
          : 'Could not prepare the backup. Please try again.';
    }
    if (error is PlatformException &&
        (error.message?.contains('sharePositionOrigin') ?? false)) {
      return 'Could not open the share sheet. Please try again.';
    }
    return importing
        ? 'Could not import the backup. No changes were applied.'
        : 'Could not export the backup. Please try again.';
  }
}
