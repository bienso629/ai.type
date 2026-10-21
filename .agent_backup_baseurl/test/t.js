    function resolveApiBase(url) {
        let base = (url || '').trim();
        if (base && !/^https?:\/\//i.test(base)) base = 'https://' + base;
        base = base.replace(/\/+$/, '')
            .replace(/\/chat\/completions$/i, '')
            .replace(/\/messages$/i, '')
            .replace(/\/models$/i, '')
            .replace(/\/+$/, '');
        let origin = base;
        let segments = [];
        try {
            const parsed = new URL(base);
            origin = parsed.origin;
            segments = parsed.pathname.split('/').filter(Boolean);
        } catch {
            return { versioned: `${base}/v1`, root: base };
        }
        const versionIdx = segments.findIndex(seg => /^v\d+[a-z0-9.]*$/i.test(seg));
        if (versionIdx < 0) {
            return { versioned: `${base}/v1`, root: base };
        }
        const rootPath = segments.slice(0, versionIdx).join('/');
        return { versioned: base, root: rootPath ? `${origin}/${rootPath}` : origin };
    }

const cases=[
 'https://api.openai.com/v1','https://openrouter.ai/api/v1','https://api.groq.com/openai/v1','https://api.deepseek.com',
 'http://localhost:11434/v1','https://dashscope.aliyuncs.com/compatible-mode/v1','https://api.anthropic.com/v1',
 'https://generativelanguage.googleapis.com/v1beta/openai','https://open.bigmodel.cn/api/paas/v4','https://ark.cn-beijing.volces.com/api/v3',
 'https://api.mitom.ai/v1','https://api.mitom.ai','https://api.mitom.ai/v1/chat/completions','api.deepseek.com/','https://api.mitom.ai/v1beta',
 'https://api.openai.com/v1/','https://api.together.xyz/v1','https://api.mistral.ai/v1','https://api.x.ai/v1','https://api.moonshot.cn/v1'];
for(const c of cases){const r=resolveApiBase(c);console.log(c.padEnd(56),'=> chat:',r.versioned+'/chat/completions','| root:',r.root);}
