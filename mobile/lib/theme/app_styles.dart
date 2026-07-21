import 'package:flutter/material.dart';
import 'app_colors.dart';
import 'button_3d_shape.dart';

class AppStyles {
  static ButtonStyle primaryButton = ElevatedButton.styleFrom(
    backgroundColor: AppColors.primary,
    foregroundColor: Colors.white,
    elevation: 0,
    minimumSize: const Size(88, 52),
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 0),
    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
  ).copyWith(
    shape: MaterialStateProperty.resolveWith<OutlinedBorder>((states) {
      if (states.contains(MaterialState.pressed) || states.contains(MaterialState.hovered)) {
        return const Button3DShape(borderRadius: 4.0, borderWidth: 2.0);
      }
      return const Button3DShape(borderRadius: 4.0, borderWidth: 3.0);
    }),
  );

  static ButtonStyle secondaryButton = ElevatedButton.styleFrom(
    backgroundColor: Colors.amber.shade700,
    foregroundColor: Colors.white,
    elevation: 0,
    minimumSize: const Size(88, 52),
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 0),
    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
  ).copyWith(
    shape: MaterialStateProperty.resolveWith<OutlinedBorder>((states) {
      if (states.contains(MaterialState.pressed) || states.contains(MaterialState.hovered)) {
        return const Button3DShape(borderRadius: 4.0, borderWidth: 2.0);
      }
      return const Button3DShape(borderRadius: 4.0, borderWidth: 3.0);
    }),
  );

  static ButtonStyle accentButton = ElevatedButton.styleFrom(
    backgroundColor: AppColors.textSecondary,
    foregroundColor: Colors.white,
    elevation: 0,
    minimumSize: const Size(88, 52),
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 0),
    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
  ).copyWith(
    shape: MaterialStateProperty.resolveWith<OutlinedBorder>((states) {
      if (states.contains(MaterialState.pressed) || states.contains(MaterialState.hovered)) {
        return const Button3DShape(borderRadius: 4.0, borderWidth: 2.0);
      }
      return const Button3DShape(borderRadius: 4.0, borderWidth: 3.0);
    }),
  );
}
