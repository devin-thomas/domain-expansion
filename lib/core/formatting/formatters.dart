import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:intl/intl.dart';

String formatDate(DateTime? date) =>
    date == null ? '—' : DateFormat.yMMMd().format(date);

String formatMoney(int? minor, CurrencyCode currency) {
  if (minor == null) return '—';
  final divisor = currency == CurrencyCode.jpy ? 1 : 100;
  final amount = minor / divisor;
  return NumberFormat.currency(
    name: currency.code,
    symbol: currency.symbol,
    decimalDigits: currency == CurrencyCode.jpy ? 0 : 2,
  ).format(amount);
}

int? parseMoneyToMinor(String input, CurrencyCode currency) {
  final normalized = input.trim().replaceAll(',', '');
  if (normalized.isEmpty) return null;
  final value = double.tryParse(normalized);
  if (value == null || value < 0) return null;
  final multiplier = currency == CurrencyCode.jpy ? 1 : 100;
  return (value * multiplier).round();
}
