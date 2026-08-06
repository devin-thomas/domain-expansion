import 'package:domain_expansion/app/router.dart';
import 'package:domain_expansion/app/theme.dart';
import 'package:flutter/material.dart';

class DomainExpansionApp extends StatelessWidget {
  const DomainExpansionApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Domain Expansion',
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: ThemeMode.system,
      routerConfig: appRouter,
    );
  }
}
