import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

class AppDatabase {
  Database? _database;
  String? _databasePath;

  String get databasePath {
    final value = _databasePath;
    if (value == null) throw StateError('Database is not open');
    return value;
  }

  Future<void> open() async {
    if (_database != null) return;
    final directory = await getApplicationDocumentsDirectory();
    _databasePath = p.join(directory.path, 'domain_expansion.sqlite');
    _database = await openDatabase(
      databasePath,
      version: 2,
      onConfigure: (db) => db.execute('PRAGMA foreign_keys = ON'),
      onCreate: (db, _) => _createSchema(db),
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute('''
            CREATE TABLE IF NOT EXISTS app_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            )
          ''');
          await db.insert('app_metadata', {
            'key': 'schema_version',
            'value': '2',
          }, conflictAlgorithm: ConflictAlgorithm.replace);
        }
      },
    );
  }

  Future<void> _createSchema(DatabaseExecutor db) async {
    await db.execute('''
      CREATE TABLE domains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL UNIQUE,
        ownership_type TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        renewal_intent TEXT NOT NULL,
        registrar TEXT,
        dns_provider TEXT,
        registration_date TEXT,
        billing_date TEXT,
        expiration_date TEXT,
        registration_cost_minor INTEGER,
        renewal_cost_minor INTEGER,
        currency_code TEXT NOT NULL DEFAULT 'USD',
        notes TEXT,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (billing_date IS NOT NULL OR expiration_date IS NOT NULL),
        CHECK (registration_cost_minor IS NULL OR registration_cost_minor >= 0),
        CHECK (renewal_cost_minor IS NULL OR renewal_cost_minor >= 0),
        CHECK (ownership_type IN ('owned', 'managed')),
        CHECK (lifecycle_state IN ('active', 'inactive', 'transferred')),
        CHECK (renewal_intent IN ('renew', 'letExpire'))
      )
    ''');
    await db.execute('''
      CREATE TABLE reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain_id INTEGER NOT NULL,
        days_before INTEGER NOT NULL CHECK (days_before >= 0),
        target_type TEXT NOT NULL DEFAULT 'default',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(domain_id, days_before, target_type),
        FOREIGN KEY(domain_id) REFERENCES domains(id) ON DELETE CASCADE
      )
    ''');
    await db.execute('''
      CREATE TABLE suggestions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suggestion_type TEXT NOT NULL,
        value TEXT NOT NULL,
        normalized_value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT NOT NULL,
        UNIQUE(suggestion_type, normalized_value)
      )
    ''');
    await db.execute('''
      CREATE TABLE app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    ''');
    final now = DateTime.now().toIso8601String();
    for (final type in ['registrar', 'dns_provider']) {
      for (final value in ['Cloudflare', 'Namecheap', 'Porkbun', 'Name.com']) {
        await db.insert('suggestions', {
          'suggestion_type': type,
          'value': value,
          'normalized_value': value.toLowerCase(),
          'created_at': now,
          'last_used_at': now,
        });
      }
    }
    await db.insert('app_metadata', {'key': 'schema_version', 'value': '2'});
    await db.insert('app_metadata', {
      'key': 'export_schema_version',
      'value': '1',
    });
    await db.insert('app_metadata', {
      'key': 'default_currency',
      'value': 'USD',
    });
    await db.insert('app_metadata', {
      'key': 'default_reminder_offsets',
      'value': '30,14,7,1',
    });
    await db.insert('app_metadata', {
      'key': 'default_notification_hour',
      'value': '9',
    });
    await db.insert('app_metadata', {
      'key': 'onboarding_completed',
      'value': '0',
    });
  }

  Database get db {
    final value = _database;
    if (value == null) throw StateError('Database is not open');
    return value;
  }

  Future<List<DomainRecord>> getDomains({bool includeArchived = false}) async {
    final rows = await db.query(
      'domains',
      where: includeArchived ? null : 'is_archived = 0',
      orderBy: 'normalized_name ASC',
    );
    return rows.map(_domainFromMap).toList();
  }

  Future<DomainRecord?> getDomain(int id) async {
    final rows = await db.query(
      'domains',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    return rows.isEmpty ? null : _domainFromMap(rows.first);
  }

  Future<int> saveDomain(DomainRecord domain) async {
    final validation = domain.validate();
    if (validation.isNotEmpty) {
      throw DomainValidationException(validation.join(' '));
    }
    return db.transaction((txn) async {
      final values = _domainToMap(domain)..remove('id');
      final int id;
      if (domain.id == null) {
        id = await txn.insert('domains', values);
        await _createDefaultReminders(txn, id, domain.createdAt);
      } else {
        id = domain.id!;
        final updated = await txn.update(
          'domains',
          values,
          where: 'id = ?',
          whereArgs: [id],
        );
        if (updated == 0) {
          throw StateError('Domain ${domain.id} no longer exists.');
        }
      }
      await _saveSuggestion(txn, 'registrar', domain.registrar);
      await _saveSuggestion(txn, 'dns_provider', domain.dnsProvider);
      return id;
    });
  }

  Future<void> _createDefaultReminders(
    DatabaseExecutor txn,
    int domainId,
    DateTime createdAt,
  ) async {
    final offsets = await getDefaultReminderOffsets(executor: txn);
    final now = createdAt.toIso8601String();
    for (final offset in offsets) {
      await txn.insert('reminders', {
        'domain_id': domainId,
        'days_before': offset,
        'target_type': 'default',
        'is_enabled': 1,
        'created_at': now,
        'updated_at': now,
      });
    }
  }

  Future<List<ReminderRecord>> getReminders(int domainId) async {
    final rows = await db.query(
      'reminders',
      where: 'domain_id = ?',
      whereArgs: [domainId],
      orderBy: 'days_before DESC',
    );
    return rows.map(_reminderFromMap).toList();
  }

  Future<Map<int, List<ReminderRecord>>> getRemindersByDomain() async {
    final rows = await db.query(
      'reminders',
      orderBy: 'domain_id ASC, days_before DESC',
    );
    final grouped = <int, List<ReminderRecord>>{};
    for (final row in rows) {
      final reminder = _reminderFromMap(row);
      grouped.putIfAbsent(reminder.domainId, () => []).add(reminder);
    }
    return grouped;
  }

  Future<void> saveReminder(ReminderRecord reminder) async {
    final now = DateTime.now().toIso8601String();
    await db.insert('reminders', {
      'id': reminder.id,
      'domain_id': reminder.domainId,
      'days_before': reminder.daysBefore,
      'target_type': reminder.targetType,
      'is_enabled': reminder.isEnabled ? 1 : 0,
      'created_at': reminder.createdAt.toIso8601String(),
      'updated_at': now,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> setReminderEnabled(int id, bool enabled) async {
    await db.update(
      'reminders',
      {
        'is_enabled': enabled ? 1 : 0,
        'updated_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> deleteReminder(int id) =>
      db.delete('reminders', where: 'id = ?', whereArgs: [id]);

  Future<void> _saveSuggestion(
    DatabaseExecutor txn,
    String type,
    String? value,
  ) async {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) return;
    final now = DateTime.now().toIso8601String();
    await txn.insert('suggestions', {
      'suggestion_type': type,
      'value': trimmed,
      'normalized_value': trimmed.toLowerCase(),
      'created_at': now,
      'last_used_at': now,
    }, conflictAlgorithm: ConflictAlgorithm.ignore);
    await txn.update(
      'suggestions',
      {'value': trimmed, 'last_used_at': now},
      where: 'suggestion_type = ? AND normalized_value = ?',
      whereArgs: [type, trimmed.toLowerCase()],
    );
  }

  Future<List<String>> getSuggestions(String type) async {
    final rows = await db.query(
      'suggestions',
      columns: ['value'],
      where: 'suggestion_type = ?',
      whereArgs: [type],
      orderBy: 'last_used_at DESC, value ASC',
    );
    return rows.map((row) => row['value']! as String).toList();
  }

  Future<void> deleteDomain(int id) =>
      db.delete('domains', where: 'id = ?', whereArgs: [id]);

  Future<void> setArchived(int id, bool archived) => db.update(
    'domains',
    {
      'is_archived': archived ? 1 : 0,
      'updated_at': DateTime.now().toIso8601String(),
    },
    where: 'id = ?',
    whereArgs: [id],
  );

  Future<int> duplicateDomain(DomainRecord domain) async {
    final now = DateTime.now();
    final copy = DomainRecord(
      name: '${domain.name} copy',
      ownershipType: domain.ownershipType,
      lifecycleState: domain.lifecycleState,
      renewalIntent: domain.renewalIntent,
      registrar: domain.registrar,
      dnsProvider: domain.dnsProvider,
      registrationDate: domain.registrationDate,
      billingDate: domain.billingDate,
      expirationDate: domain.expirationDate,
      registrationCostMinor: domain.registrationCostMinor,
      renewalCostMinor: domain.renewalCostMinor,
      currency: domain.currency,
      notes: domain.notes,
      createdAt: now,
      updatedAt: now,
    );
    return saveDomain(copy);
  }

  Future<Map<String, String>> getMetadata() async {
    final rows = await db.query('app_metadata');
    return {
      for (final row in rows) row['key']! as String: row['value']! as String,
    };
  }

  Future<String?> getMetadataValue(
    String key, {
    DatabaseExecutor? executor,
  }) async {
    final rows = await (executor ?? db).query(
      'app_metadata',
      columns: ['value'],
      where: 'key = ?',
      whereArgs: [key],
      limit: 1,
    );
    return rows.isEmpty ? null : rows.first['value']! as String;
  }

  Future<void> setMetadataValue(String key, String value) async {
    await db.insert('app_metadata', {
      'key': key,
      'value': value,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<List<int>> getDefaultReminderOffsets({
    DatabaseExecutor? executor,
  }) async {
    final raw =
        await getMetadataValue(
          'default_reminder_offsets',
          executor: executor,
        ) ??
        '30,14,7,1';
    final offsets =
        raw
            .split(',')
            .map(int.tryParse)
            .whereType<int>()
            .where((value) => value >= 0 && value <= maxReminderDaysBefore)
            .toSet()
            .toList()
          ..sort((a, b) => b.compareTo(a));
    return offsets.take(maxReminderOffsets).toList();
  }

  Future<Map<String, Object>> exportSnapshot() async {
    final domains = await db.query('domains', orderBy: 'id ASC');
    final reminders = await db.query('reminders', orderBy: 'id ASC');
    final suggestions = await db.query('suggestions', orderBy: 'id ASC');
    final metadata = await getMetadata();
    return {
      'export_schema_version': 1,
      'exported_at': DateTime.now().toIso8601String(),
      'metadata': metadata,
      'domains': domains
          .map(
            (row) => {
              ...Map<String, Object?>.from(row),
              'export_id': 'domain-${row['id']}',
            },
          )
          .toList(),
      'reminders': reminders
          .map(
            (row) => {
              ...Map<String, Object?>.from(row),
              'domain_export_id': 'domain-${row['domain_id']}',
            },
          )
          .toList(),
      'suggestions': suggestions
          .map((row) => Map<String, Object?>.from(row))
          .toList(),
    };
  }

  Future<ImportSummary> importSnapshot(
    Map<String, dynamic> snapshot,
    ImportConflictPolicy policy,
  ) async {
    final version = snapshot['export_schema_version'];
    if (version is! num || version.toInt() != 1) {
      throw const FormatException('Unsupported export schema version.');
    }
    final rawDomains = snapshot['domains'];
    if (rawDomains is! List) {
      throw const FormatException(
        'The export does not contain a domains list.',
      );
    }
    final rawReminders = snapshot['reminders'] is List
        ? snapshot['reminders'] as List
        : const <dynamic>[];
    final rawSuggestions = snapshot['suggestions'] is List
        ? snapshot['suggestions'] as List
        : const <dynamic>[];
    final metadata = snapshot['metadata'] is Map
        ? Map<String, dynamic>.from(snapshot['metadata'] as Map)
        : <String, dynamic>{};
    return db.transaction((txn) async {
      final importedIds = <String, int>{};
      final skippedExportIds = <String>{};
      final existingRows = await txn.query('domains');
      final existingByName = <String, Map<String, Object?>>{
        for (final row in existingRows)
          row['normalized_name']! as String: Map<String, Object?>.from(row),
      };
      final importedReminderCounts = <int, int>{};
      var created = 0;
      var updated = 0;
      var skipped = 0;
      for (final item in rawDomains) {
        if (item is! Map) {
          throw const FormatException('A domain record is not an object.');
        }
        final domain = _domainFromImportMap(Map<String, dynamic>.from(item));
        final errors = domain.validate();
        if (errors.isNotEmpty) throw FormatException(errors.join(' '));
        final exportId =
            (item['export_id'] ?? item['id'] ?? domain.normalizedName)
                .toString();
        final existing = existingByName[domain.normalizedName];
        if (existing != null && policy == ImportConflictPolicy.skip) {
          importedIds[exportId] = existing['id']! as int;
          skippedExportIds.add(exportId);
          skipped++;
          continue;
        }
        if (existing != null && policy == ImportConflictPolicy.merge) {
          final merged = _mergeDomain(_domainFromMap(existing), domain);
          await txn.update(
            'domains',
            _domainToMap(merged)..remove('id'),
            where: 'id = ?',
            whereArgs: [merged.id],
          );
          importedIds[exportId] = merged.id!;
          existingByName[domain.normalizedName] = _domainToMap(merged);
          updated++;
          continue;
        }
        if (existing != null) {
          await txn.delete(
            'domains',
            where: 'id = ?',
            whereArgs: [existing['id']],
          );
          await txn.delete(
            'reminders',
            where: 'domain_id = ?',
            whereArgs: [existing['id']],
          );
        }
        final id = await txn.insert(
          'domains',
          _domainToMap(domain)..remove('id'),
        );
        importedIds[exportId] = id;
        final importedMap = _domainToMap(domain)..['id'] = id;
        existingByName[domain.normalizedName] = importedMap;
        if (existing == null) {
          created++;
        } else {
          updated++;
        }
      }
      for (final item in rawReminders) {
        if (item is! Map) {
          throw const FormatException('A reminder record is not an object.');
        }
        final reminder = Map<String, dynamic>.from(item);
        final exportDomainId =
            (reminder['domain_export_id'] ?? reminder['domain_id'] ?? '')
                .toString();
        final domainId = importedIds[exportDomainId];
        if (domainId == null || skippedExportIds.contains(exportDomainId)) {
          continue;
        }
        final reminderCount = (importedReminderCounts[domainId] ?? 0) + 1;
        if (reminderCount > maxReminderOffsets) {
          throw const FormatException(
            'A domain cannot contain more than 12 reminders.',
          );
        }
        final daysBefore = _asInt(reminder['days_before']);
        if (daysBefore == null ||
            daysBefore < 0 ||
            daysBefore > maxReminderDaysBefore) {
          throw const FormatException(
            'Reminder offsets must be between 0 and 3660 days.',
          );
        }
        importedReminderCounts[domainId] = reminderCount;
        await txn.insert('reminders', {
          'domain_id': domainId,
          'days_before': daysBefore,
          'target_type': reminder['target_type']?.toString() ?? 'default',
          'is_enabled': _asBool(reminder['is_enabled']) ? 1 : 0,
          'created_at':
              reminder['created_at']?.toString() ??
              DateTime.now().toIso8601String(),
          'updated_at':
              reminder['updated_at']?.toString() ??
              DateTime.now().toIso8601String(),
        }, conflictAlgorithm: ConflictAlgorithm.replace);
      }
      for (final item in rawSuggestions) {
        if (item is! Map) continue;
        final suggestion = Map<String, dynamic>.from(item);
        final value = suggestion['value']?.toString().trim();
        final type = suggestion['suggestion_type']?.toString().trim();
        if (value == null || value.isEmpty || type == null || type.isEmpty) {
          continue;
        }
        await txn.insert('suggestions', {
          'suggestion_type': type,
          'value': value,
          'normalized_value': (suggestion['normalized_value'] ?? value)
              .toString()
              .toLowerCase(),
          'created_at':
              suggestion['created_at']?.toString() ??
              DateTime.now().toIso8601String(),
          'last_used_at':
              suggestion['last_used_at']?.toString() ??
              DateTime.now().toIso8601String(),
        }, conflictAlgorithm: ConflictAlgorithm.ignore);
      }
      for (final entry in metadata.entries) {
        if (entry.value != null) {
          await txn.insert('app_metadata', {
            'key': entry.key,
            'value': entry.value.toString(),
          }, conflictAlgorithm: ConflictAlgorithm.replace);
        }
      }
      return ImportSummary(
        created: created,
        updated: updated,
        skipped: skipped,
      );
    });
  }

  DomainRecord _domainFromImportMap(Map<String, dynamic> row) => DomainRecord(
    name: row['name']?.toString() ?? '',
    ownershipType: OwnershipType.values.byName(
      row['ownership_type']?.toString() ?? 'owned',
    ),
    lifecycleState: LifecycleState.values.byName(
      row['lifecycle_state']?.toString() ?? 'active',
    ),
    renewalIntent: RenewalIntent.values.byName(
      row['renewal_intent']?.toString() ?? 'renew',
    ),
    registrar: row['registrar']?.toString(),
    dnsProvider: row['dns_provider']?.toString(),
    registrationDate: _textToDate(row['registration_date']?.toString()),
    billingDate: _textToDate(row['billing_date']?.toString()),
    expirationDate: _textToDate(row['expiration_date']?.toString()),
    registrationCostMinor: _asInt(row['registration_cost_minor']),
    renewalCostMinor: _asInt(row['renewal_cost_minor']),
    currency:
        CurrencyCode.tryFromCode(row['currency_code']?.toString() ?? '') ??
        (throw const FormatException('Unsupported currency code.')),
    notes: row['notes']?.toString(),
    isArchived: _asBool(row['is_archived']),
    createdAt:
        DateTime.tryParse(row['created_at']?.toString() ?? '') ??
        DateTime.now(),
    updatedAt:
        DateTime.tryParse(row['updated_at']?.toString() ?? '') ??
        DateTime.now(),
  );

  DomainRecord _mergeDomain(
    DomainRecord existing,
    DomainRecord imported,
  ) => DomainRecord(
    id: existing.id,
    name: imported.name,
    ownershipType: imported.ownershipType,
    lifecycleState: imported.lifecycleState,
    renewalIntent: imported.renewalIntent,
    registrar: imported.registrar ?? existing.registrar,
    dnsProvider: imported.dnsProvider ?? existing.dnsProvider,
    registrationDate: imported.registrationDate ?? existing.registrationDate,
    billingDate: imported.billingDate ?? existing.billingDate,
    expirationDate: imported.expirationDate ?? existing.expirationDate,
    registrationCostMinor:
        imported.registrationCostMinor ?? existing.registrationCostMinor,
    renewalCostMinor: imported.renewalCostMinor ?? existing.renewalCostMinor,
    currency: imported.currency,
    notes: imported.notes ?? existing.notes,
    isArchived: imported.isArchived,
    createdAt: existing.createdAt,
    updatedAt: DateTime.now(),
  );

  Map<String, Object?> _domainToMap(DomainRecord domain) => {
    'id': domain.id,
    'name': domain.name.trim(),
    'normalized_name': domain.normalizedName,
    'ownership_type': domain.ownershipType.name,
    'lifecycle_state': domain.lifecycleState.name,
    'renewal_intent': domain.renewalIntent.name,
    'registrar': _emptyToNull(domain.registrar),
    'dns_provider': _emptyToNull(domain.dnsProvider),
    'registration_date': _dateToText(domain.registrationDate),
    'billing_date': _dateToText(domain.billingDate),
    'expiration_date': _dateToText(domain.expirationDate),
    'registration_cost_minor': domain.registrationCostMinor,
    'renewal_cost_minor': domain.renewalCostMinor,
    'currency_code': domain.currency.code,
    'notes': _emptyToNull(domain.notes),
    'is_archived': domain.isArchived ? 1 : 0,
    'created_at': domain.createdAt.toIso8601String(),
    'updated_at': domain.updatedAt.toIso8601String(),
  };

  DomainRecord _domainFromMap(Map<String, Object?> row) => DomainRecord(
    id: row['id']! as int,
    name: row['name']! as String,
    ownershipType: OwnershipType.values.byName(
      row['ownership_type']! as String,
    ),
    lifecycleState: LifecycleState.values.byName(
      row['lifecycle_state']! as String,
    ),
    renewalIntent: RenewalIntent.values.byName(
      row['renewal_intent']! as String,
    ),
    registrar: row['registrar'] as String?,
    dnsProvider: row['dns_provider'] as String?,
    registrationDate: _textToDate(row['registration_date'] as String?),
    billingDate: _textToDate(row['billing_date'] as String?),
    expirationDate: _textToDate(row['expiration_date'] as String?),
    registrationCostMinor: row['registration_cost_minor'] as int?,
    renewalCostMinor: row['renewal_cost_minor'] as int?,
    currency: CurrencyCode.fromCode(row['currency_code']! as String),
    notes: row['notes'] as String?,
    isArchived: (row['is_archived']! as int) == 1,
    createdAt: DateTime.parse(row['created_at']! as String),
    updatedAt: DateTime.parse(row['updated_at']! as String),
  );

  ReminderRecord _reminderFromMap(Map<String, Object?> row) => ReminderRecord(
    id: row['id']! as int,
    domainId: row['domain_id']! as int,
    daysBefore: row['days_before']! as int,
    targetType: row['target_type']! as String,
    isEnabled: (row['is_enabled']! as int) == 1,
    createdAt: DateTime.parse(row['created_at']! as String),
    updatedAt: DateTime.parse(row['updated_at']! as String),
  );
}

enum ImportConflictPolicy { skip, replace, merge }

class ImportSummary {
  const ImportSummary({
    required this.created,
    required this.updated,
    required this.skipped,
  });
  final int created;
  final int updated;
  final int skipped;
}

int? _asInt(dynamic value) =>
    value is num ? value.toInt() : int.tryParse(value?.toString() ?? '');

bool _asBool(dynamic value) =>
    value == true || value == 1 || value == '1' || value == 'true';

String? _emptyToNull(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

String? _dateToText(DateTime? value) => value == null
    ? null
    : '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

DateTime? _textToDate(String? value) =>
    value == null || value.trim().isEmpty ? null : DateTime.parse(value);
