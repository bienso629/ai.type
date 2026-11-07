#!/usr/bin/env bash
# ============================================================
#  AI.Type - Script cai dat cho Ubuntu (command line)
#  Cai ban .deb hoac .AppImage vua build tu electron/dist
#
#  Cach dung:
#    bash install-ubuntu.sh              (tu tim ban .deb moi nhat)
#    bash install-ubuntu.sh --appimage   (cai bang AppImage)
#    bash install-ubuntu.sh <duong-dan-file.deb|AppImage>
#
#  Sau khi cai xong, chay lenh:  aitype
# ============================================================
set -euo pipefail

# --- Cau hinh ---
BIN_NAME="aitype"
DESKTOP_FILE="ai-type.desktop"
INSTALL_DIR_APPIMAGE="$HOME/.local/opt/ai.type"
LOCAL_BIN="$HOME/.local/bin"
LOCAL_APPS="$HOME/.local/share/applications"

# --- Mau sac ---
C_R="\033[0m"; C_G="\033[32m"; C_Y="\033[33m"; C_C="\033[36m"; C_RED="\033[31m"
log_ok()   { echo -e "${C_G}[OK]${C_R} $1"; }
log_info() { echo -e "${C_C}[..]${C_R} $1"; }
log_warn() { echo -e "${C_Y}[!]${C_R} $1"; }
log_err()  { echo -e "${C_RED}[LOI]${C_R} $1"; }

# --- Thu muc chua ban build (tinh tu vi tri script) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/electron/dist"

# --- Tim ban cai dat moi nhat ---
find_latest_deb() {
    ls -1t "$DIST_DIR"/typing_*_amd64.deb 2>/dev/null | head -1 || true
}
find_latest_appimage() {
    ls -1t "$DIST_DIR"/AI.Type-*.AppImage 2>/dev/null | head -1 || true
}

# --- Kiem tra ban dang chay de thoat truoc khi ghi de ---
close_running_app() {
    if pgrep -f "/opt/AI.Type/typing" > /dev/null 2>&1 || pgrep -f "AI.Type-.*AppImage" > /dev/null 2>&1; then
        log_warn "Phat hien AI.Type dang chay. Dang dong ung dung..."
        pkill -f "/opt/AI.Type/typing" 2>/dev/null || true
        pkill -f "AI.Type-.*AppImage" 2>/dev/null || true
        sleep 2
    fi
}

# ============================================================
#  CHE DO 1: CAI BANG GOI .DEB (khuyen dung - tich hop sau)
# ============================================================
install_deb() {
    local deb_file="$1"
    log_info "Cai goi .deb: $deb_file"
    close_running_app
    if ! command -v dpkg > /dev/null 2>&1; then
        log_err "Khong tim thay dpkg. May nay co phai Ubuntu/Debian khong?"
        exit 1
    fi
    sudo dpkg -i "$deb_file" || {
        log_warn "Thieu thu vien phu thuoc, dang tu dong cai bo sung..."
        sudo apt-get install -f -y
    }
    log_ok "Da cai vao /opt/AI.Type"

    # Tao lenh rut gon 'aitype'
    sudo tee /usr/local/bin/$BIN_NAME > /dev/null << 'BIN'
#!/usr/bin/env bash
exec /opt/AI.Type/typing --no-sandbox "$@"
BIN
    sudo chmod +x /usr/local/bin/$BIN_NAME
    log_ok "Da tao lenh: $BIN_NAME (go trong terminal de mo ung dung)"

    # Dam bao file .desktop duoc nhan (desktop cua electron-builder da tao)
    if [ -f /usr/share/applications/typing.desktop ]; then
        sudo update-desktop-database /usr/share/applications 2>/dev/null || true
        log_ok "Menu ung dung da cap nhat (tim: AI.Type)"
    fi
}

