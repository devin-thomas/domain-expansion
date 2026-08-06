import 'package:flutter/material.dart';

class EdgeSwipeBack extends StatefulWidget {
  const EdgeSwipeBack({super.key, required this.onBack, required this.child});

  final VoidCallback onBack;
  final Widget child;

  @override
  State<EdgeSwipeBack> createState() => _EdgeSwipeBackState();
}

class _EdgeSwipeBackState extends State<EdgeSwipeBack> {
  static const _edgeWidth = 32.0;
  static const _triggerDistance = 84.0;
  static const _verticalTolerance = 56.0;

  Offset? _startPosition;

  void _onPointerDown(PointerDownEvent event) {
    if (event.position.dx > _edgeWidth) return;
    _startPosition = event.position;
    // Dismiss the field immediately so the keyboard cannot consume the back
    // gesture or remain visible after the route is popped.
    FocusManager.instance.primaryFocus?.unfocus();
  }

  void _onPointerMove(PointerMoveEvent event) {
    final start = _startPosition;
    if (start == null) return;
    final delta = event.position - start;
    if (delta.dx < _triggerDistance || delta.dy.abs() > _verticalTolerance) {
      return;
    }
    _startPosition = null;
    widget.onBack();
  }

  void _clearPointer() => _startPosition = null;

  @override
  Widget build(BuildContext context) => Listener(
    onPointerDown: _onPointerDown,
    onPointerMove: _onPointerMove,
    onPointerUp: (_) => _clearPointer(),
    onPointerCancel: (_) => _clearPointer(),
    child: widget.child,
  );
}
