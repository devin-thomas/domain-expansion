import 'package:domain_expansion/app/edge_swipe_back.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('edge swipe invokes back and dismisses the focused field', (
    tester,
  ) async {
    var backCount = 0;
    final focusNode = FocusNode();
    addTearDown(focusNode.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: EdgeSwipeBack(
          onBack: () => backCount++,
          child: Scaffold(body: TextField(focusNode: focusNode)),
        ),
      ),
    );

    await tester.tap(find.byType(TextField));
    await tester.pump();
    expect(focusNode.hasFocus, isTrue);

    final gesture = await tester.startGesture(const Offset(8, 300));
    expect(focusNode.hasFocus, isFalse);
    await gesture.moveBy(const Offset(100, 0));
    await tester.pump();
    await gesture.up();

    expect(backCount, 1);
  });
}
