import sys
import codecs

src_path = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/director-mode.component.ts'
with codecs.open(src_path, 'r', 'utf8') as f:
    src = f.read()

import re

# Remove properties
src = re.sub(r"    // ControlNet.*?    loadingMessage: string = '';\n", "", src, flags=re.DOTALL)

# Remove loadSavedControlTemplates from ngOnInit
src = src.replace("        this.loadSavedControlTemplates();\n", "")

# Remove methods block starting with loadSavedControlTemplates
methods_to_remove = [
    r"    loadSavedControlTemplates\(\) \{.*?(?=    onPoseReferenceImageSelected)",
    r"    onPoseReferenceImageSelected\(\w+: any\) \{.*?(?=    removePoseReferenceImage)",
    r"    removePoseReferenceImage\(\) \{.*?(?=    openPosePrompt)",
    r"    openPosePrompt\(\w+: Event\) \{.*?(?=    async submitGeneratePose)",
    r"    async submitGeneratePose\(\w+: Event\) \{.*?(?=    triggerVideoUpload)",
    r"    triggerVideoUpload\(\w+: Event\) \{.*?(?=    async onVideoSelected)",
    r"    async onVideoSelected\(\w+: any\) \{.*?(?=    selectExtractedFrame)",
    r"    selectExtractedFrame\(\w+: string\) \{.*?(?=    onFramesScroll)",
    r"    onFramesScroll\(\w+: WheelEvent\) \{.*?(?=    async onControlImageSelected)",
    r"    async onControlImageSelected\(\w+: any\) \{.*?(?=    removeControlImage)",
    r"    removeControlImage\(\) \{.*?(?=    saveCurrentControlAsTemplate)",
    r"    saveCurrentControlAsTemplate\(\) \{.*?(?=    deleteControlTemplate)",
    r"    deleteControlTemplate\(\w+: string, \w+: Event\) \{.*?(?=    selectControlTemplate)",
    r"    selectControlTemplate\(\w+: any\) \{.*?\n    \}\n"
]

for pattern in methods_to_remove:
    src = re.sub(pattern, "", src, flags=re.DOTALL)

with codecs.open(src_path, 'w', 'utf8') as f:
    f.write(src)

print("Cleaned up director-mode.component.ts")
