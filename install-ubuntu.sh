#!/usr/bin/env bash
# ============================================================
#  AI.Type - Bản cài đặt dòng lệnh cho Ubuntu (Command Line)
#  Cài gói .deb hoặc .AppImage vừa build từ electron/dist
#
#  Cách dùng:
#    bash install-ubuntu.sh                     (tự tìm bản .deb mới nhất)
#    bash install-ubuntu.sh --appimage          (cài bản AppImage, không cần sudo)
#    bash install-ubuntu.sh <đường-dẫn-file>    (cài file chỉ định)
#    bash install-ubuntu.sh --list              (liệt kê bản build khả dụng)
#    bash install-ubuntu.sh --status            (kiểm tra trạng thái cài đặt)
#    bash install-ubuntu.sh --uninstall         (gỡ cài đặt)
#
#  Sau khi cài xong, chạy lệnh:  aitype
# ============================================================
set -euo pipefail

# --- Cấu hình ---
BIN_NAME="aitype"
DESKTOP_FILE="ai-type.desktop"
INSTALL_DIR_APPIMAGE="$HOME/.local/opt/ai.type"
LOCAL_BIN="$HOME/.local/bin"
LOCAL_APPS="$HOME/.local/share/applications"
DEB_INSTALL_ROOT="/opt/AI.Type"
DEB_BIN_PATH="$DEB_INSTALL_ROOT/typing"

# --- Màu sắc ---
C_R="\033[0m"; C_G="\033[32m"; C_Y="\033[33m"; C_C="\033[36m"; C_B="\033[1m"; C_RED="\033[31m"
log_ok()   { echo -e "${C_G}[OK]${C_R} $1"; }
log_info() { echo -e "${C_C}[..]${C_R} $1"; }
log_warn() { echo -e "${C_Y}[!]${C_R} $1"; }
log_err()  { echo -e "${C_RED}[LỖI]${C_R} $1"; }
log_title(){ echo -e "${C_B}${C_C}==> $1${C_R}"; }

# --- Thư mục chứa bản build (tính từ vị trí script) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/electron/dist"

# --- Tìm bản cài đặt mới nhất ---
find_latest_deb() {
    ls -1t "$DIST_DIR"/typing_*_amd64.deb 2>/dev/null | head -1 || true
}
find_latest_appimage() {
    ls -1t "$DIST_DIR"/AI.Type-*.AppImage 2>/dev/null | head -1 || true
}

# --- Kiểm tra kiến trúc hệ thống ---
check_arch() {
    local arch
    arch="$(uname -m)"
    if [ "$arch" != "x86_64" ]; then
        log_err "Kiến trúc hệ thống là $arch, bản cài đặt chỉ hỗ trợ x86_64 (amd64)."
        exit 1
    fi
}

# --- Kiểm tra và tự cài phụ thuộc hệ thống cho gói .deb ---
ensure_deb_dependencies() {
    local deps=(libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libuuid1 libsecret-1-0)
    local missing=()
    local pkg
    for pkg in "${deps[@]}"; do
        if ! dpkg -s "$pkg" > /dev/null 2>&1; then
            missing+=("$pkg")
        fi
    done
    if [ "${#missing[@]}" -gt 0 ]; then
        log_info "Thiếu phụ thuộc hệ thống: ${missing[*]}"
        log_info "Đang tự động cài bổ sung bằng apt..."
        sudo apt-get update -y > /dev/null 2>&1 || true
        sudo apt-get install -y "${missing[@]}" || {
            log_warn "Không cài được một số phụ thuộc, sẽ thử 'apt-get -f install' sau khi cài .deb."
        }
    else
        log_ok "Đầy đủ phụ thuộc hệ thống (libgtk-3, libnss3, ...)"
    fi
}

# --- Đóng ứng dụng đang chạy trước khi ghi đè ---
close_running_app() {
    if pgrep -f "$DEB_BIN_PATH" > /dev/null 2>&1 || pgrep -f "AI.Type-.*AppImage" > /dev/null 2>&1; then
        log_warn "Phát hiện AI.Type đang chạy. Đang đóng ứng dụng..."
        pkill -f "$DEB_BIN_PATH" 2>/dev/null || true
        pkill -f "AI.Type-.*AppImage" 2>/dev/null || true
        sleep 2
    fi
}

