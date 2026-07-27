import re

file_path = "src/app/modules/admin/content/ai-writer/ai-writer.component.ts"
with open(file_path, "r") as f:
    content = f.read()

old_logic = """                const wpData = {
                    domain: this.domain,
                    domain_id: this.domain._id || this.domain.id,
                    sys_username: this.domain.sys_username,
                    year: this.domain.year,
                    username: this.source.wp_username || this.user.name,
                    apppass: this.source.wp_password,
                    include: [this.source.wp_post_id]
                };
                
                const wpPostsResponse = await firstValueFrom(this._wordpressService.posts(wpData));
                const wpPosts = wpPostsResponse && wpPostsResponse.success !== undefined ? wpPostsResponse.data : wpPostsResponse;
                
                if (!wpPosts || !Array.isArray(wpPosts) || wpPosts.length === 0) {"""

new_logic = """                const wpPostsResponse = await firstValueFrom(
                    this._wordpressService.check_post_exists(
                        this.domain.domain, 
                        this.source.wp_post_id, 
                        this.source.wp_username || this.user.name, 
                        this.source.wp_password
                    )
                );
                
                if (!wpPostsResponse || !wpPostsResponse.id) {"""

content = content.replace(old_logic, new_logic)

with open(file_path, "w") as f:
    f.write(content)

print("Patched ai-writer.component.ts")
