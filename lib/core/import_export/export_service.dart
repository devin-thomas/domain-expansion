import 'dart:convert';
import 'dart:io';

import 'package:domain_expansion/core/database/app_database.dart';
import 'package:domain_expansion/core/import_export/canonical_export.dart';
import 'package:excel/excel.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:sqflite/sqflite.dart';
import 'package:yaml/yaml.dart';

enum ExportFormat { json, yaml, sqlite, xlsx }

class ImportDocument {
  const ImportDocument({required this.name, required this.snapshot});
  final String name;
  final Map<String, dynamic> snapshot;
}

class ExportService {
  Future<String> exportAndShare(
    AppDatabase database,
    ExportFormat format,
  ) async {
    final directory = await getTemporaryDirectory();
    final extension = format == ExportFormat.sqlite
        ? 'sqlite'
        : format == ExportFormat.xlsx
        ? 'xlsx'
        : format.name;
    final file = File(
      p.join(directory.path, 'domain-expansion-export.$extension'),
    );
    if (format == ExportFormat.sqlite) {
      await File(database.databasePath).copy(file.path);
    } else if (format == ExportFormat.xlsx) {
      final snapshot = await database.exportSnapshot();
      final workbook = _toWorkbook(
        CanonicalExport.fromJson(Map<String, dynamic>.from(snapshot)).toJson(),
      );
      await file.writeAsBytes(workbook.save()!);
    } else {
      final snapshot = await database.exportSnapshot();
      final canonical = CanonicalExport.fromJson(
        Map<String, dynamic>.from(snapshot),
      );
      // JSON is also a valid YAML 1.2 document, keeping both exports lossless
      // without introducing a serializer that can silently drop null fields.
      final contents = format == ExportFormat.yaml
          ? _yaml(canonical.toJson())
          : const JsonEncoder.withIndent('  ').convert(canonical.toJson());
      await file.writeAsString(contents);
    }
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path)],
        subject: 'Domain Expansion export',
      ),
    );
    return file.path;
  }

  Future<ImportDocument> pickImport() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['json', 'yaml', 'yml', 'sqlite', 'db', 'xlsx'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) {
      throw const FormatException('No import file was selected.');
    }
    final picked = result.files.single;
    final extension = p.extension(picked.name).toLowerCase();
    if (extension == '.sqlite' || extension == '.db') {
      final path = picked.path;
      if (path == null) {
        throw const FormatException(
          'The selected SQLite file is not readable.',
        );
      }
      return ImportDocument(
        name: picked.name,
        snapshot: await _readSqlite(path),
      );
    }
    final bytes =
        picked.bytes ??
        (picked.path == null ? null : await File(picked.path!).readAsBytes());
    if (bytes == null) {
      throw const FormatException('The selected file is not readable.');
    }
    if (extension == '.xlsx') {
      return ImportDocument(name: picked.name, snapshot: _fromWorkbook(bytes));
    }
    final text = utf8.decode(bytes);
    final decoded = extension == '.yaml' || extension == '.yml'
        ? loadYaml(text)
        : jsonDecode(text);
    if (decoded is! Map) {
      throw const FormatException(
        'The import must contain an object at the top level.',
      );
    }
    return ImportDocument(
      name: picked.name,
      snapshot: CanonicalExport.fromJson(
        Map<String, dynamic>.from(_jsonValue(decoded) as Map),
      ).toJson(),
    );
  }

  Excel _toWorkbook(Map<String, dynamic> snapshot) {
    final workbook = Excel.createExcel();
    final defaultSheet = workbook.getDefaultSheet();
    if (defaultSheet != null && defaultSheet != 'Metadata') {
      workbook.rename(defaultSheet, 'Metadata');
    }
    _writeSheet(
      workbook,
      'Metadata',
      const ['key', 'value'],
      (snapshot['metadata'] as Map<String, String>).entries
          .map((entry) => [entry.key, entry.value])
          .toList(),
    );
    final domains = (snapshot['domains'] as List).cast<Map<String, Object?>>();
    _writeSheet(
      workbook,
      'Domains',
      _domainHeaders,
      domains
          .map(
            (row) => _domainHeaders.map((header) => row[header] ?? '').toList(),
          )
          .toList(),
    );
    final reminders = (snapshot['reminders'] as List)
        .cast<Map<String, Object?>>();
    _writeSheet(
      workbook,
      'Reminders',
      _reminderHeaders,
      reminders
          .map(
            (row) =>
                _reminderHeaders.map((header) => row[header] ?? '').toList(),
          )
          .toList(),
    );
    final suggestions = (snapshot['suggestions'] as List)
        .cast<Map<String, Object?>>();
    _writeSheet(
      workbook,
      'Suggestions',
      _suggestionHeaders,
      suggestions
          .map(
            (row) =>
                _suggestionHeaders.map((header) => row[header] ?? '').toList(),
          )
          .toList(),
    );
    return workbook;
  }

  void _writeSheet(
    Excel workbook,
    String name,
    List<String> headers,
    List<List<Object?>> rows,
  ) {
    final sheet = workbook[name];
    sheet.appendRow(headers.map((value) => TextCellValue(value)).toList());
    for (final row in rows) {
      sheet.appendRow(
        row.map((value) => TextCellValue(value.toString())).toList(),
      );
    }
  }

  Map<String, dynamic> _fromWorkbook(List<int> bytes) {
    final workbook = Excel.decodeBytes(bytes);
    final metadata = <String, String>{};
    final metadataSheet = workbook.tables['Metadata'];
    if (metadataSheet != null) {
      for (final row in metadataSheet.rows.skip(1)) {
        if (row.length >= 2) metadata[_cell(row[0])] = _cell(row[1]);
      }
    }
    final domains = _sheetMaps(workbook.tables['Domains'], _domainHeaders);
    final reminders = _sheetMaps(
      workbook.tables['Reminders'],
      _reminderHeaders,
    );
    final suggestions = _sheetMaps(
      workbook.tables['Suggestions'],
      _suggestionHeaders,
    );
    if (domains.isEmpty) {
      throw const FormatException(
        'The workbook does not contain a Domains sheet.',
      );
    }
    return CanonicalExport.fromJson({
      'export_schema_version': 1,
      'metadata': metadata,
      'domains': domains,
      'reminders': reminders,
      'suggestions': suggestions,
    }).toJson();
  }

  List<Map<String, dynamic>> _sheetMaps(Sheet? sheet, List<String> headers) {
    if (sheet == null) return [];
    return [
      for (final row in sheet.rows.skip(1))
        if (row.any((cell) => _cell(cell).isNotEmpty))
          {
            for (var i = 0; i < headers.length; i++)
              headers[i]: i < row.length ? _cell(row[i]) : '',
          },
    ];
  }

  String _cell(Data? cell) {
    final value = cell?.value;
    if (value == null) return '';
    if (value is TextCellValue) return value.value.toString();
    if (value is IntCellValue) return value.value.toString();
    if (value is DoubleCellValue) return value.value.toString();
    if (value is BoolCellValue) return value.value ? '1' : '0';
    if (value is FormulaCellValue) return value.formula;
    if (value is DateCellValue) {
      return '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
    }
    if (value is DateTimeCellValue) {
      return '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
    }
    return value.toString();
  }

  dynamic _jsonValue(dynamic value) {
    if (value is Map) {
      return {
        for (final entry in value.entries)
          entry.key.toString(): _jsonValue(entry.value),
      };
    }
    if (value is List) return value.map(_jsonValue).toList();
    return value;
  }

  String _yaml(dynamic value, [int indent = 0]) {
    final spaces = ' ' * indent;
    if (value is Map) {
      if (value.isEmpty) return '$spaces{}';
      return value.entries
          .map((entry) {
            final key = entry.key.toString();
            final child = entry.value;
            if (child is Map || child is List) {
              return '$spaces$key:\n${_yaml(child, indent + 2)}';
            }
            return '$spaces$key: ${_yamlScalar(child)}';
          })
          .join('\n');
    }
    if (value is List) {
      if (value.isEmpty) return '$spaces[]';
      return value
          .map((item) {
            if (item is Map || item is List) {
              return '$spaces-\n${_yaml(item, indent + 2)}';
            }
            return '$spaces- ${_yamlScalar(item)}';
          })
          .join('\n');
    }
    return '$spaces${_yamlScalar(value)}';
  }

  String _yamlScalar(dynamic value) {
    if (value == null) return 'null';
    if (value is String) return jsonEncode(value);
    if (value is bool || value is num) return value.toString();
    return jsonEncode(value.toString());
  }

  static const _domainHeaders = [
    'export_id',
    'id',
    'name',
    'normalized_name',
    'ownership_type',
    'lifecycle_state',
    'renewal_intent',
    'registrar',
    'dns_provider',
    'registration_date',
    'billing_date',
    'expiration_date',
    'registration_cost_minor',
    'renewal_cost_minor',
    'currency_code',
    'notes',
    'is_archived',
    'created_at',
    'updated_at',
  ];
  static const _reminderHeaders = [
    'id',
    'domain_id',
    'domain_export_id',
    'days_before',
    'target_type',
    'is_enabled',
    'created_at',
    'updated_at',
  ];
  static const _suggestionHeaders = [
    'id',
    'suggestion_type',
    'value',
    'normalized_value',
    'created_at',
    'last_used_at',
  ];

  Future<Map<String, dynamic>> _readSqlite(String path) async {
    final source = await openDatabase(path, readOnly: true);
    try {
      final domains = await source.query('domains', orderBy: 'id ASC');
      final reminders = await source.query('reminders', orderBy: 'id ASC');
      final suggestions = await source.query('suggestions', orderBy: 'id ASC');
      final metadata = await source.query('app_metadata');
      final snapshot = {
        'export_schema_version': 1,
        'metadata': {
          for (final row in metadata)
            row['key']! as String: row['value']! as String,
        },
        'domains': domains
            .map((row) => {...row, 'export_id': 'domain-${row['id']}'})
            .toList(),
        'reminders': reminders
            .map(
              (row) => {
                ...row,
                'domain_export_id': 'domain-${row['domain_id']}',
              },
            )
            .toList(),
        'suggestions': suggestions,
      };
      return CanonicalExport.fromJson(
        Map<String, dynamic>.from(snapshot),
      ).toJson();
    } on DatabaseException catch (error) {
      throw FormatException(
        'The selected SQLite file is not a Domain Expansion backup: $error',
      );
    } finally {
      await source.close();
    }
  }
}
