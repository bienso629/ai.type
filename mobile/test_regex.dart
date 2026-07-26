void main() {
  String text = "sửa ngày 04/08";
  final isExactDate = RegExp(r'\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b').hasMatch(text);
  final isMonth = RegExp(r'tháng\s*(0?[1-9]|1[0-2])(?:\/(\d{4}))?', caseSensitive: false).hasMatch(text);
  print('isExactDate: $isExactDate');
  print('isMonth: $isMonth');
}