# ============================================================
#  CHẾ ĐỘ 1: CÀI GÓI .DEB (khuyến dùng - tích hợp hệ thống)
# ============================================================
install_deb() {
    local deb_file="$1"
    log_title "Cài gói .deb: $deb_file"
    local size_mb
    size_mb="$(du -m "$deb_file" | cut -f1)"
    log_info "Kích thước gói: ${size_mb} MB"

    if ! command -v dpkg > /dev/null 2>&1; then
        log_err "Không tìm thấy dpkg. Máy này có phải Ubuntu/Debian không?"
        exit 1
    fi

    check_arch
    close_running_app
    ensure_deb_dependencies

    log_info "Đang cài vào $DEB_INSTALL_ROOT (cần quyền sudo)..."
    sudo dpkg -i "$deb_file" || {
        log_warn "Thiếu thư viện phụ thuộc, đang tự động cài bổ sung..."
        sudo apt-get install -f -y
    }
    log_ok "Đã cài ứng dụng vào $DEB_INSTALL_ROOT"

    # Tạo lệnh rút gọn 'aitype'
    sudo tee /usr/local/bin/$BIN_NAME > /dev/null << 'BIN'
#!/usr/bin/env bash
exec /opt/AI.Type/typing --no-sandbox "$@"
BIN
    sudo chmod +x /usr/local/bin/$BIN_NAME
    log_ok "Đã tạo lệnh: $BIN_NAME (gõ trong terminal để mở ứng dụng)"

    # Cập nhật menu ứng dụng (file .desktop do electron-builder tạo)
    if [ -f /usr/share/applications/typing.desktop ]; then
        sudo update-desktop-database /usr/share/applications 2>/dev/null || true
        log_ok "Menu ứng dụng đã cập nhật (tìm: AI.Type)"
    fi
}

# ============================================================
#  CHẾ ĐỘ 2: CÀI .APPIMAGE (không cần sudo)
# ============================================================
install_appimage() {
    local app_file="$1"
    log_title "Cài AppImage: $app_file"
    local size_mb
    size_mb="$(du -m "$app_file" | cut -f1)"
    log_info "Kích thước gói: ${size_mb} MB"

    check_arch
    close_running_app
    mkdir -p "$INSTALL_DIR_APPIMAGE" "$LOCAL_BIN" "$LOCAL_APPS"
    cp -f "$app_file" "$INSTALL_DIR_APPIMAGE/AI.Type.AppImage"
    chmod +x "$INSTALL_DIR_APPIMAGE/AI.Type.AppImage"
    log_ok "Đã copy vào $INSTALL_DIR_APPIMAGE/AI.Type.AppImage"

    # Lệnh rút gọn
    cat > "$LOCAL_BIN/$BIN_NAME" << BIN
#!/usr/bin/env bash
exec "$INSTALL_DIR_APPIMAGE/AI.Type.AppImage" --no-sandbox "\$@"
BIN
    chmod +x "$LOCAL_BIN/$BIN_NAME"
    if [ ! -d "$HOME/.local/bin" ] || ! echo "$PATH" | grep -q "$LOCAL_BIN"; then
        log_warn "Thư mục $LOCAL_BIN chưa có trong PATH. Hãy thêm vào ~/.bashrc:"
        echo "       export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
    log_ok "Đã tạo lệnh: $BIN_NAME"

    # File .desktop cho menu ứng dụng
    cat > "$LOCAL_APPS/$DESKTOP_FILE" << DESK
[Desktop Entry]
Name=AI.Type
Comment=Ứng dụng quản lý công việc và tạo nội dung
Exec=$INSTALL_DIR_APPIMAGE/AI.Type.AppImage --no-sandbox %U
Terminal=false
Type=Application
Categories=Office;
StartupWMClass=AI.Type
DESK
    update-desktop-database "$LOCAL_APPS" 2>/dev/null || true
    log_ok "Đã thêm vào menu ứng dụng (tìm: AI.Type)"
    log_info "Lưu ý: AppImage không tạo icon hệ thống và không tự động cập nhật."
}

# ============================================================
#  CHẾ ĐỘ 3: GỠ CÀI ĐẶT
# ============================================================
uninstall_app() {
    log_title "Gỡ cài đặt AI.Type..."
    close_running_app
    if [ -d "$DEB_INSTALL_ROOT" ]; then
        sudo dpkg -r typing 2>/dev/null || sudo rm -rf "$DEB_INSTALL_ROOT"
        sudo rm -f /usr/local/bin/$BIN_NAME /usr/share/applications/typing.desktop
        log_ok "Đã gỡ bản cài .deb"
    fi
    if [ -d "$INSTALL_DIR_APPIMAGE" ]; then
        rm -rf "$INSTALL_DIR_APPIMAGE"
        rm -f "$LOCAL_BIN/$BIN_NAME" "$LOCAL_APPS/$DESKTOP_FILE"
        log_ok "Đã gỡ bản AppImage"
    fi
    log_ok "Hoàn tất gỡ cài đặt"
}

