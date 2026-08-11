import 'package:flutter/material.dart';
import 'app_colors.dart';
import 'button_3d_shape.dart';

class AppStyles {
  static ButtonStyle primaryButton = ElevatedButton.styleFrom(
    backgroundColor: AppColors.primary,
    foregroundColor: Colors.white,
    elevation: 0,
    minimumSize: const Size(88, 48),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
    textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
  ).copyWith(
    shape: WidgetStateProperty.resolveWith<OutlinedBorder>((states) {
      if (states.contains(WidgetState.pressed) || states.contains(WidgetState.hovered)) {
        return const Button3DShape(borderRadius: 6.0, borderWidth: 2.0);
      }
      return const Button3DShape(borderRadius: 6.0, borderWidth: 3.0);
    }),
  );

  static ButtonStyle secondaryButton = ElevatedButton.styleFrom(
    backgroundColor: Colors.amber.shade700,
    foregroundColor: Colors.white,
    elevation: 0,
    minimumSize: const Size(88, 48),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
    textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
  ).copyWith(
    shape: WidgetStateProperty.resolveWith<OutlinedBorder>((states) {
      if (states.contains(WidgetState.pressed) || states.contains(WidgetState.hovered)) {
        return const Button3DShape(borderRadius: 6.0, borderWidth: 2.0);
      }
      return const Button3DShape(borderRadius: 6.0, borderWidth: 3.0);
    }),
  );

  static ButtonStyle dangerButton = ElevatedButton.styleFrom(
    backgroundColor: const Color(0xFFE53E3E),
    foregroundColor: Colors.white,
    elevation: 0,
    minimumSize: const Size(88, 48),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
    textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
  ).copyWith(
    shape: WidgetStateProperty.resolveWith<OutlinedBorder>((states) {
      if (states.contains(WidgetState.pressed) || states.contains(WidgetState.hovered)) {
        return const Button3DShape(borderRadius: 6.0, borderWidth: 2.0);
      }
      return const Button3DShape(borderRadius: 6.0, borderWidth: 3.0);
    }),
  );

  static ButtonStyle blueButton = ElevatedButton.styleFrom(
    backgroundColor: const Color(0xFF3182CE),
    foregroundColor: Colors.white,
    elevation: 0,
    minimumSize: const Size(88, 48),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
    textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
  ).copyWith(
    shape: WidgetStateProperty.resolveWith<OutlinedBorder>((states) {
      if (states.contains(WidgetState.pressed) || states.contains(WidgetState.hovered)) {
        return const Button3DShape(borderRadius: 6.0, borderWidth: 2.0);
      }
      return const Button3DShape(borderRadius: 6.0, borderWidth: 3.0);
    }),
  );

  static ButtonStyle accentButton = ElevatedButton.styleFrom(
    backgroundColor: AppColors.textSecondary,
    foregroundColor: Colors.white,
    elevation: 0,
    minimumSize: const Size(88, 48),
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
    textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
  ).copyWith(
    shape: WidgetStateProperty.resolveWith<OutlinedBorder>((states) {
      if (states.contains(WidgetState.pressed) || states.contains(WidgetState.hovered)) {
        return const Button3DShape(borderRadius: 6.0, borderWidth: 2.0);
      }
      return const Button3DShape(borderRadius: 6.0, borderWidth: 3.0);
    }),
  );
}
