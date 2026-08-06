import 'package:domain_expansion/core/formatting/formatters.dart';
import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:domain_expansion/core/providers/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class DomainListScreen extends ConsumerWidget {
  const DomainListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final domains = ref.watch(filteredDomainsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Domains'),
        actions: [
          IconButton(
            onPressed: () => _showFilters(context, ref),
            icon: const Icon(Icons.tune),
            tooltip: 'Filter and sort',
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: 'Search domains, registrars, or DNS',
                suffixIcon: ref.watch(searchQueryProvider).isEmpty
                    ? null
                    : IconButton(
                        onPressed: () =>
                            ref.read(searchQueryProvider.notifier).state = '',
                        icon: const Icon(Icons.clear),
                      ),
              ),
              onChanged: (value) =>
                  ref.read(searchQueryProvider.notifier).state = value,
            ),
          ),
          if (_filterCount(ref) > 0)
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 5,
                ),
                child: Text(
                  '${_filterCount(ref)} filters active',
                  style: Theme.of(context).textTheme.labelMedium,
                ),
              ),
            ),
          Expanded(
            child: domains.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => _ErrorState(
                message: 'Could not load domains: $error',
                onRetry: () => ref.invalidate(domainsProvider),
              ),
              data: (items) => items.isEmpty
                  ? _EmptyState(
                      hasFilters: _filterCount(ref) > 0,
                      onAdd: () => context.go('/domains/new'),
                      onClear: () => resetDomainFilters(ref),
                    )
                  : RefreshIndicator(
                      onRefresh: () => ref.refresh(domainsProvider.future),
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
                        itemCount: items.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 6),
                        itemBuilder: (context, index) =>
                            _DomainTile(domain: items[index]),
                      ),
                    ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.go('/domains/new'),
        icon: const Icon(Icons.add),
        label: const Text('Add domain'),
      ),
      bottomNavigationBar: _DomainNavigation(selectedIndex: 1),
    );
  }

  int _filterCount(WidgetRef ref) {
    return [
      ref.watch(includeArchivedProvider),
      ref.watch(ownershipFilterProvider) != null,
      ref.watch(lifecycleFilterProvider) != null,
      ref.watch(renewalFilterProvider) != null,
      ref.watch(registrarFilterProvider) != null,
      ref.watch(dnsProviderFilterProvider) != null,
      ref.watch(currencyFilterProvider) != null,
      ref.watch(hasRenewalCostFilterProvider) != null,
      ref.watch(hasRegistrationCostFilterProvider) != null,
      ref.watch(billingWindowProvider) != null,
      ref.watch(expirationWindowProvider) != null,
      ref.watch(searchQueryProvider).trim().isNotEmpty,
    ].where((value) => value).length;
  }

  Future<void> _showFilters(BuildContext context, WidgetRef ref) async {
    final database = ref.read(databaseProvider);
    final registrarSuggestions = await database.getSuggestions('registrar');
    final dnsSuggestions = await database.getSuggestions('dns_provider');
    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: ListView(
            shrinkWrap: true,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Filter and sort',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  TextButton(
                    onPressed: () {
                      resetDomainFilters(ref);
                      Navigator.pop(context);
                    },
                    child: const Text('Reset'),
                  ),
                ],
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Show archived'),
                value: ref.watch(includeArchivedProvider),
                onChanged: (value) =>
                    ref.read(includeArchivedProvider.notifier).state = value,
              ),
              _dropdown<OwnershipType?>(
                label: 'Ownership',
                value: ref.watch(ownershipFilterProvider),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Any')),
                  ...OwnershipType.values.map(
                    (v) =>
                        DropdownMenuItem(value: v, child: Text(_label(v.name))),
                  ),
                ],
                onChanged: (value) =>
                    ref.read(ownershipFilterProvider.notifier).state = value,
              ),
              _dropdown<LifecycleState?>(
                label: 'Lifecycle',
                value: ref.watch(lifecycleFilterProvider),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Any')),
                  ...LifecycleState.values.map(
                    (v) =>
                        DropdownMenuItem(value: v, child: Text(_label(v.name))),
                  ),
                ],
                onChanged: (value) =>
                    ref.read(lifecycleFilterProvider.notifier).state = value,
              ),
              _dropdown<RenewalIntent?>(
                label: 'Renewal intent',
                value: ref.watch(renewalFilterProvider),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Any')),
                  ...RenewalIntent.values.map(
                    (v) => DropdownMenuItem(
                      value: v,
                      child: Text(
                        v == RenewalIntent.renew ? 'Renew' : 'Let expire',
                      ),
                    ),
                  ),
                ],
                onChanged: (value) =>
                    ref.read(renewalFilterProvider.notifier).state = value,
              ),
              _dropdown<String?>(
                label: 'Registrar',
                value: ref.watch(registrarFilterProvider),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Any')),
                  ...registrarSuggestions.map(
                    (v) => DropdownMenuItem(value: v, child: Text(v)),
                  ),
                ],
                onChanged: (value) =>
                    ref.read(registrarFilterProvider.notifier).state = value,
              ),
              _dropdown<String?>(
                label: 'DNS provider',
                value: ref.watch(dnsProviderFilterProvider),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Any')),
                  ...dnsSuggestions.map(
                    (v) => DropdownMenuItem(value: v, child: Text(v)),
                  ),
                ],
                onChanged: (value) =>
                    ref.read(dnsProviderFilterProvider.notifier).state = value,
              ),
              _dropdown<CurrencyCode?>(
                label: 'Currency',
                value: ref.watch(currencyFilterProvider),
                items: [
                  const DropdownMenuItem(value: null, child: Text('Any')),
                  ...CurrencyCode.values.map(
                    (v) => DropdownMenuItem(value: v, child: Text(v.code)),
                  ),
                ],
                onChanged: (value) =>
                    ref.read(currencyFilterProvider.notifier).state = value,
              ),
              _dropdown<bool?>(
                label: 'Renewal cost',
                value: ref.watch(hasRenewalCostFilterProvider),
                items: const [
                  DropdownMenuItem(value: null, child: Text('Any')),
                  DropdownMenuItem(value: true, child: Text('Present')),
                  DropdownMenuItem(value: false, child: Text('Missing')),
                ],
                onChanged: (value) =>
                    ref.read(hasRenewalCostFilterProvider.notifier).state =
                        value,
              ),
              _dropdown<bool?>(
                label: 'Registration cost',
                value: ref.watch(hasRegistrationCostFilterProvider),
                items: const [
                  DropdownMenuItem(value: null, child: Text('Any')),
                  DropdownMenuItem(value: true, child: Text('Present')),
                  DropdownMenuItem(value: false, child: Text('Missing')),
                ],
                onChanged: (value) =>
                    ref.read(hasRegistrationCostFilterProvider.notifier).state =
                        value,
              ),
              _dropdown<int?>(
                label: 'Billing window',
                value: ref.watch(billingWindowProvider),
                items: const [
                  DropdownMenuItem(value: null, child: Text('Any date')),
                  DropdownMenuItem(value: 30, child: Text('Next 30 days')),
                  DropdownMenuItem(value: 90, child: Text('Next 90 days')),
                  DropdownMenuItem(value: 365, child: Text('Next 12 months')),
                ],
                onChanged: (value) =>
                    ref.read(billingWindowProvider.notifier).state = value,
              ),
              _dropdown<int?>(
                label: 'Expiration window',
                value: ref.watch(expirationWindowProvider),
                items: const [
                  DropdownMenuItem(value: null, child: Text('Any date')),
                  DropdownMenuItem(value: 30, child: Text('Next 30 days')),
                  DropdownMenuItem(value: 90, child: Text('Next 90 days')),
                  DropdownMenuItem(value: 365, child: Text('Next 12 months')),
                ],
                onChanged: (value) =>
                    ref.read(expirationWindowProvider.notifier).state = value,
              ),
              _dropdown<DomainSort>(
                label: 'Sort',
                value: ref.watch(domainSortProvider),
                items: DomainSort.values
                    .map(
                      (v) => DropdownMenuItem(
                        value: v,
                        child: Text(_sortLabel(v)),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) {
                    ref.read(domainSortProvider.notifier).state = value;
                  }
                },
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Done'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _dropdown<T>({
    required String label,
    required T value,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
  }) => Padding(
    padding: const EdgeInsets.only(top: 10),
    child: DropdownButtonFormField<T>(
      initialValue: value,
      decoration: InputDecoration(labelText: label),
      items: items,
      onChanged: onChanged,
    ),
  );

  String _label(String value) => value
      .replaceAllMapped(
        RegExp(r'([a-z])([A-Z])'),
        (match) => '${match.group(1)} ${match.group(2)}',
      )
      .split(' ')
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
  String _sortLabel(DomainSort value) => _label(value.name);
}