# ============================================================
#  CHẾ ĐỘ 4: KIỂM TRA TRẠNG THÁI
# ============================================================
show_status() {
    log_title "Trạng thái cài đặt AI.Type"
    local found=0
    if dpkg -s typing > /dev/null 2>&1; then
        local ver
        ver="$(dpkg -s typing | awk '/^Version:/{print $2}')"
        log_ok "Bản .deb  : đã cài phiên bản $ver tại $DEB_INSTALL_ROOT"
        found=1
    elif [ -d "$DEB_INSTALL_ROOT" ]; then
        log_warn "Bản .deb  : có thư mục $DEB_INSTALL_ROOT nhưng không đăng ký qua dpkg"
        found=1
    fi
    if [ -f "$INSTALL_DIR_APPIMAGE/AI.Type.AppImage" ]; then
        log_ok "AppImage  : đã cài tại $INSTALL_DIR_APPIMAGE/AI.Type.AppImage"
        found=1
    fi
    if [ -x "/usr/local/bin/$BIN_NAME" ] || [ -x "$LOCAL_BIN/$BIN_NAME" ]; then
        log_ok "Lệnh $BIN_NAME : đã tạo"
    else
        log_warn "Lệnh $BIN_NAME : chưa tạo"
    fi
    if [ "$found" -eq 0 ]; then
        log_warn "AI.Type chưa được cài trên máy này."
        echo "       Chạy: bash install-ubuntu.sh"
    fi
}

# ============================================================
#  CHẾ ĐỘ 5: LIỆT KÊ BẢN BUILD KHẢ DỤNG
# ============================================================
show_list() {
    log_title "Các bản build Ubuntu có trong $DIST_DIR"
    echo -e "${C_B}Gói .deb:${C_R}"
    ls -1t "$DIST_DIR"/typing_*_amd64.deb 2>/dev/null | while read -r f; do
        echo "  $(basename "$f")  ($(du -m "$f" | cut -f1) MB)"
    done
    echo -e "${C_B}AppImage:${C_R}"
    ls -1t "$DIST_DIR"/AI.Type-*.AppImage 2>/dev/null | while read -r f; do
        echo "  $(basename "$f")  ($(du -m "$f" | cut -f1) MB)"
    done
    if [ ! -d "$DIST_DIR" ]; then
        log_warn "Không tìm thấy thư mục $DIST_DIR"
    fi
}

# ============================================================
#  Xử lý tham số dòng lệnh
# ============================================================
MODE="deb"
TARGET=""

for arg in "$@"; do
    case "$arg" in
        --appimage|-a) MODE="appimage" ;;
        --deb|-d)      MODE="deb" ;;
        --uninstall|--remove|-r) MODE="uninstall" ;;
        --status|-s)   MODE="status" ;;
        --list|-l)     MODE="list" ;;
        --help|-h)
            echo -e "${C_B}AI.Type - Trình cài đặt dòng lệnh cho Ubuntu${C_R}"
            echo ""
            echo "Dùng: bash install-ubuntu.sh [tùy-chọn] [đường-dẫn-file]"
            echo ""
            echo "Tùy chọn:"
            echo "  (không có)          Cài bản .deb mới nhất từ electron/dist"
            echo "  --deb, -d           Cài bản .deb (mặc định)"
            echo "  --appimage, -a      Cài bản AppImage mới nhất (không cần sudo)"
            echo "  --status, -s        Kiểm tra trạng thái cài đặt hiện tại"
            echo "  --list, -l          Liệt kê các bản build khả dụng"
            echo "  --uninstall, -r     Gỡ cài đặt AI.Type"
            echo "  --help, -h          Xem hướng dẫn"
            exit 0
            ;;
        *) TARGET="$arg" ;;
    esac
done

case "$MODE" in
    uninstall)
        uninstall_app
        ;;
    status)
        show_status
        ;;
    list)
        show_list
        ;;
    deb)
        if [ -z "$TARGET" ]; then
            TARGET="$(find_latest_deb)"
            [ -z "$TARGET" ] && { log_err "Không tìm thấy file .deb trong $DIST_DIR"; exit 1; }
        fi
        [ ! -f "$TARGET" ] && { log_err "Không tìm thấy file: $TARGET"; exit 1; }
        install_deb "$TARGET"
        ;;
    appimage)
        if [ -z "$TARGET" ]; then
            TARGET="$(find_latest_appimage)"
            [ -z "$TARGET" ] && { log_err "Không tìm thấy file .AppImage trong $DIST_DIR"; exit 1; }
        fi
        [ ! -f "$TARGET" ] && { log_err "Không tìm thấy file: $TARGET"; exit 1; }
        install_appimage "$TARGET"
        ;;
esac

if [ "$MODE" = "deb" ] || [ "$MODE" = "appimage" ]; then
    echo ""
    log_ok "HOÀN TẤT. Chạy lệnh: $BIN_NAME để mở AI.Type"
fi
