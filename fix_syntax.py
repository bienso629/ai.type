import os

def fix_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements.items():
        content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

dashboard = 'src/app/modules/admin/account/dashboard/dashboard.component.html'
dashboard_repl = {
    "{{project.title || '{{ 'app.new_project' | transloco }}'}}": "{{ project.title || ('app.new_project' | transloco) }}"
}

admin = 'src/app/modules/admin/account/settings/admin/admin.component.html'
admin_repl = {
    "{{ value || '{{ 'app.none' | transloco }}' }}": "{{ value || ('app.none' | transloco) }}",
    "[label]=\"'app.license_keys' | transloco\"": "[label]=\"('app.license_keys' | transloco)\"",
    "[label]=\"'app.n8n_workflows' | transloco\"": "[label]=\"('app.n8n_workflows' | transloco)\"",
    "[label]=\"'app.plugin' | transloco\"": "[label]=\"('app.plugin' | transloco)\"",
    "[label]=\"'app.help' | transloco\"": "[label]=\"('app.help' | transloco)\"",
    "[name]=\"'app.workflow_name' | transloco\"": "[name]=\"('app.workflow_name' | transloco)\"",
    "[name]=\"'app.status' | transloco\"": "[name]=\"('app.status' | transloco)\"",
    "[name]=\"'app.updated' | transloco\"": "[name]=\"('app.updated' | transloco)\"",
    "[name]=\"'app.customer' | transloco\"": "[name]=\"('app.customer' | transloco)\"",
    "[name]=\"'app.writing' | transloco\"": "[name]=\"('app.writing' | transloco)\"",
    "[name]=\"'app.completed' | transloco\"": "[name]=\"('app.completed' | transloco)\"",
    "[name]=\"'app.ask_chatgpt' | transloco\"": "[name]=\"('app.ask_chatgpt' | transloco)\"",
    "[name]=\"'app.royalties' | transloco\"": "[name]=\"('app.royalties' | transloco)\"",
    "[name]=\"'app.member_name' | transloco\"": "[name]=\"('app.member_name' | transloco)\"",
    "[name]=\"'app.articles' | transloco\"": "[name]=\"('app.articles' | transloco)\"",
    "[name]=\"'app.group' | transloco\"": "[name]=\"('app.group' | transloco)\"",
    "[name]=\"'app.reputation' | transloco\"": "[name]=\"('app.reputation' | transloco)\"",
    "[name]=\"'app.join_date' | transloco\"": "[name]=\"('app.join_date' | transloco)\"",
    "[matTooltip]=\"'app.delete_this_workflow' | transloco\"": "[matTooltip]=\"('app.delete_this_workflow' | transloco)\"",
    "[placeholder]=\"'app.search_by_name_or_email' | transloco\"": "[placeholder]=\"('app.search_by_name_or_email' | transloco)\"",
    "[placeholder]=\"'app.nodebb_group' | transloco\"": "[placeholder]=\"('app.nodebb_group' | transloco)\""
}

fix_file(dashboard, dashboard_repl)
fix_file(admin, admin_repl)
print("Fixed files")
