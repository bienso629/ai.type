import re

file_path = "/home/yenai/Documents/Projects/Typing/ai.type/mobile/lib/screens/auto_screen.dart"

with open(file_path, "r") as f:
    content = f.read()

# Fix the dateMatch logic
old_dateMatch = """        final dateMatch = RegExp(r'\\b(0?[1-9]|[12]\\d|3[01])\\/(0?[1-9]|1[0-2])(?:\\/(\\d{4}))?\\b').firstMatch(text);
        if (dateMatch != null) {"""
new_dateMatch = """        final dateMatch = RegExp(r'\\b(0?[1-9]|[12]\\d|3[01])\\/(0?[1-9]|1[0-2])(?:\\/(\\d{4}))?\\b').firstMatch(text) ?? RegExp(r'(?:ngày|mùng)\\s*(0?[1-9]|[12]\\d|3[01])\\s*tháng\\s*(0?[1-9]|1[0-2])(?:\\s*năm\\s*(\\d{4}))?', caseSensitive: false).firstMatch(text);
        if (dateMatch != null) {"""
content = content.replace(old_dateMatch, new_dateMatch)

# Fix isExactDate
old_exact = "final isExactDate = RegExp(r'\\b(0?[1-9]|[12]\\d|3[01])\\/(0?[1-9]|1[0-2])(?:\\/(\\d{4}))?\\b').hasMatch(text);"
new_exact = "final isExactDate = dateMatch != null;"
content = content.replace(old_exact, new_exact)

# Fix isMonth to not trigger if isExactDate is true
old_month = "final isMonth = RegExp(r'tháng\\s*(0?[1-9]|1[0-2])(?:\\/(\\d{4}))?', caseSensitive: false).hasMatch(text);"
new_month = "final isMonth = !isExactDate && RegExp(r'tháng\\s*(0?[1-9]|1[0-2])(?:\\/(\\d{4}))?', caseSensitive: false).hasMatch(text);"
content = content.replace(old_month, new_month)

with open(file_path, "w") as f:
    f.write(content)

api_path = "/home/yenai/Documents/Projects/Typing/ai.type/mobile/lib/services/api_service.dart"
with open(api_path, "r") as f:
    api = f.read()
api = api.replace("gemini-1.5-flash-latest", "gemini-1.5-flash")
with open(api_path, "w") as f:
    f.write(api)

