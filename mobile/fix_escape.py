import re

file_path = "/home/yenai/Documents/Projects/Typing/ai.type/mobile/lib/screens/auto_screen.dart"

with open(file_path, "r") as f:
    content = f.read()

# Remove the backslashes before $ in dart interpolation
content = content.replace(r"\$todayStrNew", r"$todayStrNew")
content = content.replace(r"\${jsonEncode", r"${jsonEncode")
content = content.replace(r"\$text", r"$text")
content = content.replace(r"\$generateInstruction", r"$generateInstruction")
content = content.replace(r"\${disabledStr", r"${disabledStr")
content = content.replace(r"\$tzString", r"$tzString")

# also fix the duplicate disabledStr
content = content.replace("final disabledStr = widget.disabledDates.where((d) => d.compareTo(todayStrNew) >= 0).join(', ');", "")

with open(file_path, "w") as f:
    f.write(content)

