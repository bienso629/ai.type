import re
import sys

file_path = '/Users/yennguyen/Documents/projects/typing/ai.type/src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace constructor
old_constructor = """    constructor(
        public dialogRef: MatDialogRef<VideoTimelineDialogComponent>,
        private clipboard: Clipboard,
        private multiAccountService: MultiAccountService,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private dialog: MatDialog,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private sanitizer: DomSanitizer
    ) { }"""

new_constructor = """    public data: any = {};
    constructor(
        private route: ActivatedRoute,
        private clipboard: Clipboard,
        private multiAccountService: MultiAccountService,
        private toastr: ToastrService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private dialog: MatDialog,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private sanitizer: DomSanitizer
    ) { 
        this.data.uuid = this.route.snapshot.paramMap.get('uuid');
        this.data.username = this.route.snapshot.paramMap.get('name');
    }"""

if old_constructor in content:
    content = content.replace(old_constructor, new_constructor)
else:
    print("Constructor not found")
    sys.exit(1)

# Add ActivatedRoute to imports
if "import { ActivatedRoute" not in content:
    content = content.replace("import { Router } from '@angular/router';", "import { Router, ActivatedRoute } from '@angular/router';")

# Replace dialogRef.close
content = content.replace("this.dialogRef.close(this.projectData);", "this.goBack();")
content = content.replace("this.dialogRef.close();", "this.goBack();")

# Add goBack method
go_back_method = """
    goBack() {
        this.router.navigate(['../../'], { relativeTo: this.route });
    }
"""
content = content.replace("    ngOnInit() {", go_back_method + "    ngOnInit() {\n        this.data.uuid = this.route.snapshot.paramMap.get('uuid');\n        this.data.username = this.route.snapshot.paramMap.get('name');\n        if (!this.data.uuid) { this.goBack(); return; }\n")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated successfully")
