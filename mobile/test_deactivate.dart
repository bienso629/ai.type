import 'package:flutter/material.dart';
class Test extends StatefulWidget {
  @override
  _TestState createState() => _TestState();
}
class _TestState extends State<Test> {
  @override
  void deactivate() {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    super.deactivate();
  }
  @override
  Widget build(BuildContext context) => Container();
}
