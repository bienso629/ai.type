import os

path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/account/tools/tools.component.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'Phân tích báo cáo của Google Analytics\n                                            & Search\n                                            Console\n                                        </p>',
    "{{ 'app.report_analytics_desc' | transloco }}\n                                        </p>"
)

content = content.replace(
    'Tự động bình luận, thích hoặc đăng bài\n                                            lên MXH</p>',
    "{{ 'app.auto_interact_desc' | transloco }}</p>"
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed tools html")
