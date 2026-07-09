# Tài liệu Hướng Dẫn Sử Dụng Hệ Thống

## Module: SETTINGS

### Màn hình: account.component.html
**Các trường thông tin (Inputs/Labels):**
- Type.VN URL
**Các nút thao tác (Buttons):**
- {{ showUmodelverseKey ? 'visibility_off' :                                         'visibility' }}
- {{ geminiKeysVisibility[i] ? 'visibility_off' :                                         'visibility' }}
- {{ showSearchAPIKey ? 'visibility_off' : 'visibility'                                     }}

### Màn hình: notifications.component.html
**Chức năng chính / Tiêu đề:**
- Account Activity
- Alerts
**Các nút thao tác (Buttons):**
- Cancel
- Save

### Màn hình: team.component.html
**Các trường thông tin (Inputs/Labels):**
- Add team members

### Màn hình: active.component.html
**Các nút thao tác (Buttons):**
- Thêm ngày sử dụng

### Màn hình: admin.component.html
**Các nút thao tác (Buttons):**
- Backup Database
- 0" mat-flat-button color="primary"                             (click)="sendEmailToSelected()" [disabled]="isSendingEmail">                                                           ()
- 0" mat-flat-button color="warn"                             (click)="deleteSelectedWorkflows()" [disabled]="n8nLoading">                                                           ()

### Màn hình: security.component.html
**Chức năng chính / Tiêu đề:**
- Security preferences
- Change your password
**Các trường thông tin (Inputs/Labels):**
- New password
- Current password
**Các nút thao tác (Buttons):**
- Cancel
- Save

## Module: DOMAIN

### Màn hình: login.component.html
**Chức năng chính / Tiêu đề:**
- Kết nối tới
**Các trường thông tin (Inputs/Labels):**
- Kết nối tới
**Các nút thao tác (Buttons):**
- Đóng cửa sổ

## Module: ADMIN

### Màn hình: license-keys.component.html
**Các trường thông tin (Inputs/Labels):**
- Gia hạn
- License Key
- Chọn gói gia hạn
- Xác nhận gia hạn
**Các nút thao tác (Buttons):**
- Xác nhận gia hạn

## Module: LICENSE-KEYS

### Màn hình: create.component.html
**Các trường thông tin (Inputs/Labels):**
- Thêm mới License Key
- Cập nhật License Key
**Các nút thao tác (Buttons):**
- Thêm mới License Key       Cập nhật License Key

## Module: CONTENT

### Màn hình: ai-nodes.component.html
**Các trường thông tin (Inputs/Labels):**
- 0" class="ml-2 h-7 leading-7 items-center cursor-pointer px-3 rounded-full text-sm font-semibold bg-red-500 hover:bg-red-600 text-white">                                 Xuất dữ liệu

### Màn hình: ai-image.component.html
**Các nút thao tác (Buttons):**
- 0"                                                 [svgIcon]="referenceFiles.length > 0 ? 'heroicons_solid:paper-clip' : 'heroicons_outline:paper-clip'">

### Màn hình: sitemap.component.html
**Các nút thao tác (Buttons):**
- 0" (click)="editAllSelected()">

### Màn hình: collection.component.html
**Các trường thông tin (Inputs/Labels):**
- = 0"> lần
**Các nút thao tác (Buttons):**
- 0" mat-stroked-button color="warn"                                                 class="ml-4 h-8" (click)="removeSelectedFromCollection()">

### Màn hình: ai-tts.component.html
**Các nút thao tác (Buttons):**
- 0" mat-icon-button                         class="text-red-500 hover:bg-red-50 hover:text-red-600 w-8 h-8 min-h-8 flex items-center justify-center ml-1"                         (click)="attachedVideoFiles = []" [matTooltip]="'app.auto_delete_attachment' | transloco">                         close
- voice_chat
- 0" class="ml-2">
- 0"                             class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-semibold z-10">
- 0"                                 [matTooltip]="'app.auto_refresh_content' | transloco">

