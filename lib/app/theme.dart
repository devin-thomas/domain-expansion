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
    surfaceTintColor: Colors.transparent,
    scrolledUnderElevation: 0,
  ),
  cardTheme: const CardThemeData(
    margin: EdgeInsets.symmetric(vertical: 5),
    elevation: 0,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.all(Radius.circular(20)),
    ),
  ),
  inputDecorationTheme: const InputDecorationTheme(
    filled: true,
    fillColor: Color(0xFFFFFFFF),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
      borderSide: BorderSide.none,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
      borderSide: BorderSide.none,
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
      borderSide: BorderSide(width: 2),
    ),
  ),
  navigationBarTheme: NavigationBarThemeData(
    height: 72,
    backgroundColor: Color(0xFFF7F7F2),
    surfaceTintColor: Colors.transparent,
    indicatorColor: Color(0xFFB6E9DF),
  ),
  floatingActionButtonTheme: const FloatingActionButtonThemeData(
    shape: StadiumBorder(),
  ),
  snackBarTheme: const SnackBarThemeData(
    behavior: SnackBarBehavior.floating,
    shape: RoundedRectangleBorder(
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
  scaffoldBackgroundColor: Color(0xFF0B1211),
  appBarTheme: const AppBarTheme(
    backgroundColor: Color(0xFF0B1211),
    surfaceTintColor: Colors.transparent,
    scrolledUnderElevation: 0,
  ),
  cardTheme: const CardThemeData(
    elevation: 0,
    color: Color(0xFF131D1B),
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.all(Radius.circular(20)),
    ),
  ),
  inputDecorationTheme: const InputDecorationTheme(
    filled: true,
    fillColor: Color(0xFF131D1B),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
      borderSide: BorderSide.none,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
      borderSide: BorderSide.none,
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
      borderSide: BorderSide(width: 2),
    ),
  ),
  navigationBarTheme: const NavigationBarThemeData(
    height: 72,
    backgroundColor: Color(0xFF0B1211),
    surfaceTintColor: Colors.transparent,
    indicatorColor: Color(0xFF164E49),
  ),
  floatingActionButtonTheme: const FloatingActionButtonThemeData(
    shape: StadiumBorder(),
  ),
  snackBarTheme: const SnackBarThemeData(
    behavior: SnackBarBehavior.floating,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.all(Radius.circular(14)),
    ),
  ),
);
