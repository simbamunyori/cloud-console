// Fourth Generation Technologies theme for the future Flutter app.
import 'package:flutter/material.dart';

class FgtColors {
  static const navy = Color(0xFF0B1F3A);
  static const blue = Color(0xFF2F6BFF);
  static const teal = Color(0xFF00D4C2);
  static const slate = Color(0xFF7A8699);
  static const mist = Color(0xFFF4F7FB);
  static const inkOnDark = Color(0xFFC9D3E3);
  static const textMuted = Color(0xFF5E6B80);
  static const success = Color(0xFF177A4E);
  static const warning = Color(0xFF9A5B00);
  static const danger = Color(0xFFC8373D);
}

ThemeData fgtLightTheme() => ThemeData(
      useMaterial3: true,
      fontFamily: 'Poppins',
      colorScheme: const ColorScheme.light(
        primary: FgtColors.blue,
        onPrimary: Colors.white,
        secondary: FgtColors.teal,
        onSecondary: FgtColors.navy,
        surface: Colors.white,
        onSurface: FgtColors.navy,
        error: FgtColors.danger,
      ),
      scaffoldBackgroundColor: Colors.white,
    );

ThemeData fgtDarkTheme() => ThemeData(
      useMaterial3: true,
      fontFamily: 'Poppins',
      colorScheme: const ColorScheme.dark(
        primary: FgtColors.blue,
        onPrimary: Colors.white,
        secondary: FgtColors.teal,
        onSecondary: FgtColors.navy,
        surface: Color(0xFF13294B),
        onSurface: FgtColors.inkOnDark,
        error: Color(0xFFFF7A7F),
      ),
      scaffoldBackgroundColor: FgtColors.navy,
    );
