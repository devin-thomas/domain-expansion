import 'package:flutter/material.dart';

ThemeData buildLightTheme() => ThemeData(
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFF0F766E),
    brightness: Brightness.light,
  ),
  useMaterial3: true,
  scaffoldBackgroundColor: const Color(0xFFF7F7F2),
  appBarTheme: const AppBarTheme(
    centerTitle: false,
    backgroundColor: Color(0xFFF7F7F2),
  ),
  cardTheme: const CardThemeData(
    margin: EdgeInsets.symmetric(vertical: 5),
    elevation: 0,
  ),
  inputDecorationTheme: const InputDecorationTheme(
    border: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
    ),
  ),
);

ThemeData buildDarkTheme() => ThemeData(
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFF5EEAD4),
    brightness: Brightness.dark,
  ),
  useMaterial3: true,
  cardTheme: const CardThemeData(elevation: 0),
  inputDecorationTheme: const InputDecorationTheme(
    border: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
    ),
  ),
);
