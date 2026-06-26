import re

path1 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
with open(path1, 'r', encoding='utf-8') as f:
    content = f.read()

# Finding Vietnamese words inside HTML tags (basic heuristic)
matches = re.findall(r'>([^<]*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+[^<]*)<', content)

for match in matches:
    cleaned = match.strip()
    if cleaned and not cleaned.startswith('{{') and not cleaned.endswith('}}'):
        print(cleaned)

