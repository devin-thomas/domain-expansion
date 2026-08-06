import 'package:domain_expansion/core/import_export/canonical_export.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('canonical export preserves null fields and relationships', () {
    final model = CanonicalExport.fromJson({
      'export_schema_version': 1,
      'metadata': {'default_currency': 'USD'},
      'domains': [
        {'export_id': 'domain-1', 'name': 'example.com', 'billing_date': null},
      ],
      'reminders': [
        {'domain_export_id': 'domain-1', 'days_before': 30},
      ],
      'suggestions': [],
    });
    final restored = model.toJson();
    expect(restored['domains'][0]['billing_date'], isNull);
    expect(restored['reminders'][0]['domain_export_id'], 'domain-1');
  });

  test('unsupported export versions fail before import', () {
    expect(
      () => CanonicalExport.fromJson({
        'export_schema_version': 2,
        'metadata': {},
        'domains': [],
        'reminders': [],
        'suggestions': [],
      }),
      throwsFormatException,
    );
  });
}
