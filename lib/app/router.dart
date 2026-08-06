import 'package:domain_expansion/features/dashboard/dashboard_screen.dart';
import 'package:domain_expansion/features/domains/domain_detail_screen.dart';
import 'package:domain_expansion/features/domains/domain_form_screen.dart';
import 'package:domain_expansion/features/domains/domain_list_screen.dart';
import 'package:domain_expansion/features/reports/reports_screen.dart';
import 'package:domain_expansion/features/settings/settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

final appRouter = GoRouter(
  routes: [
    GoRoute(
      path: '/',
      pageBuilder: (_, state) =>
          NoTransitionPage(key: state.pageKey, child: const DashboardScreen()),
    ),
    GoRoute(
      path: '/domains',
      pageBuilder: (_, state) =>
          NoTransitionPage(key: state.pageKey, child: const DomainListScreen()),
    ),
    GoRoute(
      path: '/domains/new',
      pageBuilder: (_, state) =>
          _softTransitionPage(state, const DomainFormScreen()),
    ),
    GoRoute(
      path: '/domains/:id',
      pageBuilder: (_, state) => _softTransitionPage(
        state,
        DomainDetailScreen(domainId: int.parse(state.pathParameters['id']!)),
      ),
    ),
    GoRoute(
      path: '/domains/:id/edit',
      pageBuilder: (_, state) => _softTransitionPage(
        state,
        DomainFormScreen(domainId: int.parse(state.pathParameters['id']!)),
      ),
    ),
    GoRoute(
      path: '/reports',
      pageBuilder: (_, state) =>
          NoTransitionPage(key: state.pageKey, child: const ReportsScreen()),
    ),
    GoRoute(
      path: '/settings',
      pageBuilder: (_, state) =>
          NoTransitionPage(key: state.pageKey, child: const SettingsScreen()),
    ),
  ],
);

CustomTransitionPage<void> _softTransitionPage(
  GoRouterState state,
  Widget child,
) => CustomTransitionPage(
  key: state.pageKey,
  transitionDuration: const Duration(milliseconds: 220),
  reverseTransitionDuration: const Duration(milliseconds: 180),
  child: child,
  transitionsBuilder: (context, animation, secondaryAnimation, child) {
    final scale = Tween<double>(
      begin: 0.985,
      end: 1,
    ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic));
    return FadeTransition(
      opacity: animation,
      child: ScaleTransition(scale: scale, child: child),
    );
  },
);
