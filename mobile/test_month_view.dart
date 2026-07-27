import 'dart:mirrors';
import 'package:calendar_view/calendar_view.dart';

void main() {
  ClassMirror cm = reflectClass(MonthView);
  for (var v in cm.declarations.values) {
    if (v is MethodMirror && v.isConstructor) {
      for (var p in v.parameters) {
        print(p.isNamed ? p.simpleName : 'not named');
      }
    }
  }
}