class _DomainTile extends StatelessWidget {
  const _DomainTile({required this.domain});
  final DomainRecord domain;

  @override
  Widget build(BuildContext context) {
    final date = domain.renewalIntent == RenewalIntent.renew
        ? domain.effectiveBillingDate
        : domain.effectiveExpirationDate;
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        title: Text(
          domain.name,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          '${domain.registrar ?? 'No registrar'}  •  ${formatDate(date)}\n${_label(domain.ownershipType.name)}  •  ${_label(domain.lifecycleState.name)}  •  ${domain.renewalIntent == RenewalIntent.renew ? 'Renews' : 'Let expire'}',
        ),
        isThreeLine: true,
        trailing: Text(
          formatMoney(domain.renewalCostMinor, domain.currency),
          style: Theme.of(context).textTheme.titleSmall,
        ),
        onTap: () => context.go('/domains/${domain.id}'),
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
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.hasFilters,
    required this.onAdd,
    required this.onClear,
  });
  final bool hasFilters;
  final VoidCallback onAdd;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            hasFilters ? Icons.search_off : Icons.language,
            size: 48,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(height: 12),
          Text(
            hasFilters
                ? 'No domains match these filters.'
                : 'Your domain list is empty.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          if (hasFilters)
            OutlinedButton(
              onPressed: onClear,
              child: const Text('Clear filters'),
            )
          else
            FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add),
              label: const Text('Add your first domain'),
            ),
        ],
      ),
    ),
  );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    ),
  );
}

class _DomainNavigation extends StatelessWidget {
  const _DomainNavigation({required this.selectedIndex});
  final int selectedIndex;

  @override
  Widget build(BuildContext context) => NavigationBar(
    selectedIndex: selectedIndex,
    onDestinationSelected: (index) {
      if (index == 0) context.go('/');
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
  );
}
