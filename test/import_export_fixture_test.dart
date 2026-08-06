import 'dart:convert';
import 'dart:io';

import 'package:domain_expansion/core/import_export/canonical_export.dart';
import 'package:domain_expansion/core/import_export/export_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final service = ExportService();

  test('JSON fixture imports with nulls and relationships intact', () {
    final bytes = File(
      'test/fixtures/domain-expansion-export.json',
    ).readAsBytesSync();

    final document = service.parseImportBytes(
      'domain-expansion-export.json',
      bytes,
    );
    final domain = document.snapshot['domains'][0] as Map<String, dynamic>;

    expect(domain['name'], 'lilgohan.com');
    expect(domain['registration_date'], isNull);
    expect(document.snapshot['reminders'][0]['domain_export_id'], 'domain-1');
  });

  test('YAML fixture imports through the same canonical validation path', () {
    final bytes = File(
      'test/fixtures/domain-expansion-export.yaml',
    ).readAsBytesSync();

    final document = service.parseImportBytes(
      'domain-expansion-export.yaml',
      bytes,
    );

    expect(document.snapshot['metadata']['default_currency'], 'USD');
    expect(document.snapshot['domains'][0]['billing_date'], '2027-06-05');
    expect(document.snapshot['suggestions'], hasLength(1));
  });

  test('JSON and YAML encoders round-trip a canonical fixture', () {
    final source =
        jsonDecode(
              File(
                'test/fixtures/domain-expansion-export.json',
              ).readAsStringSync(),
            )
            as Map<String, dynamic>;
    final canonical = CanonicalExport.fromJson(source);

    for (final format in [ExportFormat.json, ExportFormat.yaml]) {
      final encoded = service.encodeCanonicalText(canonical, format);
      final parsed = service.parseImportBytes(
        format == ExportFormat.json ? 'roundtrip.json' : 'roundtrip.yaml',
        utf8.encode(encoded),
      );
      expect(parsed.snapshot, canonical.toJson());
    }
  });

  test('malformed backup content fails before any import is attempted', () {
    expect(
      () => service.parseImportBytes('broken.json', utf8.encode('{broken')),
      throwsFormatException,
    );
  });
}
