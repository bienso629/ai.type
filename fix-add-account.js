const fs = require('fs');
const tsFile = 'src/app/modules/admin/account/settings/plugins/plugins.component.ts';
let tsContent = fs.readFileSync(tsFile, 'utf8');

const oldLogic = `    async loginGoogleColab() {
        if (!(window as any).electronAPI || !(window as any).electronAPI.loginColabGoogle) {
            this.toastr.info('Tính năng này hoạt động trên ứng dụng Desktop.');
            return;
        }

        this.isColabAuthenticating = true;
        this.toastr.info('Đang mở trình duyệt để xác thực Google Colab...');
        try {
            const res = await (window as any).electronAPI.loginColabGoogle();
            if (res && res.success) {
                this.toastr.info('Vui lòng chọn tài khoản Google trên trình duyệt, bấm "Cho phép" và dán mã xác thực (4/0A...) vào ô bên dưới.');
                // Lắng nghe clipboard tự động nếu người dùng vừa copy
                this.startClipboardWatcher();
            } else {
                this.toastr.error(res?.error || 'Không thể mở trình duyệt xác thực.');
            }
        } catch(e) {
            this.toastr.error('Lỗi: ' + e.message);
        }
        this.cd.detectChanges();
    }`;

const newLogic = `    async loginGoogleColab() {
        this.isColabAuthenticating = true;

        if ((window as any).electronAPI && (window as any).electronAPI.loginColabGoogle) {
            this.toastr.info('Đang mở trình duyệt để xác thực Google Colab...');
            try {
                const res = await (window as any).electronAPI.loginColabGoogle();
                if (res && res.success) {
                    this.toastr.info('Vui lòng chọn tài khoản Google trên trình duyệt, bấm "Cho phép" và dán mã xác thực (4/0A...) vào ô bên dưới.');
                    this.startClipboardWatcher();
                } else {
                    this.toastr.error(res?.error || 'Không thể mở trình duyệt xác thực.');
                }
            } catch(e) {
                this.toastr.error('Lỗi: ' + e.message);
            }
        } else {
            // Dành cho Web/iPad (Capacitor) gọi thẳng vào Colab Agent Daemon
            const baseUrl = this.colabConfigUrl || 'http://127.0.0.1:7868';
            this.toastr.info('Đang lấy đường dẫn xác thực từ Colab Agent...');
            try {
                const resp = await fetch(\`\${baseUrl}/auth_url\`, { signal: AbortSignal.timeout(3000) });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.auth_url) {
                        window.open(data.auth_url, '_blank');
                        this.toastr.info('Vui lòng xác thực tài khoản Google, sau đó copy mã và dán vào ô xác thực.');
                    } else {
                        this.toastr.error('Không tìm thấy đường dẫn xác thực từ Agent.');
                    }
                } else {
                    this.toastr.error('Lỗi kết nối tới Colab Agent. Đảm bảo Agent đang chạy trên máy tính.');
                }
            } catch (e) {
                this.toastr.error('Lỗi kết nối tới Colab Agent: ' + e.message);
            }
        }
        this.cd.detectChanges();
    }`;

if (tsContent.includes('Tính năng này hoạt động trên ứng dụng Desktop.')) {
    tsContent = tsContent.replace(oldLogic, newLogic);
    fs.writeFileSync(tsFile, tsContent, 'utf8');
    console.log('Successfully replaced loginGoogleColab logic.');
} else {
    console.log('Could not find old logic.');
}
