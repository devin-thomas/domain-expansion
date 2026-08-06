class CanonicalExport {
  const CanonicalExport({
    required this.exportSchemaVersion,
    required this.exportedAt,
    required this.metadata,
    required this.domains,
    required this.reminders,
    required this.suggestions,
  });

  final int exportSchemaVersion;
  final String? exportedAt;
  final Map<String, String> metadata;
  final List<Map<String, dynamic>> domains;
  final List<Map<String, dynamic>> reminders;
  final List<Map<String, dynamic>> suggestions;

  factory CanonicalExport.fromJson(Map<String, dynamic> json) {
    final version = json['export_schema_version'];
    if (version is! num || version.toInt() != 1) {
      throw const FormatException('Unsupported export schema version.');
    }
    List<Map<String, dynamic>> list(String key) {
      final value = json[key];
      if (value is! List) {
        throw FormatException('Export field "$key" must be a list.');
      }
      return [
        for (final item in value)
          if (item is Map)
            Map<String, dynamic>.from(item)
          else
            throw FormatException(
              'Export field "$key" contains an invalid record.',
            ),
      ];
    }

    final rawMetadata = json['metadata'];
    if (rawMetadata is! Map) {
      throw const FormatException('Export metadata is missing.');
    }
    return CanonicalExport(
      exportSchemaVersion: version.toInt(),
      exportedAt: json['exported_at']?.toString(),
      metadata: {
        for (final entry in rawMetadata.entries)
          entry.key.toString(): entry.value.toString(),
      },
      domains: list('domains'),
      reminders: list('reminders'),
      suggestions: list('suggestions'),
    );
  }

  Map<String, dynamic> toJson() => {
    'export_schema_version': exportSchemaVersion,
    if (exportedAt != null) 'exported_at': exportedAt,
    'metadata': metadata,
    'domains': domains,
    'reminders': reminders,
    'suggestions': suggestions,
  };
}
