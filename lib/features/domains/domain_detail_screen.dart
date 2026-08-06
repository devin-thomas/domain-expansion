import 'package:domain_expansion/core/formatting/formatters.dart';
import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:domain_expansion/core/providers/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class DomainDetailScreen extends ConsumerWidget {
  const DomainDetailScreen({super.key, required this.domainId});
  final int domainId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final domain = ref.watch(domainProvider(domainId));
    final reminders = ref.watch(remindersProvider(domainId));
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: () => context.go('/domains'),
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Back to domains',
        ),
        title: const Text('Domain'),
        actions: [
          IconButton(
            onPressed: () => context.go('/domains/$domainId/edit'),
            icon: const Icon(Icons.edit),
            tooltip: 'Edit domain',
          ),
        ],
      ),
      body: domain.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) =>
            Center(child: Text('Could not load domain: $error')),
        data: (value) {
          if (value == null) {
            return const Center(child: Text('Domain not found.'));
          }
          return ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          value.name,
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        if (value.isArchived)
                          const Text(
                            'Archived',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => _duplicate(context, ref, value),
                    icon: const Icon(Icons.content_copy),
                    tooltip: 'Duplicate domain',
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _InfoCard(
                title: 'Status',
                children: [
                  _field('Ownership', _label(value.ownershipType.name)),
                  _field('Lifecycle', _label(value.lifecycleState.name)),
                  _field(
                    'Renewal intent',
                    value.renewalIntent == RenewalIntent.renew
                        ? 'Renew'
                        : 'Let expire',
                  ),
                ],
              ),
              _InfoCard(
                title: 'Dates',
                children: [
                  _field('Billing date', formatDate(value.billingDate)),
                  _field(
                    'Effective billing',
                    formatDate(value.effectiveBillingDate),
                  ),
                  _field('Expiration date', formatDate(value.expirationDate)),
                  _field(
                    'Effective expiration',
                    formatDate(value.effectiveExpirationDate),
                  ),
                  _field(
                    'Registration date',
                    formatDate(value.registrationDate),
                  ),
                ],
              ),
              _InfoCard(
                title: 'Costs and providers',
                children: [
                  _field('Currency', value.currency.code),
                  _field(
                    'Registration cost',
                    formatMoney(value.registrationCostMinor, value.currency),
                  ),
                  _field(
                    'Renewal cost',
                    formatMoney(value.renewalCostMinor, value.currency),
                  ),
                  _field('Registrar', value.registrar ?? '—'),
                  _field('DNS provider', value.dnsProvider ?? '—'),
                ],
              ),
              _InfoCard(
                title: 'Reminders',
                children: [
                  reminders.when(
                    loading: () => const ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Loading reminders...'),
                    ),
                    error: (error, _) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('Could not load reminders: $error'),
                    ),
                    data: (items) => items.isEmpty
                        ? const ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text('No reminders configured.'),
                          )
                        : Column(
                            children: items
                                .map(
                                  (reminder) => ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(
                                      '${reminder.daysBefore} days before',
                                    ),
                                    subtitle: Text(
                                      reminder.targetType == 'default'
                                          ? 'Follows renewal intent'
                                          : _label(reminder.targetType),
                                    ),
                                    leading: Switch(
                                      value: reminder.isEnabled,
                                      onChanged: (enabled) => _toggleReminder(
                                        context,
                                        ref,
                                        value,
                                        reminder,
                                        enabled,
                                      ),
                                    ),
                                    trailing: DropdownButton<String>(
                                      value: reminder.targetType,
                                      underline: const SizedBox.shrink(),
                                      items: const [
                                        DropdownMenuItem(
                                          value: 'default',
                                          child: Text('Default'),
                                        ),
                                        DropdownMenuItem(
                                          value: 'billing',
                                          child: Text('Billing'),
                                        ),
                                        DropdownMenuItem(
                                          value: 'expiration',
                                          child: Text('Expiration'),
                                        ),
                                      ],
                                      onChanged: (target) {
                                        if (target != null) {
                                          _changeReminderTarget(
                                            context,
                                            ref,
                                            value,
                                            reminder,
                                            target,
                                          );
                                        }
                                      },
                                    ),
                                  ),
                                )
                                .toList(),
                          ),
                  ),
                ],
              ),
              if ((value.notes ?? '').isNotEmpty)
                _InfoCard(title: 'Notes', children: [Text(value.notes!)]),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => _toggleArchive(context, ref, value),
                icon: Icon(
                  value.isArchived ? Icons.unarchive : Icons.archive_outlined,
                ),
                label: Text(value.isArchived ? 'Unarchive' : 'Archive'),
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: () => _delete(context, ref, value),
                icon: const Icon(Icons.delete_outline),
                label: const Text('Delete domain'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _toggleReminder(
    BuildContext context,
    WidgetRef ref,
    DomainRecord domain,
    ReminderRecord reminder,
    bool enabled,
  ) async {
    if (reminder.id == null) return;
    try {
      final database = ref.read(databaseProvider);
      await database.setReminderEnabled(reminder.id!, enabled);
      await ref
          .read(reminderServiceProvider)
          .rescheduleDomain(domain, await database.getReminders(domainId));
      ref.invalidate(remindersProvider(domainId));
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update reminder: $error')),
        );
      }
    }
  }

  Future<void> _changeReminderTarget(
    BuildContext context,
    WidgetRef ref,
    DomainRecord domain,
    ReminderRecord reminder,
    String targetType,
  ) async {
    if (reminder.id == null) return;
    final updated = ReminderRecord(
      id: reminder.id,
      domainId: reminder.domainId,
      daysBefore: reminder.daysBefore,
      targetType: targetType,
      isEnabled: reminder.isEnabled,
      createdAt: reminder.createdAt,
      updatedAt: DateTime.now(),
    );
    try {
      final database = ref.read(databaseProvider);
      await database.saveReminder(updated);
      await ref
          .read(reminderServiceProvider)
          .rescheduleDomain(domain, await database.getReminders(domainId));
      ref.invalidate(remindersProvider(domainId));
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update reminder: $error')),
        );
      }
    }
  }

  Future<void> _toggleArchive(
    BuildContext context,
    WidgetRef ref,
    DomainRecord domain,
  ) async {
    try {
      final database = ref.read(databaseProvider);
      await database.setArchived(domainId, !domain.isArchived);
      final updated = await database.getDomain(domainId);
      if (updated != null) {
        await ref
            .read(reminderServiceProvider)
            .rescheduleDomain(updated, await database.getReminders(domainId));
      }
      invalidateDomainData(ref, domainId);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update archive state: $error')),
        );
      }
    }
  }

  Future<void> _duplicate(
    BuildContext context,
    WidgetRef ref,
    DomainRecord domain,
  ) async {
    try {
      final id = await ref.read(databaseProvider).duplicateDomain(domain);
      invalidateDomainData(ref, id);
      if (context.mounted) context.go('/domains/$id/edit');
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not duplicate domain: $error')),
        );
      }
    }
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    DomainRecord domain,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete domain?'),
        content: Text('Delete ${domain.name} and its reminders?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final database = ref.read(databaseProvider);
      final reminders = await database.getReminders(domainId);
      await ref
          .read(reminderServiceProvider)
          .cancelDomain(domainId, reminders: reminders);
      await database.deleteDomain(domainId);
      invalidateDomainData(ref);
      if (context.mounted) context.go('/domains');
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not delete domain: $error')),
        );
      }
    }
  }

  Widget _field(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 142,
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        Expanded(child: Text(value)),
      ],
    ),
  );
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    ),
  );
}

String _label(String value) => value
    .replaceAllMapped(
      RegExp(r'([a-z])([A-Z])'),
      (match) => '${match.group(1)} ${match.group(2)}',
    )
    .split(' ')
    .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
    .join(' ');
