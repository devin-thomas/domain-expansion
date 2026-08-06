import 'package:domain_expansion/core/database/app_database.dart';
import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:domain_expansion/core/notifications/reminder_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';

final databaseProvider = Provider<AppDatabase>(
  (_) => throw UnimplementedError(),
);
final reminderServiceProvider = Provider<ReminderService>(
  (_) => throw UnimplementedError(),
);
final includeArchivedProvider = StateProvider<bool>((_) => false);
final searchQueryProvider = StateProvider<String>((_) => '');
final ownershipFilterProvider = StateProvider<OwnershipType?>((_) => null);
final lifecycleFilterProvider = StateProvider<LifecycleState?>((_) => null);
final renewalFilterProvider = StateProvider<RenewalIntent?>((_) => null);
final registrarFilterProvider = StateProvider<String?>((_) => null);
final dnsProviderFilterProvider = StateProvider<String?>((_) => null);
final currencyFilterProvider = StateProvider<CurrencyCode?>((_) => null);
final hasRenewalCostFilterProvider = StateProvider<bool?>((_) => null);
final hasRegistrationCostFilterProvider = StateProvider<bool?>((_) => null);
final billingWindowProvider = StateProvider<int?>((_) => null);
final expirationWindowProvider = StateProvider<int?>((_) => null);

enum DomainSort {
  name,
  billingDate,
  expirationDate,
  renewalCost,
  registrationCost,
  registrar,
  recentlyCreated,
  recentlyUpdated,
}

final domainSortProvider = StateProvider<DomainSort>((_) => DomainSort.name);

final domainsProvider = FutureProvider<List<DomainRecord>>((ref) async {
  final database = ref.watch(databaseProvider);
  final includeArchived = ref.watch(includeArchivedProvider);
  return database.getDomains(includeArchived: includeArchived);
});

final filteredDomainsProvider = Provider<AsyncValue<List<DomainRecord>>>((ref) {
  final source = ref.watch(domainsProvider);
  final query = ref.watch(searchQueryProvider).trim().toLowerCase();
  final ownership = ref.watch(ownershipFilterProvider);
  final lifecycle = ref.watch(lifecycleFilterProvider);
  final renewal = ref.watch(renewalFilterProvider);
  final registrar = ref.watch(registrarFilterProvider);
  final dnsProvider = ref.watch(dnsProviderFilterProvider);
  final currency = ref.watch(currencyFilterProvider);
  final hasRenewalCost = ref.watch(hasRenewalCostFilterProvider);
  final hasRegistrationCost = ref.watch(hasRegistrationCostFilterProvider);
  final billingWindow = ref.watch(billingWindowProvider);
  final expirationWindow = ref.watch(expirationWindowProvider);
  final sort = ref.watch(domainSortProvider);
  return source.whenData((items) {
    final today = DateTime.now();
    final start = DateTime(today.year, today.month, today.day);
    bool inWindow(DateTime? date, int? days) =>
        days == null ||
        (date != null &&
            !date.isBefore(start) &&
            !date.isAfter(start.add(Duration(days: days))));
    final filtered = items.where((domain) {
      final matchesQuery =
          query.isEmpty ||
          domain.name.toLowerCase().contains(query) ||
          (domain.registrar?.toLowerCase().contains(query) ?? false) ||
          (domain.dnsProvider?.toLowerCase().contains(query) ?? false);
      return matchesQuery &&
          (ownership == null || domain.ownershipType == ownership) &&
          (lifecycle == null || domain.lifecycleState == lifecycle) &&
          (renewal == null || domain.renewalIntent == renewal) &&
          (registrar == null ||
              domain.registrar?.toLowerCase() == registrar.toLowerCase()) &&
          (dnsProvider == null ||
              domain.dnsProvider?.toLowerCase() == dnsProvider.toLowerCase()) &&
          (currency == null || domain.currency == currency) &&
          (hasRenewalCost == null ||
              (domain.renewalCostMinor != null) == hasRenewalCost) &&
          (hasRegistrationCost == null ||
              (domain.registrationCostMinor != null) == hasRegistrationCost) &&
          inWindow(domain.effectiveBillingDate, billingWindow) &&
          inWindow(domain.effectiveExpirationDate, expirationWindow);
    }).toList();
    filtered.sort((a, b) => _compareDomains(a, b, sort));
    return filtered;
  });
});

int _compareDomains(DomainRecord a, DomainRecord b, DomainSort sort) {
  int compareNullable<T extends Comparable<T>>(T? left, T? right) {
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return left.compareTo(right);
  }

  final comparison = switch (sort) {
    DomainSort.name => a.normalizedName.compareTo(b.normalizedName),
    DomainSort.billingDate => compareNullable(
      a.effectiveBillingDate,
      b.effectiveBillingDate,
    ),
    DomainSort.expirationDate => compareNullable(
      a.effectiveExpirationDate,
      b.effectiveExpirationDate,
    ),
    DomainSort.renewalCost => compareNullable(
      a.renewalCostMinor,
      b.renewalCostMinor,
    ),
    DomainSort.registrationCost => compareNullable(
      a.registrationCostMinor,
      b.registrationCostMinor,
    ),
    DomainSort.registrar => compareNullable(
      a.registrar?.toLowerCase(),
      b.registrar?.toLowerCase(),
    ),
    DomainSort.recentlyCreated => b.createdAt.compareTo(a.createdAt),
    DomainSort.recentlyUpdated => b.updatedAt.compareTo(a.updatedAt),
  };
  return comparison != 0
      ? comparison
      : a.normalizedName.compareTo(b.normalizedName);
}

final domainProvider = FutureProvider.family<DomainRecord?, int>((ref, id) {
  return ref.watch(databaseProvider).getDomain(id);
});
final remindersProvider = FutureProvider.family<List<ReminderRecord>, int>((
  ref,
  id,
) {
  return ref.watch(databaseProvider).getReminders(id);
});

void invalidateDomainData(WidgetRef ref, [int? id]) {
  ref.invalidate(domainsProvider);
  if (id != null) ref.invalidate(domainProvider(id));
  if (id != null) ref.invalidate(remindersProvider(id));
}

void resetDomainFilters(WidgetRef ref) {
  ref.read(searchQueryProvider.notifier).state = '';
  ref.read(includeArchivedProvider.notifier).state = false;
  ref.read(ownershipFilterProvider.notifier).state = null;
  ref.read(lifecycleFilterProvider.notifier).state = null;
  ref.read(renewalFilterProvider.notifier).state = null;
  ref.read(registrarFilterProvider.notifier).state = null;
  ref.read(dnsProviderFilterProvider.notifier).state = null;
  ref.read(currencyFilterProvider.notifier).state = null;
  ref.read(hasRenewalCostFilterProvider.notifier).state = null;
  ref.read(hasRegistrationCostFilterProvider.notifier).state = null;
  ref.read(billingWindowProvider.notifier).state = null;
  ref.read(expirationWindowProvider.notifier).state = null;
  ref.read(domainSortProvider.notifier).state = DomainSort.name;
}
