enum OwnershipType { owned, managed }

enum LifecycleState { active, inactive, transferred }

enum RenewalIntent { renew, letExpire }

enum CurrencyCode {
  usd('USD', r'$'),
  gbp('GBP', '£'),
  eur('EUR', '€'),
  inr('INR', '₹'),
  cny('CNY', '¥'),
  jpy('JPY', '¥'),
  cad('CAD', r'C$');

  const CurrencyCode(this.code, this.symbol);
  final String code;
  final String symbol;

  static CurrencyCode? tryFromCode(String code) {
    for (final value in values) {
      if (value.code == code.toUpperCase()) return value;
    }
    return null;
  }

  static CurrencyCode fromCode(String code) =>
      tryFromCode(code) ?? CurrencyCode.usd;
}

const maxReminderOffsets = 12;
const maxReminderDaysBefore = 3660;

class DomainValidationException implements Exception {
  const DomainValidationException(this.message);
  final String message;

  @override
  String toString() => message;
}

class DomainRecord {
  const DomainRecord({
    this.id,
    required this.name,
    required this.ownershipType,
    required this.lifecycleState,
    required this.renewalIntent,
    this.registrar,
    this.dnsProvider,
    this.registrationDate,
    this.billingDate,
    this.expirationDate,
    this.registrationCostMinor,
    this.renewalCostMinor,
    this.currency = CurrencyCode.usd,
    this.notes,
    this.isArchived = false,
    required this.createdAt,
    required this.updatedAt,
  });

  final int? id;
  final String name;
  final OwnershipType ownershipType;
  final LifecycleState lifecycleState;
  final RenewalIntent renewalIntent;
  final String? registrar;
  final String? dnsProvider;
  final DateTime? registrationDate;
  final DateTime? billingDate;
  final DateTime? expirationDate;
  final int? registrationCostMinor;
  final int? renewalCostMinor;
  final CurrencyCode currency;
  final String? notes;
  final bool isArchived;
  final DateTime createdAt;
  final DateTime updatedAt;

  String get normalizedName => normalizeDomainName(name);
  DateTime? get effectiveBillingDate => billingDate ?? expirationDate;
  DateTime? get effectiveExpirationDate => expirationDate ?? billingDate;

  List<String> validate() {
    final errors = <String>[];
    if (normalizedName.isEmpty) errors.add('Domain name is required.');
    if (billingDate == null && expirationDate == null) {
      errors.add('A billing or expiration date is required.');
    }
    if (registrationCostMinor != null && registrationCostMinor! < 0) {
      errors.add('Registration cost cannot be negative.');
    }
    if (renewalCostMinor != null && renewalCostMinor! < 0) {
      errors.add('Renewal cost cannot be negative.');
    }
    return errors;
  }

  DomainRecord copyWith({
    int? id,
    String? name,
    OwnershipType? ownershipType,
    LifecycleState? lifecycleState,
    RenewalIntent? renewalIntent,
    String? registrar,
    String? dnsProvider,
    DateTime? registrationDate,
    DateTime? billingDate,
    DateTime? expirationDate,
    int? registrationCostMinor,
    int? renewalCostMinor,
    CurrencyCode? currency,
    String? notes,
    bool? isArchived,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) => DomainRecord(
    id: id ?? this.id,
    name: name ?? this.name,
    ownershipType: ownershipType ?? this.ownershipType,
    lifecycleState: lifecycleState ?? this.lifecycleState,
    renewalIntent: renewalIntent ?? this.renewalIntent,
    registrar: registrar ?? this.registrar,
    dnsProvider: dnsProvider ?? this.dnsProvider,
    registrationDate: registrationDate ?? this.registrationDate,
    billingDate: billingDate ?? this.billingDate,
    expirationDate: expirationDate ?? this.expirationDate,
    registrationCostMinor: registrationCostMinor ?? this.registrationCostMinor,
    renewalCostMinor: renewalCostMinor ?? this.renewalCostMinor,
    currency: currency ?? this.currency,
    notes: notes ?? this.notes,
    isArchived: isArchived ?? this.isArchived,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
}

class ReminderRecord {
  const ReminderRecord({
    this.id,
    required this.domainId,
    required this.daysBefore,
    required this.targetType,
    required this.isEnabled,
    required this.createdAt,
    required this.updatedAt,
  });

  final int? id;
  final int domainId;
  final int daysBefore;
  final String targetType;
  final bool isEnabled;
  final DateTime createdAt;
  final DateTime updatedAt;
}

String normalizeDomainName(String value) {
  var normalized = value.trim().toLowerCase();
  while (normalized.endsWith('.')) {
    normalized = normalized.substring(0, normalized.length - 1);
  }
  return normalized;
}