### Màn hình: ai-writer.component.html
**Các trường thông tin (Inputs/Labels):**
- p
- label                                                     ()
- File(s)
- h4 ()
- {{                                             seo.words.mainkey_percent_in_words | number:'1.0-0' }}%
- chuyển ()
- xoá ()
- Tìm thấy  từ khoá                                                     trong bài.
- (/600)
- ()
- H1
- ({{                                             seo.words.mainkey_percent_in_words | number:'1.0-0' }}%)
- Cần có /600 từ, {{ seo['links']                                                             }}/5 link, {{                                                             seo['heading']['h1'] + seo['heading']['h2'] }}/3 , {{                                                             seo['images'] }}/1
- (/160 ký tự)
- Click để tạo tập mới:
- [clear all]
- dòng
- h1 ()
- span                                                     ()
- (/60 ký tự)
- Dựng kịch bản
- Giải nghĩa ''
- Content đang phát triển                                             (/1000 từ)
- h2 ()
- Tạo thành                                              bài
- h3 ()
- đề
- h5 ()
- /60 ký tự
**Các nút thao tác (Buttons):**
- = -1) ? 'feather:check' : 'feather:plus'">
- more_horiz
- = 0" mat-menu-item (click)="share()"                                         [matMenuTriggerFor]="forumActions">
- File(s)
- Sửa
- Hỏi về '
- Bôi đen
- Dựng kịch bản
- Tạo thành                                              bài
- Giải nghĩa ''
- switch_access_shortcut_add
- Từ khoá
- HTML code

### Màn hình: synonym.component.html
**Các nút thao tác (Buttons):**
- = 100000">

### Màn hình: archives.component.html
**Các trường thông tin (Inputs/Labels):**
- :
- = 0">
**Các nút thao tác (Buttons):**
- Unselect all
- Select all

### Màn hình: ai-crawl.component.html
**Các trường thông tin (Inputs/Labels):**
- Export/Import Links
**Các nút thao tác (Buttons):**
- -->

## Module: AI-IMAGE

### Màn hình: image-editor.component.html
**Các trường thông tin (Inputs/Labels):**
- Height
- Width
- Nội dung
- Cao (px)
**Các nút thao tác (Buttons):**
- 4:5                         (Facebook)
- = history.length - 1"                 [matTooltip]="'app.auto_redo_ctrl_y' | transloco">
- 16:9                         (YouTube)
- 9:16                         (TikTok)
- FB Link                         (1200x628)

## Module: ALL-TUBE

### Màn hình: scan.component.html
**Các trường thông tin (Inputs/Labels):**
- Nghe audio

## Module: AI-TTS

### Màn hình: director-mode.component.html
**Các nút thao tác (Buttons):**
- {{ data.targetName === 'Apply to         Master Prompt' ? 'Áp dụng vào Master Prompt' : (data.targetName         === 'Apply to Scene Prompt' ? 'Áp dụng vào Phân cảnh' : 'Áp dụng') }}

### Màn hình: video-timeline-dialog.component.html
**Chức năng chính / Tiêu đề:**
- {{                 projectData?.title || projectData?.extraPrompt || 'Thiết kế video' }}
**Các nút thao tác (Buttons):**
- settings
- {{ activeItem ? (isPreviewPlaying ? 'pause' : 'play_arrow') :                     (isPlayingTimeline ? 'pause' : 'play_arrow') }}
- {{                                                 audio.disabled ? 'visibility_off' : 'visibility' }}
- {{ video.muted ?                                                         'volume_off' :                                                         'volume_up' }}
- {{                                                 sub.disabled ? 'visibility_off' : 'visibility' }}
- content_cut
- voice_chat
- {{                                                         video.disabled ? 'visibility_off' : 'visibility' }}
- {{ video.videoUrl ? 'play_arrow' :                                                     'image' }}
- music_note
- movie
- delete_forever
- upload_file
- auto_awesome

### Màn hình: edit-scene-prompt-dialog.component.html
**Các nút thao tác (Buttons):**
- more_horiz
- record_voice_over
- add_photo_alternate
- upload_file
- close
- auto_awesome

### Màn hình: video-project-config-dialog.component.html
**Các nút thao tác (Buttons):**
- edit
- movie_creation
- person_add
- delete
- content_copy                                     autorenew
- {{ isEditingMasterPrompt ? 'check' : 'edit'                     }}                 autorenew

