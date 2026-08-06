import 'package:domain_expansion/core/formatting/formatters.dart';
import 'package:domain_expansion/core/models/domain_record.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses decimal currencies into minor units', () {
    expect(parseMoneyToMinor('12.99', CurrencyCode.usd), 1299);
  });

  test('parses JPY without decimal minor units', () {
    expect(parseMoneyToMinor('1500', CurrencyCode.jpy), 1500);
  });

  test('rejects negative money', () {
    expect(parseMoneyToMinor('-1', CurrencyCode.usd), isNull);
  });
}
