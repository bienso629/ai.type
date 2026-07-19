import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'theme/app_colors.dart';
import 'screens/login_screen.dart';
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
      title: 'AI.TYPING',
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
      home: initialScreen,
    );
  }
}

class Button3DShape extends OutlinedBorder {
  final double borderRadius;
  final double borderWidth;
  final Color borderColor;

  const Button3DShape({
    this.borderRadius = 4.0,
    this.borderWidth = 3.0,
    this.borderColor = const Color.fromRGBO(1, 1, 1, 0.2),
    super.side,
  });

  @override
  OutlinedBorder copyWith({BorderSide? side, double? borderRadius, double? borderWidth, Color? borderColor}) {
    return Button3DShape(
      borderRadius: borderRadius ?? this.borderRadius,
      borderWidth: borderWidth ?? this.borderWidth,
      borderColor: borderColor ?? this.borderColor,
      side: side ?? this.side,
    );
  }

  @override
  EdgeInsetsGeometry get dimensions => EdgeInsets.only(bottom: borderWidth);

  @override
  Path getInnerPath(Rect rect, {TextDirection? textDirection}) {
    return Path()..addRRect(RRect.fromRectAndRadius(rect, Radius.circular(borderRadius)));
  }

  @override
  Path getOuterPath(Rect rect, {TextDirection? textDirection}) {
    return Path()..addRRect(RRect.fromRectAndRadius(rect, Radius.circular(borderRadius)));
  }

  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {
    final Paint paint = Paint()
      ..color = borderColor
      ..style = PaintingStyle.fill;
    
    final Rect bottomRect = Rect.fromLTRB(rect.left, rect.bottom - borderWidth, rect.right, rect.bottom);
    final RRect rRect = RRect.fromRectAndCorners(
      bottomRect,
      bottomLeft: Radius.circular(borderRadius),
      bottomRight: Radius.circular(borderRadius),
    );
    canvas.drawRRect(rRect, paint);
  }
  
  @override
  ShapeBorder scale(double t) {
    return Button3DShape(
      borderRadius: borderRadius * t,
      borderWidth: borderWidth * t,
      borderColor: borderColor,
      side: side.scale(t),
    );
  }
}

