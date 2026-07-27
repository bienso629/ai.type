import re

file_path = "src/app/modules/_services/wordpress.ts"
with open(file_path, "r") as f:
    content = f.read()

new_method = """
    public check_post_exists(domain: string, postId: number|string, username: string, apppass: string): import('rxjs').Observable<any> {
        if (domain && typeof domain === 'string' && !domain.startsWith('http')) {
            domain = 'https://' + domain;
        }
        if (!domain.endsWith('/')) {
            domain += '/';
        }
        
        let url = `${domain}wp-json/wp/v2/posts/${postId}`;
        
        let headers = new HttpHeaders({
            'Authorization': 'Basic ' + btoa(username + ':' + apppass)
        });
        
        return this.http.get<any>(url, { headers }).pipe(
            catchError(err => {
                if (err && err.status === 404) {
                    return of(null);
                }
                return throwError(() => err);
            })
        );
    }

    public posts(dataForm: any): Observable<any> {"""

content = content.replace("    public posts(dataForm: any): Observable<any> {", new_method)

with open(file_path, "w") as f:
    f.write(content)

print("Patched wordpress.ts")
