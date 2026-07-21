import 'package:flutter/material.dart';

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