### Màn hình: controlnet-dialog.component.html
**Các nút thao tác (Buttons):**
- add_photo_alternate
- movie
- close
- auto_awesome
- brush

### Màn hình: character-dialog.component.html
**Các nút thao tác (Buttons):**
- more_horiz
- auto_awesome                     autorenew
- add_photo_alternate
- upload_file
- close
- auto_awesome

## Module: TOOLS

### Màn hình: node-editor.component.html
**Các nút thao tác (Buttons):**
- mic
- person
- movie_filter
- movie
- add
- flip_to_back                         Frame cuối cùng
- flip_to_front                         Frame đầu tiên
- movie                                         Render
- add_circle_outline
- auto_fix_high
- image                                 autorenew
- format_align_center
- 0)" [src]="getSafeUrl(char.avatarUrl || char.avatarUrls[0])" class="w-full h-full object-cover">                                     person
- image
- image                         Hình ảnh
- person_add
- add_circle_outline                 Tạo Scene Trống
- Không có khối Hình ảnh nào đang chờ
- swap_horiz
- movie                                 autorenew
- person                                                                                                                                                             upload
- mic                         Chèn thoại (voice)

### Màn hình: mock-dark-prompt.html
**Các nút thao tác (Buttons):**
- post_add
- /
- arrow_upward
- add

### Màn hình: magic-prompt-dialog.component.html
**Các nút thao tác (Buttons):**
- auto_fix_high             autorenew
- delete

## Module: ARCHIVES

### Màn hình: wp2md.component.html
**Các trường thông tin (Inputs/Labels):**
- Read file
**Các nút thao tác (Buttons):**
- Read file

## Module: MARKETING

### Màn hình: gologin.component.html
**Các trường thông tin (Inputs/Labels):**
- Đã tắt

### Màn hình: x-cms.component.html
**Các trường thông tin (Inputs/Labels):**
- Gửi tin nhắn tới  khách hàng

### Màn hình: seo-report.component.html
**Chức năng chính / Tiêu đề:**
- {{ gaSummary.engagementRate * 100                                         | number:'1.1-2' }}%
- {{ gaSummary.totalUsers | number                                         }}
- {{ gaSummary.screenPageViews |                                         number }}
- %
**Các trường thông tin (Inputs/Labels):**
- GA4 property ID
- Domain
- Từ

### Màn hình: seo-links.component.html
**Các trường thông tin (Inputs/Labels):**
- link(s)
- -                                              (                                             links)

### Màn hình: chatbot.component.html
**Các trường thông tin (Inputs/Labels):**
- (/ {{ statusIndex.status                                 }})

## Module: N8N

### Màn hình: share.component.html
**Các nút thao tác (Buttons):**
- 0"                                 class="text-red-500 hover:text-red-700 hover:bg-red-50 flex items-center justify-center transition-colors"                                 (click)="shareForm.get('pageIds').setValue([]); $event.stopPropagation()"                                 [matTooltip]="'app.deselect_all' | transloco">

### Màn hình: script.component.html
**Các trường thông tin (Inputs/Labels):**
- {{                                 row.text                                 }}
- {{                             room["nickname"] }}
- {{                             room["title"] ||                             "Không tiêu                             đề"                             }}
- {{                             room["user_count"]                             }}
- Link video TikTok
**Các nút thao tác (Buttons):**
- Gửi sang N8N ()
- Đóng

## Module: GOLOGIN

### Màn hình: dialog.links.profile.html
**Các nút thao tác (Buttons):**
- Đóng cửa sổ

## Module: CHATBOT

### Màn hình: index-domains-dialog.component.html
**Các nút thao tác (Buttons):**
- Đóng

### Màn hình: file-list-dialog.component.html
**Các trường thông tin (Inputs/Labels):**
- {{ row.doc_type === 'None' ? ('app.default' | transloco) : row.doc_type                 }}
- {{ row.filename                 }}

### Màn hình: setting-chatbot-dialog.component.html
**Các nút thao tác (Buttons):**
- Đóng

### Màn hình: doc-type-dialog.component.html
**Các nút thao tác (Buttons):**
- Đóng

