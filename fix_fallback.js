const fs = require('fs');
let file = 'src/app/modules/admin/account/settings/plugins/plugins.component.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `            const tiktokPlugin = this.plugins.find(p => p.id === 'tiktok_100');
            if (tiktokPlugin) tiktokPlugin.enabled = settings.tiktokPluginEnabled || false;`;

const replacement = `            const tiktokPlugin = this.plugins.find(p => p.id === 'tiktok_100');
            if (tiktokPlugin) tiktokPlugin.enabled = settings.tiktokPluginEnabled || false;
            
            const colabAgentPlugin = this.plugins.find(p => p.id === 'colab_agent');
            if (colabAgentPlugin) colabAgentPlugin.enabled = settings.colabPluginEnabled || false;`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content, 'utf8');
