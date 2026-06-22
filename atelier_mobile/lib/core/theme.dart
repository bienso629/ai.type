import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static const Color background = Color(0xFFFCF9F5);
  static const Color surface = Color(0xFFFCF9F5);
  static const Color primary = Color(0xFF000000);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color secondary = Color(0xFF775A19);
  static const Color surfaceVariant = Color(0xFFE5E2DE);
  static const Color onSurfaceVariant = Color(0xFF444748);
  static const Color outlineVariant = Color(0xFFC4C7C7);
  static const Color outline = Color(0xFF747878);

  static ThemeData get lightTheme {
    return ThemeData(
      scaffoldBackgroundColor: background,
      colorScheme: ColorScheme.light(
        primary: primary,
        onPrimary: onPrimary,
        secondary: secondary,
        surface: surface,
        onSurface: primary,
        background: background,
        onBackground: primary,
      ),
      textTheme: TextTheme(
        displayLarge: GoogleFonts.playfairDisplay(
          fontSize: 64,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.02,
          color: primary,
          height: 1.1,
        ),
        headlineLarge: GoogleFonts.playfairDisplay(
          fontSize: 40,
          fontWeight: FontWeight.w500,
          color: primary,
          height: 1.2,
        ),
        headlineMedium: GoogleFonts.playfairDisplay(
          fontSize: 28,
          fontWeight: FontWeight.w500,
          color: primary,
          height: 1.3,
        ),
        bodyLarge: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w400,
          color: primary,
          height: 1.7,
        ),
        bodyMedium: GoogleFonts.inter(
          fontSize: 16,
          fontWeight: FontWeight.w400,
          color: primary,
          height: 1.6,
        ),
        labelLarge: GoogleFonts.inter(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          letterSpacing: 0.05,
          color: primary,
          height: 1.2,
        ),
        labelSmall: GoogleFonts.inter(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.1,
          color: primary,
          height: 1.2,
        ),
      ),
    );
  }
}