# ============================================================
#  CHE DO 2: CAI BANG .APPIMAGE (khong can sudo)
# ============================================================
install_appimage() {
    local app_file="$1"
    log_info "Cai AppImage: $app_file"
    close_running_app
    mkdir -p "$INSTALL_DIR_APPIMAGE" "$LOCAL_BIN" "$LOCAL_APPS"
    cp -f "$app_file" "$INSTALL_DIR_APPIMAGE/AI.Type.AppImage"
    chmod +x "$INSTALL_DIR_APPIMAGE/AI.Type.AppImage"
    log_ok "Da copy vao $INSTALL_DIR_APPIMAGE/AI.Type.AppImage"

    # Lenh rut gon
    cat > "$LOCAL_BIN/$BIN_NAME" << BIN
#!/usr/bin/env bash
exec "$INSTALL_DIR_APPIMAGE/AI.Type.AppImage" --no-sandbox "\$@"
BIN
    chmod +x "$LOCAL_BIN/$BIN_NAME"
    log_ok "Da tao lenh: $BIN_NAME"

    # File .desktop cho menu ung dung
    cat > "$LOCAL_APPS/$DESKTOP_FILE" << DESK
[Desktop Entry]
Name=AI.Type
Comment=Ung dung quan ly cong viec va tao noi dung
Exec=$INSTALL_DIR_APPIMAGE/AI.Type.AppImage --no-sandbox %U
Terminal=false
Type=Application
Categories=Office;
StartupWMClass=AI.Type
DESK
    update-desktop-database "$LOCAL_APPS" 2>/dev/null || true
    log_ok "Da them vao menu ung dung (tim: AI.Type)"
    log_info "Luu y: AppImage khong tao icon he thong va khong tu dong cap nhat."
}

# ============================================================
#  CHE DO 3: GO CAI DAT
# ============================================================
uninstall_app() {
    log_info "Go cai dat AI.Type..."
    close_running_app
    if [ -d /opt/AI.Type ]; then
        sudo dpkg -r typing 2>/dev/null || sudo rm -rf /opt/AI.Type
        sudo rm -f /usr/local/bin/$BIN_NAME /usr/share/applications/typing.desktop
        log_ok "Da go ban cai .deb"
    fi
    if [ -d "$INSTALL_DIR_APPIMAGE" ]; then
        rm -rf "$INSTALL_DIR_APPIMAGE"
        rm -f "$LOCAL_BIN/$BIN_NAME" "$LOCAL_APPS/$DESKTOP_FILE"
        log_ok "Da go ban AppImage"
    fi
    log_ok "Hoan tat go cai dat"
}

# ============================================================
#  Xu ly tham so dong lenh
# ============================================================
MODE="deb"
TARGET=""

for arg in "$@"; do
    case "$arg" in
        --appimage|-a) MODE="appimage" ;;
        --deb|-d)      MODE="deb" ;;
        --uninstall|--remove|-r) MODE="uninstall" ;;
        --help|-h)
            echo "Dung: bash install-ubuntu.sh [tuy-chon] [duong-dan-file]"
            echo ""
            echo "Tuy chon:"
            echo "  (khong co)          Cai ban .deb moi nhat tu electron/dist"
            echo "  --appimage, -a      Cai ban AppImage moi nhat (khong can sudo)"
            echo "  --deb, -d           Cai ban .deb (mac dinh)"
            echo "  --uninstall, -r     Go cai dat AI.Type"
            echo "  --help, -h          Xem huong dan"
            exit 0
            ;;
        *) TARGET="$arg" ;;
    esac
done

case "$MODE" in
    uninstall)
        uninstall_app
        ;;
    deb)
        if [ -z "$TARGET" ]; then
            TARGET="$(find_latest_deb)"
            [ -z "$TARGET" ] && { log_err "Khong tim thay file .deb trong $DIST_DIR"; exit 1; }
        fi
        [ ! -f "$TARGET" ] && { log_err "Khong tim thay file: $TARGET"; exit 1; }
        install_deb "$TARGET"
        ;;
    appimage)
        if [ -z "$TARGET" ]; then
            TARGET="$(find_latest_appimage)"
            [ -z "$TARGET" ] && { log_err "Khong tim thay file .AppImage trong $DIST_DIR"; exit 1; }
        fi
        [ ! -f "$TARGET" ] && { log_err "Khong tim thay file: $TARGET"; exit 1; }
        install_appimage "$TARGET"
        ;;
esac

echo ""
log_ok "CAI DAT HOAN TAT. Chay lenh: $BIN_NAME de mo AI.Type"
