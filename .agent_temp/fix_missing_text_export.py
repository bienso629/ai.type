import re

FILE = "/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.ts"

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

# Neo: chỉ xuất hiện 1 lần trong exportVideoWithFrame (dòng 2216), bản trong collectTimelineExportData dùng text khác
anchor = """                        }
                    }
                }

                // 4. Extracted Audios"""

# Kiểm tra số lần xuất hiện của anchor
count = content.count(anchor)
print(f"Anchor appears {count} time(s)")

# Khối scene.texts cần chèn vào exportVideoWithFrame (trước "// 4. Extracted Audios" đầu tiên)
texts_block = """                        }
                    }
                }

                // 3.5. Cac clip Text (chu viet tren Track Van ban / scene.texts)
                if (scene.texts) {
                    for (const txt of scene.texts) {
                        if (txt.disabled) continue;
                        const textStr = (txt.text || '').trim();
                        if (!textStr) continue;

                        const sTime = Number(txt.startTime) || 0;
                        const dur = Number(txt.duration) || 3;
                        const eTime = sTime + dur;

                        if (sTime < vEnd && eTime > vStart) {
                            const relStart = Math.max(0, sTime - vStart);
                            const clipDur = Math.min(
                                dur - Math.max(0, vStart - sTime),
                                vDur - relStart,
                            );
                            if (clipDur > 0.1) {
                                allSubs.push({
                                    startTime: relStart,
                                    duration: clipDur,
                                    primaryText: textStr,
                                    secondaryText: '',
                                    fontFamily:
                                        txt.fontFamily || this.currentSubtitleFont,
                                    fontSize:
                                        txt.fontSize ||
                                        this.currentSubtitleFontSize,
                                });
                            }
                        }
                    }
                }

                // 4. Extracted Audios"""

# Thay thế lần xuất hiện ĐẦU TIÊN (trong exportVideoWithFrame)
new_content = content.replace(anchor, texts_block, 1)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(new_content)

print("Patch applied successfully")
