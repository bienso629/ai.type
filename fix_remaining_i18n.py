import json
import os

vi_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json'
en_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json'

keys = {
    'app.we_use_gemini': ('Chúng tôi sử dụng Gemini để trả lời câu hỏi của bạn.', 'We use Gemini to answer your questions.'),
    'app.send_question_to_gemini': ('Gửi câu hỏi tới Gemini', 'Send question to Gemini'),
    'app.upload_file_to_cdn': ('Upload file lên CDN', 'Upload file to CDN'),
    'app.question': ('Câu hỏi', 'Question'),
    'app.time': ('Thời gian', 'Time'),
    'app.you_asked_gemini': ('Bạn đã hỏi Gemini', 'You have asked Gemini'),
    'app.times': ('lần', 'times'),
    
    'app.tools_for_you': ('Công cụ cho bạn', 'Tools for you'),
    'app.write_article': ('Viết bài', 'Write Article'),
    'app.write_article_desc': ('Công cụ giúp bạn viết bài nhanh, chính xác & mượt mà hơn', 'Tool to help you write articles faster, more accurately & smoother'),
    'app.dictionary': ('Từ điển', 'Dictionary'),
    'app.dictionary_desc': ('Tra cứu & giải nghĩa các từ tiếng Việt phục vụ cho Văn bản', 'Look up & explain Vietnamese words for Documents'),
    
    'app.remaining': ('Còn', 'Remaining'),
    'app.articles': ('bài', 'articles'),
    'app.notification': ('Thông báo', 'Notification'),
    'app.view_all_notifications': ('Xem tất cả thông báo', 'View all notifications'),
    
    'app.report_analytics_desc': ('Phân tích báo cáo của Google Analytics & Search Console', 'Analyze reports of Google Analytics & Search Console'),
    'app.auto_interact_desc': ('Tự động bình luận, thích hoặc đăng bài lên MXH', 'Auto comment, like or post on Social Media'),
    'app.no_shortcuts': ('Không có lối tắt', 'No shortcuts'),
    'app.account_not_activated': ('Tài khoản của bạn chưa được kích hoạt.', 'Your account has not been activated.'),
    'app.mark_as_unread': ('Mark as unread', 'Mark as unread'),
    'app.mark_as_read': ('Mark as read', 'Mark as read'),
    'app.no_notifications': ('Không có thông báo', 'No notifications'),
    'app.no_notifications_desc': ('Khi bạn có thông báo, chúng sẽ hiển thị ở đây.', 'When you have notifications, they will appear here.')
}

with open(vi_path, 'r', encoding='utf-8') as f:
    vi_data = json.load(f)

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

for key, (vi_val, en_val) in keys.items():
    k = key.split('.')[1]
    vi_data['app'][k] = vi_val
    en_data['app'][k] = en_val

with open(vi_path, 'w', encoding='utf-8') as f:
    json.dump(vi_data, f, ensure_ascii=False, indent=4)

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=4)


def replace_in_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements.items():
        content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

chatgpt = 'src/app/layout/common/chatgpt2s/chatgpt2s.component.html'
replace_in_file(chatgpt, {
    "[placeholder]=\"'Chúng tôi sử dụng Gemini để trả lời câu hỏi của bạn.'\"": "[placeholder]=\"('app.we_use_gemini' | transloco)\"",
    "[matTooltip]=\"'Gửi câu hỏi tới Gemini'\"": "[matTooltip]=\"('app.send_question_to_gemini' | transloco)\"",
    "[matTooltip]=\"'Upload file lên CDN'\"": "[matTooltip]=\"('app.upload_file_to_cdn' | transloco)\"",
    "name=\"Câu hỏi\"": "[name]=\"('app.question' | transloco)\"",
    "name=\"Thời gian\"": "[name]=\"('app.time' | transloco)\"",
    "Bạn đã hỏi Gemini {{ (rowCount) ? rowCount.toLocaleString() : 0 }} lần": "{{ 'app.you_asked_gemini' | transloco }} {{ (rowCount) ? rowCount.toLocaleString() : 0 }} {{ 'app.times' | transloco }}"
})

shortcuts = 'src/app/layout/common/shortcuts/shortcuts.component.html'
replace_in_file(shortcuts, {
    "Công cụ cho bạn": "{{ 'app.tools_for_you' | transloco }}",
    "{{shortcut.label}}": "{{ (shortcut.label === 'Viết bài' ? 'app.write_article' : (shortcut.label === 'Từ điển' ? 'app.dictionary' : shortcut.label)) | transloco }}",
    "{{shortcut.description}}": "{{ (shortcut.label === 'Viết bài' ? 'app.write_article_desc' : (shortcut.label === 'Từ điển' ? 'app.dictionary_desc' : shortcut.description)) | transloco }}",
    "Không có lối tắt": "{{ 'app.no_shortcuts' | transloco }}",
    "Tài khoản của bạn chưa được kích hoạt.": "{{ 'app.account_not_activated' | transloco }}"
})

notifications = 'src/app/layout/common/notifications/notifications.component.html'
replace_in_file(notifications, {
    "'Còn ' + budget + ' bài' : 'Thông báo'": "('app.remaining' | transloco) + ' ' + budget + ' ' + ('app.articles' | transloco) : ('app.notification' | transloco)",
    "[matTooltip]=\"'Xem tất cả thông báo'\"": "[matTooltip]=\"('app.view_all_notifications' | transloco)\"",
    "notification.read ? 'Mark as unread' : 'Mark as read'": "notification.read ? ('app.mark_as_unread' | transloco) : ('app.mark_as_read' | transloco)",
    "No notifications": "{{ 'app.no_notifications' | transloco }}",
    "When you have notifications,\n                        they will appear here.": "{{ 'app.no_notifications_desc' | transloco }}"
})

tools = 'src/app/modules/admin/account/tools/tools.component.html'
replace_in_file(tools, {
    "Phân tích báo cáo của Google Analytics & Search Console": "{{ 'app.report_analytics_desc' | transloco }}",
    "Tự động bình luận, thích hoặc đăng bài lên MXH": "{{ 'app.auto_interact_desc' | transloco }}"
})

print("Fixed more translations")
