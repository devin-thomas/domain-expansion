import 'package:domain_expansion/features/dashboard/dashboard_screen.dart';
import 'package:domain_expansion/features/domains/domain_detail_screen.dart';
import 'package:domain_expansion/features/domains/domain_form_screen.dart';
import 'package:domain_expansion/features/domains/domain_list_screen.dart';
import 'package:domain_expansion/features/reports/reports_screen.dart';
import 'package:domain_expansion/features/settings/settings_screen.dart';
import 'package:go_router/go_router.dart';

final appRouter = GoRouter(
  routes: [
    GoRoute(path: '/', builder: (_, _) => const DashboardScreen()),
    GoRoute(path: '/domains', builder: (_, _) => const DomainListScreen()),
    GoRoute(path: '/domains/new', builder: (_, _) => const DomainFormScreen()),
    GoRoute(
      path: '/domains/:id',
      builder: (_, state) =>
          DomainDetailScreen(domainId: int.parse(state.pathParameters['id']!)),
    ),
    GoRoute(
      path: '/domains/:id/edit',
      builder: (_, state) =>
          DomainFormScreen(domainId: int.parse(state.pathParameters['id']!)),
    ),
    GoRoute(path: '/reports', builder: (_, _) => const ReportsScreen()),
    GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
  ],
);
