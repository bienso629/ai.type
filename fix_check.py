import re

# 1. Patch wordpress.ts
file_path_wp = "src/app/modules/_services/wordpress.ts"
with open(file_path_wp, "r") as f:
    content_wp = f.read()

old_wp_method = r"public check_post_exists\(domain: string, postId: number\|string, username: string, apppass: string\): import\('rxjs'\)\.Observable<any> \{.*?\n    \}"
new_wp_method = """public check_post_exists(domain: string, postId: number|string, username: string, apppass: string): import('rxjs').Observable<any> {
        console.log('--- START RUNNING API CHECK TO WP DIRECTLY ---', domain, postId);
        if (domain && typeof domain === 'string' && !domain.startsWith('http')) {
            domain = 'https://' + domain;
        }
        if (!domain.endsWith('/')) {
            domain += '/';
        }
        
        let url = `${domain}wp-json/wp/v2/posts/${postId}`;
        console.log('URL TO CHECK:', url);
        
        let auth = '';
        try {
            let userStr = (username || '');
            let passStr = (apppass || '');
            auth = 'Basic ' + btoa(unescape(encodeURIComponent(userStr + ':' + passStr)));
        } catch (e) {
            console.error('Base64 encode error', e);
        }

        let headers = new HttpHeaders({
            'Authorization': auth
        });
        
        return this.http.get<any>(url, { headers }).pipe(
            catchError(err => {
                console.error('WP API CHECK FAILED:', err);
                if (err && err.status === 404) {
                    return of(null); // Post doesn't exist
                }
                // If it fails due to CORS or 401, return something so it doesn't break?
                // Actually if it's CORS, status is 0. 
                if (err && err.status === 0) {
                    console.error('WP API CHECK CORS BLOCKED! url:', url);
                }
                return throwError(() => err);
            })
        );
    }"""
content_wp = re.sub(old_wp_method, new_wp_method, content_wp, flags=re.DOTALL)
with open(file_path_wp, "w") as f:
    f.write(content_wp)


# 2. Patch ai-writer.component.ts
file_path_writer = "src/app/modules/admin/content/ai-writer/ai-writer.component.ts"
with open(file_path_writer, "r") as f:
    content_writer = f.read()

old_writer = """                const wpPostsResponse = await firstValueFrom(
                    this._wordpressService.check_post_exists(
                        this.domain.domain, 
                        this.source.wp_post_id, 
                        this.source.wp_username || this.user.name, 
                        this.source.wp_password
                    )
                );"""

new_writer = """                const targetDomain = (this.domain && this.domain.domain) ? this.domain.domain : this.source.wp_domain;
                console.log('Export check_post_exists targetDomain:', targetDomain, 'ID:', this.source.wp_post_id);
                const wpPostsResponse = await firstValueFrom(
                    this._wordpressService.check_post_exists(
                        targetDomain, 
                        this.source.wp_post_id, 
                        this.source.wp_username || this.user.name, 
                        this.source.wp_password
                    )
                );"""
content_writer = content_writer.replace(old_writer, new_writer)
with open(file_path_writer, "w") as f:
    f.write(content_writer)

print("Fixed check_post_exists")
