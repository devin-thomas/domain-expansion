import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('normalizes case, whitespace, and trailing periods', () {
    expect(normalizeDomainName('  Example.COM. '), 'example.com');
  });

  test('billing and expiration dates fall back to each other', () {
    final date = DateTime(2027, 1, 2);
    final record = DomainRecord(
      name: 'example.com',
      ownershipType: OwnershipType.owned,
      lifecycleState: LifecycleState.active,
      renewalIntent: RenewalIntent.renew,
      expirationDate: date,
      createdAt: DateTime(2026),
      updatedAt: DateTime(2026),
    );
    expect(record.effectiveBillingDate, date);
    expect(record.effectiveExpirationDate, date);
  });
}
