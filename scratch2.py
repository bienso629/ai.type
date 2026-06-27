import re
import sys

file_path = '/Users/yennguyen/Documents/projects/typing/ai.type/src/app/modules/admin/content/ai-tts/ai-tts.component.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace this.dialog.open(VideoTimelineDialogComponent...)
old_open_dialog = """        this.dialog.open(VideoTimelineDialogComponent, {
            width: '100vw',
            height: '100vh',
            maxWidth: '100vw',
            maxHeight: '100vh',
            data: data, // Truyền dữ liệu trực tiếp vào dialog
            panelClass: 'custom-timeline-container', // Class để bạn style thêm nếu cần
            autoFocus: false, // Tránh việc tự động nhảy focus làm cuộn timeline lung tung
        });"""

new_open_dialog = """        this.router.navigate(['/admin/content/ai-tts', this.user?.name || 'anonymous', this.uuid, 'timeline']);"""

if old_open_dialog in content:
    content = content.replace(old_open_dialog, new_open_dialog)
else:
    print("Old dialog open not found")
    sys.exit(1)

# Remove the check for existing dialog since it's no longer a dialog
old_check_dialog = """                    const isDialogOpen = this.dialog.openDialogs.some(
                        (d) =>
                            d.componentInstance instanceof
                            VideoTimelineDialogComponent,
                    );

                    if (!isDialogOpen) {
                        this.openTimelineDialog(videoProject);
                    }"""

new_check_dialog = """                    this.openTimelineDialog(videoProject);"""

if old_check_dialog in content:
    content = content.replace(old_check_dialog, new_check_dialog)
else:
    print("Old dialog check not found")
    sys.exit(1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated ai-tts.component.ts successfully")
