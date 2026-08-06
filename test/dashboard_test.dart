import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:domain_expansion/features/dashboard/dashboard_screen.dart';
import 'package:flutter_test/flutter_test.dart';

DomainRecord domain({
  required String name,
  DateTime? date,
  int? cost = 1200,
  CurrencyCode currency = CurrencyCode.usd,
  LifecycleState lifecycle = LifecycleState.active,
  RenewalIntent intent = RenewalIntent.renew,
}) => DomainRecord(
  name: name,
  ownershipType: OwnershipType.owned,
  lifecycleState: lifecycle,
  renewalIntent: intent,
  billingDate: date,
  renewalCostMinor: cost,
  currency: currency,
  createdAt: DateTime(2026),
  updatedAt: DateTime(2026),
);

void main() {
  final today = DateTime(2026, 8, 5);

  test('next payment includes today and sorts ties by domain name', () {
    final result = nextPaymentFor([
      domain(name: 'z.example', date: today),
      domain(name: 'a.example', date: today),
      domain(name: 'later.example', date: today.add(const Duration(days: 3))),
    ], now: today);
    expect(result?.name, 'a.example');
  });

  test('next payment excludes missing cost and non-renewing domains', () {
    final result = nextPaymentFor([
      domain(name: 'free.example', date: today, cost: null),
      domain(
        name: 'expire.example',
        date: today,
        intent: RenewalIntent.letExpire,
      ),
      domain(
        name: 'inactive.example',
        date: today,
        lifecycle: LifecycleState.inactive,
      ),
    ], now: today);
    expect(result, isNull);
  });

  test('twelve-month totals remain separated by currency', () {
    final totals = nextTwelveMonthTotals([
      domain(name: 'usd.example', date: DateTime(2027, 8, 5), cost: 1200),
      domain(
        name: 'gbp.example',
        date: DateTime(2027, 8, 5),
        cost: 700,
        currency: CurrencyCode.gbp,
      ),
    ], now: today);
    expect(totals, {CurrencyCode.usd: 1200, CurrencyCode.gbp: 700});
  });

  test('upcoming list excludes active domains without a relevant date', () {
    final result = upcomingDomainsFor([
      domain(name: 'unscheduled.example'),
      domain(
        name: 'past.example',
        date: today.subtract(const Duration(days: 1)),
      ),
      domain(name: 'scheduled.example', date: today),
    ], now: today);
    expect(result.map((item) => item.name), ['scheduled.example']);
  });
}
