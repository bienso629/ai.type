import re

file_path = "src/app/modules/admin/content/ai-writer/ai-writer.component.ts"
with open(file_path, "r") as f:
    content = f.read()

old_export_start = r"    async export\(\) \{\n        let isUpdate = this\.source && this\.source\.wp_post_id;\n        \n        if \(isUpdate\) \{\n            // Check if post still exists on WordPress\n            try \{\n                this\.detectForm\.disable\(\);\n                const targetDomain = \(this\.domain && this\.domain\.domain\) \? this\.domain\.domain : this\.source\.wp_domain;\n                console\.log\('Export check_post_exists targetDomain:', targetDomain, 'ID:', this\.source\.wp_post_id\);\n                const wpPostsResponse = await firstValueFrom\(\n                    this\._wordpressService\.check_post_exists\(\n                        targetDomain, \n                        this\.source\.wp_post_id, \n                        this\.source\.wp_username \|\| this\.user\.name, \n                        this\.source\.wp_password\n                    \)\n                \);\n                \n                if \(\!wpPostsResponse \|\| \!wpPostsResponse\.id\) \{\n                    // Deleted on WP!\n                    isUpdate = false;\n                    this\.source\.wp_post_id = null;\n                    this\.update\(false\); // save local\n                    this\.toastr\.warning\('Bài viết này đã bị xoá trên WordPress\. Tự động chuyển sang đăng mới\!'\);\n                \}\n            \} catch \(e\) \{\n                console\.error\('Check post error:', e\);\n            \} finally \{\n                this\.detectForm\.enable\(\);\n            \}\n        \}"

new_export_start = """    async export() {
        let isUpdate = this.source && (this.source.wp_post_id || (this.source.wpPosts && this.source.wpPosts.length > 0));
        
        if (isUpdate) {
            // Check if post still exists on WordPress
            try {
                this.detectForm.disable();
                
                let checkDomain = (this.domain && this.domain.domain) ? this.domain.domain : this.source.wp_domain;
                let checkPostId = this.source.wp_post_id;
                let checkUsername = this.source.wp_username || this.user.name;
                let checkPassword = this.source.wp_password;
                
                if (!checkPostId && this.source.wpPosts && this.source.wpPosts.length > 0) {
                    checkDomain = this.source.wpPosts[0].wp_domain || this.source.wpPosts[0].domain;
                    checkPostId = this.source.wpPosts[0].wp_post_id || this.source.wpPosts[0].id;
                    checkUsername = this.source.wpPosts[0].wp_username || this.user.name;
                    checkPassword = this.source.wpPosts[0].wp_password;
                }
                
                console.log('--- START EXPORT API CHECK ---');
                console.log('Export check_post_exists targetDomain:', checkDomain, 'ID:', checkPostId);
                const wpPostsResponse = await firstValueFrom(
                    this._wordpressService.check_post_exists(
                        checkDomain, 
                        checkPostId, 
                        checkUsername, 
                        checkPassword
                    )
                );
                
                if (!wpPostsResponse || !wpPostsResponse.id) {
                    // Deleted on WP!
                    isUpdate = false;
                    this.source.wp_post_id = null;
                    if (this.source.wpPosts) this.source.wpPosts = [];
                    this.update(false); // save local
                    this.toastr.warning('Bài viết này đã bị xoá trên WordPress. Tự động chuyển sang đăng mới!');
                }
            } catch (e: any) {
                console.error('Check post error:', e);
                if (e && e.status === 0) {
                     this.toastr.warning('Không thể kiểm tra API trực tiếp do bị chặn CORS. Vẫn tiếp tục mở Cập nhật.');
                }
            } finally {
                this.detectForm.enable();
            }
        }"""

content = re.sub(old_export_start, new_export_start, content, flags=re.DOTALL)
with open(file_path, "w") as f:
    f.write(content)

print("Patched export")
