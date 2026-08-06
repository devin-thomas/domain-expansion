import 'package:domain_expansion/core/formatting/formatters.dart';
import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:domain_expansion/core/providers/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final domains = ref.watch(domainsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: domains.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) =>
            Center(child: Text('Could not load reports: $error')),
        data: (items) {
          final visible = items.where((domain) => !domain.isArchived).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
            children: [
              if (visible.isEmpty)
                _ReportsEmptyState(onAdd: () => context.push('/domains/new'))
              else ...[
                Text(
                  'Expected renewal cost',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                _CostWindow(title: 'Next 30 days', domains: visible, days: 30),
                _CostWindow(title: 'Next 90 days', domains: visible, days: 90),
                _CostWindow(
                  title: 'Next 12 months',
                  domains: visible,
                  days: 365,
                ),
                const SizedBox(height: 20),
                _SummaryCard(
                  title: 'Annualized renewal cost',
                  values: _currencyTotals(
                    visible,
                    now: DateTime.now(),
                    includeDate: false,
                  ),
                ),
                _RegistrarCard(domains: visible),
                _CountCard(
                  title: 'Lifecycle',
                  values: _counts(
                    visible.map((domain) => domain.lifecycleState.name),
                  ),
                ),
                _CountCard(
                  title: 'Ownership',
                  values: _counts(
                    visible.map((domain) => domain.ownershipType.name),
                  ),
                ),
                _CountCard(
                  title: 'Renewal intent',
                  values: _counts(
                    visible.map(
                      (domain) => domain.renewalIntent == RenewalIntent.renew
                          ? 'renew'
                          : 'let expire',
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 2,
        onDestinationSelected: (index) {
          if (index == 0) context.go('/');
          if (index == 1) context.go('/domains');
          if (index == 3) context.go('/settings');
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            label: 'Home',
          ),
          NavigationDestination(icon: Icon(Icons.language), label: 'Domains'),
          NavigationDestination(icon: Icon(Icons.analytics), label: 'Reports'),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

class _ReportsEmptyState extends StatelessWidget {
  const _ReportsEmptyState({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.analytics_outlined,
            size: 40,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 12),
          Text(
            'Your reports will appear here.',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 6),
          const Text(
            'Add a domain with a billing or expiration date to start tracking your portfolio.',
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add),
            label: const Text('Add a domain'),
          ),
        ],
      ),
    ),
  );
}

Map<CurrencyCode, int> _currencyTotals(
  List<DomainRecord> domains, {
  required DateTime now,
  required bool includeDate,
  int? days,
}) {
  final start = DateTime(now.year, now.month, now.day);
  final end = days == null
      ? DateTime(start.year + 1, start.month, start.day)
      : start.add(Duration(days: days));
  final totals = <CurrencyCode, int>{};
  for (final domain in domains) {
    final date = domain.effectiveBillingDate;
    final cost = domain.renewalCostMinor;
    final qualifies =
        domain.lifecycleState == LifecycleState.active &&
        domain.renewalIntent == RenewalIntent.renew &&
        cost != null &&
        (!includeDate ||
            (date != null && !date.isBefore(start) && !date.isAfter(end)));
    if (qualifies) {
      totals.update(
        domain.currency,
        (value) => value + cost,
        ifAbsent: () => cost,
      );
    }
  }
  return totals;
}

Map<String, int> _counts(Iterable<String> values) {
  final result = <String, int>{};
  for (final value in values) {
    result.update(value, (count) => count + 1, ifAbsent: () => 1);
  }
  return result;
}

class _CostWindow extends StatelessWidget {
  const _CostWindow({
    required this.title,
    required this.domains,
    required this.days,
  });
  final String title;
  final List<DomainRecord> domains;
  final int days;

  @override
  Widget build(BuildContext context) {
    final totals = _currencyTotals(
      domains,
      now: DateTime.now(),
      includeDate: true,
      days: days == 365 ? null : days,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (totals.isEmpty)
              const Text('No priced renewals')
            else
              ...totals.entries.map(
                (entry) => Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(entry.key.code),
                    Text(
                      formatMoney(entry.value, entry.key),
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.title, required this.values});
  final String title;
  final Map<CurrencyCode, int> values;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (values.isEmpty)
              const Text('No priced renewals')
            else
              ...values.entries.map(
                (entry) => Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(entry.key.code),
                    Text(formatMoney(entry.value, entry.key)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _RegistrarCard extends StatelessWidget {
  const _RegistrarCard({required this.domains});
  final List<DomainRecord> domains;

  @override
  Widget build(BuildContext context) {
    final grouped = <String, Map<CurrencyCode, int>>{};
    for (final domain in domains.where(
      (domain) =>
          domain.lifecycleState == LifecycleState.active &&
          domain.renewalIntent == RenewalIntent.renew &&
          domain.renewalCostMinor != null,
    )) {
      final registrar = domain.registrar ?? 'No registrar';
      grouped
          .putIfAbsent(registrar, () => {})
          .update(
            domain.currency,
            (value) => value + domain.renewalCostMinor!,
            ifAbsent: () => domain.renewalCostMinor!,
          );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Renewal cost by registrar',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            if (grouped.isEmpty)
              const Text('No priced renewals')
            else
              ...grouped.entries.map(
                (entry) => Padding(
                  padding: const EdgeInsets.only(bottom: 5),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(entry.key),
                      Text(
                        entry.value.entries
                            .map((item) => formatMoney(item.value, item.key))
                            .join('  '),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CountCard extends StatelessWidget {
  const _CountCard({required this.title, required this.values});
  final String title;
  final Map<String, int> values;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (values.isEmpty)
              const Text('No domains')
            else
              ...values.entries.map(
                (entry) => Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [Text(_label(entry.key)), Text('${entry.value}')],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _label(String value) => value
    .replaceAllMapped(
      RegExp(r'([a-z])([A-Z])'),
      (match) => '${match.group(1)} ${match.group(2)}',
    )
    .split(' ')
    .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
    .join(' ');
