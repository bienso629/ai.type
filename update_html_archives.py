import json
import os

vi_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json'
en_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json'

keys = {
    'app.scanned_nodes_repo': ('kho node được quét trên internet', 'Scanned nodes repository'),
    'app.search_by_title': ('Tìm theo tiêu đề', 'Search by title'),
    'app.view_details': ('Xem chi tiết', 'View details'),
    'app.convert_to_text': ('Chuyển sang văn bản', 'Convert to text'),
    'app.re_scan': ('Quét lại', 'Rescan'),
    'app.original_link': ('Link gốc', 'Original link'),
    'app.node_id': ('Mã node', 'Node ID'),
    'app.date_created': ('Ngày tạo', 'Date created'),
    'app.selected': ('Đã chọn', 'Selected'),
    'app.export_data': ('Xuất dữ liệu', 'Export data'),
    'app.back': ('quay lại', 'back'),
    'app.copy_link': ('Copy link', 'Copy link'),
    'app.imported_nodes_repo': ('kho node được import từ wordpress', 'Imported nodes from WordPress'),
    'app.text': ('Văn bản', 'Text'),
    'app.search_current_tasks': ('Tìm kiếm việc đang làm', 'Search current tasks'),
    'app.search_by': ('Tìm theo', 'Search by'),
    'app.synced_wordpress': ('Đã đồng bộ WordPress', 'Synced WordPress'),
    'app.disconnect': ('Hủy kết nối', 'Disconnect')
}

with open(vi_path, 'r', encoding='utf-8') as f:
    vi_data = json.load(f)
with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

for k, (vi_v, en_v) in keys.items():
    vi_data[k] = vi_v
    en_data[k] = en_v

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

ai_nodes_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-nodes/ai-nodes.component.html'
wp2md_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/archives/wp2md/wp2md.component.html'
archives_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/archives/archives.component.html'

ai_nodes_replacements = {
    'kho node được quét trên internet': "{{ 'app.scanned_nodes_repo' | transloco }}",
    "[placeholder]=\"'Tìm theo tiêu đề'\"": "[placeholder]=\"'app.search_by_title' | transloco\"",
    'name="Tiêu đề"': "name=\"{{ 'app.title' | transloco }}\"",
    "[matTooltip]=\"'Xem chi tiết'\"": "[matTooltip]=\"'app.view_details' | transloco\"",
    "[matTooltip]=\"'Chuyển sang văn bản'\"": "[matTooltip]=\"'app.convert_to_text' | transloco\"",
    "[matTooltip]=\"'Quét lại'\"": "[matTooltip]=\"'app.re_scan' | transloco\"",
    'name="Link gốc"': "name=\"{{ 'app.original_link' | transloco }}\"",
    'name="Mã node"': "name=\"{{ 'app.node_id' | transloco }}\"",
    'name="Ngày tạo"': "name=\"{{ 'app.date_created' | transloco }}\"",
    "Đã chọn {{ (selectedCount) ? selectedCount.toLocaleString() : 0 }} trong {{ (rowCount) ? rowCount.toLocaleString() : 0 }}": "{{ 'app.selected' | transloco }} {{ (selectedCount) ? selectedCount.toLocaleString() : 0 }} / {{ (rowCount) ? rowCount.toLocaleString() : 0 }}",
    ">Xuất dữ liệu<": ">{{ 'app.export_data' | transloco }}<",
    ">quay lại<": ">{{ 'app.back' | transloco }}<",
    "[matTooltip]=\"'Copy link ' + row.url\"": "[matTooltip]=\"('app.copy_link' | transloco) + ' ' + row.url\""
}
replace_in_file(ai_nodes_path, ai_nodes_replacements)

wp2md_replacements = {
    'kho node được import từ wordpress': "{{ 'app.imported_nodes_repo' | transloco }}",
    "[placeholder]=\"'Tìm theo tiêu đề'\"": "[placeholder]=\"'app.search_by_title' | transloco\"",
    'name="Tiêu đề"': "name=\"{{ 'app.title' | transloco }}\"",
    "[matTooltip]=\"'Văn bản'\"": "[matTooltip]=\"'app.text' | transloco\"",
    'name="Link gốc"': "name=\"{{ 'app.original_link' | transloco }}\"",
    'name="Ngày tạo"': "name=\"{{ 'app.date_created' | transloco }}\"",
    "Đã chọn {{ (selectedCount) ? selectedCount.toLocaleString() : 0 }} trong {{ (rowCount) ? rowCount.toLocaleString() : 0 }}": "{{ 'app.selected' | transloco }} {{ (selectedCount) ? selectedCount.toLocaleString() : 0 }} / {{ (rowCount) ? rowCount.toLocaleString() : 0 }}",
    ">Xuất dữ liệu<": ">{{ 'app.export_data' | transloco }}<",
    ">quay lại<": ">{{ 'app.back' | transloco }}<",
    "Xuất dữ liệu\n                            </a>": "{{ 'app.export_data' | transloco }}\n                            </a>"
}
replace_in_file(wp2md_path, wp2md_replacements)

archives_replacements = {
    "[placeholder]=\"'Tìm kiếm việc đang làm'\"": "[placeholder]=\"'app.search_current_tasks' | transloco\"",
    "Tìm theo: {{search}}": "{{ 'app.search_by' | transloco }}: {{search}}",
    "'Đã đồng bộ WordPress '": "('app.synced_wordpress' | transloco) + ' '",
    'matTooltip="Hủy kết nối"': "[matTooltip]=\"'app.disconnect' | transloco\"",
    ">quay lại<": ">{{ 'app.back' | transloco }}<"
}
replace_in_file(archives_path, archives_replacements)

print("Updated HTML files!")
