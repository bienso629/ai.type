import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

/// LottieLoadingSpinner - Renders Lottie animation from LottieFiles (c3653a08-bd1e-4673-af21-d51b90b9149f)
class LottieLoadingSpinner extends StatelessWidget {
  final double size;

  const LottieLoadingSpinner({
    super.key,
    this.size = 120,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Lottie.asset(
        'assets/lottie/loading.json',
        width: size,
        height: size,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) {
          return MultiColorDotSpinner(size: size * 0.8);
        },
      ),
    );
  }
}

/// MultiColorDotSpinner - Fallback animated spinner
class MultiColorDotSpinner extends StatefulWidget {
  final double size;
  final double dotSize;

  const MultiColorDotSpinner({
    super.key,
    this.size = 96,
    this.dotSize = 11,
  });

  @override
  State<MultiColorDotSpinner> createState() => _MultiColorDotSpinnerState();
}

class _MultiColorDotSpinnerState extends State<MultiColorDotSpinner> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  static const List<Color> _dotColors = [
    Color(0xFF8E24AA),
    Color(0xFF5E35B1),
    Color(0xFF3949AB),
    Color(0xFF1E88E5),
    Color(0xFF00ACC1),
    Color(0xFF43A047),
    Color(0xFF7CB342),
    Color(0xFFFDD835),
    Color(0xFFFB8C00),
    Color(0xFFF4511E),
    Color(0xFFE91E63),
  ];

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2000),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final double centerCircleRadius = widget.size * 0.20;
    final double dotOrbitRadius = widget.size * 0.36;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return SizedBox(
          width: widget.size,
          height: widget.size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: centerCircleRadius * 2,
                height: centerCircleRadius * 2,
                decoration: BoxDecoration(
                  color: const Color(0xFFDCDFE4),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 4,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
              ...List.generate(_dotColors.length, (index) {
                final double baseAngle = (index * 2 * math.pi) / _dotColors.length;
                final double currentAngle = baseAngle + (_controller.value * 2 * math.pi);
                final double scalePhase = (_controller.value + (index / _dotColors.length)) % 1.0;
                final double scale = 0.75 + 0.4 * math.sin(scalePhase * 2 * math.pi).abs();

                final double dx = dotOrbitRadius * math.cos(currentAngle);
                final double dy = dotOrbitRadius * math.sin(currentAngle);

                return Transform.translate(
                  offset: Offset(dx, dy),
                  child: Transform.scale(
                    scale: scale,
                    child: Container(
                      width: widget.dotSize,
                      height: widget.dotSize,
                      decoration: BoxDecoration(
                        color: _dotColors[index],
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: _dotColors[index].withValues(alpha: 0.4),
                            blurRadius: 4,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }
}

/// AppLoading - Global Loading Dialog using Lottie animation
class AppLoading extends StatelessWidget {
  final String message;

  const AppLoading({
    super.key,
    this.message = 'Đang xử lý...',
  });

  static bool _isShowing = false;
  static bool get isShowing => _isShowing;

  static void show(BuildContext context, {String message = 'Đang xử lý...'}) {
    if (_isShowing) return;
    _isShowing = true;
    showDialog(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withValues(alpha: 0.35),
      builder: (context) => AppLoading(message: message),
    ).then((_) {
      _isShowing = false;
    });
  }

  static void dismiss(BuildContext context) {
    if (_isShowing) {
      _isShowing = false;
      if (Navigator.of(context, rootNavigator: true).canPop()) {
        Navigator.of(context, rootNavigator: true).pop();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      elevation: 0,
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 40),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const LottieLoadingSpinner(size: 130),
            if (message.isNotEmpty) ...[
              const SizedBox(height: 14),
              Text(
                message,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                  letterSpacing: 0.2,
                  shadows: [
                    Shadow(
                      color: Colors.black54,
                      blurRadius: 6,
                    ),
                  ],
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
