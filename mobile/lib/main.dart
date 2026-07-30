import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_quill/flutter_quill.dart' as quill;
import 'theme/app_colors.dart';
import 'screens/login_screen.dart';
import 'theme/button_3d_shape.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/dashboard_screen.dart';
import 'screens/active_screen.dart';

void main() async {
  WidgetsBinding widgetsBinding = WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  
  FlutterNativeSplash.preserve(widgetsBinding: widgetsBinding);
  
  bool isLoggedIn = prefs.getString('active_info') != null;
  bool requiresActivation = false;
  
  if (isLoggedIn) {
    final activeInfo = jsonDecode(prefs.getString('active_info')!);
    final token = activeInfo['user']['appToken'];
    if (token == null || token == 'default_app_token' || token.toString().trim().isEmpty) {
      requiresActivation = true;
    }
  }

  runApp(AITypingApp(isLoggedIn: isLoggedIn, requiresActivation: requiresActivation));
}

class AITypingApp extends StatelessWidget {
  final bool isLoggedIn;
  final bool requiresActivation;
  
  const AITypingApp({super.key, required this.isLoggedIn, this.requiresActivation = false});

  @override
  Widget build(BuildContext context) {
    FlutterNativeSplash.remove();
    
    Widget initialScreen;
    if (isLoggedIn) {
      if (requiresActivation) {
        initialScreen = const ActiveScreen();
      } else {
        initialScreen = const DashboardScreen();
      }
    } else {
      initialScreen = const LoginScreen();
    }

    return MaterialApp(
      title: 'AI Type',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          primary: AppColors.primary,
          background: AppColors.background,
          surface: AppColors.surface,
        ),
        textTheme: GoogleFonts.interTextTheme(
          Theme.of(context).textTheme,
        ).apply(
          bodyColor: AppColors.textPrimary,
          displayColor: AppColors.textPrimary,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          isDense: true,
          hintStyle: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(4),
            borderSide: const BorderSide(color: AppColors.accent),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(4),
            borderSide: const BorderSide(color: AppColors.accent),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(4),
            borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            elevation: 0,
            minimumSize: const Size(88, 52),
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 0),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ).copyWith(
            shape: MaterialStateProperty.resolveWith<OutlinedBorder>((states) {
              if (states.contains(MaterialState.pressed) || states.contains(MaterialState.hovered)) {
                return const Button3DShape(
                  borderRadius: 4.0,
                  borderWidth: 2.0,
                );
              }
              return const Button3DShape(
                borderRadius: 4.0,
                borderWidth: 3.0,
              );
            }),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: AppColors.primary,
            textStyle: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        checkboxTheme: CheckboxThemeData(
          fillColor: MaterialStateProperty.resolveWith<Color>((states) {
            if (states.contains(MaterialState.selected)) {
              return AppColors.primary;
            }
            return Colors.transparent;
          }),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        ),
        dialogTheme: const DialogThemeData(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
        ),
        useMaterial3: true,
      ),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        quill.FlutterQuillLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('en', 'US'),
        Locale('vi', 'VN'),
      ],
      home: initialScreen,
    );
  }
}

