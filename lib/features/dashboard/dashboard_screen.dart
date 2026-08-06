import 'package:domain_expansion/core/formatting/formatters.dart';
import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:domain_expansion/core/providers/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final domains = ref.watch(domainsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Domain Expansion'),
        actions: [
          IconButton(
            onPressed: () => context.go('/settings'),
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Settings',
          ),
        ],
      ),
      body: domains.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) =>
            Center(child: Text('Could not load domains: $error')),
        data: (items) {
          final active = items
              .where(
                (d) =>
                    !d.isArchived && d.lifecycleState == LifecycleState.active,
              )
              .toList();
          final nextPayment = nextPaymentFor(active);
          final totals = nextTwelveMonthTotals(active);
          final upcoming = [...active]
            ..sort((a, b) => _relevantDate(a).compareTo(_relevantDate(b)));
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
            children: [
              Text(
                'Your portfolio at a glance',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              _NextPaymentCard(domain: nextPayment),
              const SizedBox(height: 12),
              _TotalsCard(totals: totals),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Upcoming',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  TextButton(
                    onPressed: () => context.go('/domains'),
                    child: const Text('All domains'),
                  ),
                ],
              ),
              if (upcoming.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Nothing is scheduled yet.'),
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          onPressed: () => context.go('/domains/new'),
                          icon: const Icon(Icons.add),
                          label: const Text('Add a domain'),
                        ),
                      ],
                    ),
                  ),
                )
              else
                ...upcoming
                    .take(5)
                    .map(
                      (domain) => Card(
                        child: ListTile(
                          title: Text(domain.name),
                          subtitle: Text(
                            '${domain.renewalIntent == RenewalIntent.renew ? 'Billing' : 'Expiration'}  •  ${formatDate(_relevantDate(domain))}',
                          ),
                          trailing: Text(
                            domain.renewalIntent == RenewalIntent.renew
                                ? formatMoney(
                                    domain.renewalCostMinor,
                                    domain.currency,
                                  )
                                : 'Let expire',
                          ),
                          onTap: () => context.go('/domains/${domain.id}'),
                        ),
                      ),
                    ),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.go('/domains/new'),
        icon: const Icon(Icons.add),
        label: const Text('Add domain'),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          if (index == 1) context.go('/domains');
          if (index == 2) context.go('/reports');
          if (index == 3) context.go('/settings');
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Home',
          ),
          NavigationDestination(icon: Icon(Icons.language), label: 'Domains'),
          NavigationDestination(
            icon: Icon(Icons.analytics_outlined),
            label: 'Reports',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}

DateTime _relevantDate(DomainRecord domain) =>
    (domain.renewalIntent == RenewalIntent.renew
        ? domain.effectiveBillingDate
        : domain.effectiveExpirationDate) ??
    DateTime(9999);

DomainRecord? nextPaymentFor(List<DomainRecord> domains, {DateTime? now}) {
  final reference = now ?? DateTime.now();
  final today = DateTime(reference.year, reference.month, reference.day);
  final candidates =
      domains.where((domain) {
        final date = domain.effectiveBillingDate;
        return !domain.isArchived &&
            domain.lifecycleState == LifecycleState.active &&
            domain.renewalIntent == RenewalIntent.renew &&
            date != null &&
            !date.isBefore(today) &&
            domain.renewalCostMinor != null;
      }).toList()..sort((a, b) {
        final dateComparison = a.effectiveBillingDate!.compareTo(
          b.effectiveBillingDate!,
        );
        return dateComparison != 0
            ? dateComparison
            : a.normalizedName.compareTo(b.normalizedName);
      });
  return candidates.isEmpty ? null : candidates.first;
}

Map<CurrencyCode, int> nextTwelveMonthTotals(
  List<DomainRecord> domains, {
  DateTime? now,
}) {
  final reference = now ?? DateTime.now();
  final today = DateTime(reference.year, reference.month, reference.day);
  final end = DateTime(today.year + 1, today.month, today.day);
  final totals = <CurrencyCode, int>{};
  for (final domain in domains) {
    final date = domain.effectiveBillingDate;
    final cost = domain.renewalCostMinor;
    if (!domain.isArchived &&
        domain.lifecycleState == LifecycleState.active &&
        domain.renewalIntent == RenewalIntent.renew &&
        date != null &&
        cost != null &&
        !date.isBefore(today) &&
        !date.isAfter(end)) {
      totals.update(
        domain.currency,
        (value) => value + cost,
        ifAbsent: () => cost,
      );
    }
  }
  return totals;
}

class _NextPaymentCard extends StatelessWidget {
  const _NextPaymentCard({required this.domain});
  final DomainRecord? domain;

  @override
  Widget build(BuildContext context) => Card(
    color: Theme.of(context).colorScheme.primaryContainer,
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'NEXT PAYMENT',
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(letterSpacing: 1.2),
          ),
          const SizedBox(height: 10),
          if (domain == null)
            const Text(
              'No upcoming priced renewal',
              style: TextStyle(fontWeight: FontWeight.w600),
            )
          else ...[
            Text(
              domain!.name,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 4),
            Text(
              '${formatMoney(domain!.renewalCostMinor, domain!.currency)}  •  ${formatDate(domain!.effectiveBillingDate)}',
            ),
          ],
        ],
      ),
    ),
  );
}

class _TotalsCard extends StatelessWidget {
  const _TotalsCard({required this.totals});
  final Map<CurrencyCode, int> totals;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'EXPECTED RENEWALS',
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(letterSpacing: 1.2),
          ),
          const SizedBox(height: 4),
          Text(
            'Next 12 months',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 10),
          if (totals.isEmpty)
            const Text('No priced renewals in range')
          else
            ...totals.entries.map(
              (entry) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(entry.key.code),
                    Text(
                      formatMoney(entry.value, entry.key),
                      style: Theme.of(context).textTheme.titleLarge,
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
