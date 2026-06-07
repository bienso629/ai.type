// Dùng chung cho cả cấu hình Video và Image
export interface VideoModelConfig {
    payloadFormat: 'nested_input' | 'flat' | 'google_sdk' | 'minimal_nested' | 'minimal_flat';
    promptKey: string;
    imageKey?: string;         // e.g., 'image_url', 'first_frame_image', 'image'
    endImageKey?: string;      // e.g., 'last_frame_image', 'image_end', 'end_image_url'
    useDataUri: boolean;       // true if 'data:image/png;base64,...' is required
    defaultDuration?: number;  // Only applicable for video models
    // Có thể cấu hình thêm các tham số tĩnh khác
    extraParams?: Record<string, any>;
}

export const MODELVERSE_CONFIGS: Record<string, VideoModelConfig> = {
    // ----------------------
    // VIDEO MODELS
    // ----------------------
    'sora': {
        payloadFormat: 'flat',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: false,
        defaultDuration: 5
    },
    // Kling Series (Kling-v3, Kling-O3, Kling-v3-Motion-Control)
    'kling': {
        payloadFormat: 'nested_input',
        promptKey: 'prompt',
        imageKey: 'image_url',       // Kling API thường dùng image_url
        endImageKey: 'last_frame_image',
        useDataUri: true,            // Thường cần Data URI
        defaultDuration: 5
    },
    // Vidu Series
    'vidu': {
        payloadFormat: 'nested_input',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: true,
        defaultDuration: 5
    },
    // Wan Series (Wan2.1, Wan2.5, Wan2.6, Wan2.7)
    'wan': {
        payloadFormat: 'nested_input',
        promptKey: 'prompt',
        imageKey: 'image',
        endImageKey: 'image_end',
        useDataUri: true,
        defaultDuration: 5
    },
    // Veo Series (Google Veo)
    'veo': {
        payloadFormat: 'google_sdk',  // Hoặc cấu trúc lồng nhau của google
        promptKey: 'prompt',
        imageKey: 'image',
        useDataUri: false,            // Veo dùng bytesBase64Encoded
        defaultDuration: 6
    },
    // Luma Series
    'luma': {
        payloadFormat: 'nested_input',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: true,
        defaultDuration: 5
    },
    // MiniMax Series (Hailuo)
    'minimax': {
        payloadFormat: 'nested_input',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: false,
        defaultDuration: 5
    },
    'hailuo': {
        payloadFormat: 'nested_input',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: false,
        defaultDuration: 5
    },
    // Doubao (Seedance / Seedream)
    'doubao': {
        payloadFormat: 'nested_input',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: true,
        defaultDuration: 5
    },
    // ----------------------
    // IMAGE MODELS
    // ----------------------
    'gemini': {
        payloadFormat: 'google_sdk',
        promptKey: 'prompt',
        imageKey: 'image',
        useDataUri: false
    },
    'flux': {
        payloadFormat: 'flat',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: false
    },
    'stepfun': {
        payloadFormat: 'nested_input',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: true
    },
    'qwen': {
        payloadFormat: 'flat',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: false
    },
    'gpt-image': {
        payloadFormat: 'flat',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: false
    },
    'midjourney': {
        payloadFormat: 'nested_input',
        promptKey: 'prompt',
        imageKey: 'image_url',
        useDataUri: false
    }
};

/**
 * Trả về config cho model name. Nếu model name là Kling-O3 thì prefix sẽ là kling.
 * Nếu không tìm thấy, trả về undefined.
 */
export function getModelverseConfig(modelName: string): VideoModelConfig | undefined {
    if (!modelName) return undefined;
    const lowerName = modelName.toLowerCase();
    
    // Tìm prefix trùng khớp trong danh sách config
    for (const prefix of Object.keys(MODELVERSE_CONFIGS)) {
        if (lowerName.includes(prefix)) {
            return MODELVERSE_CONFIGS[prefix];
        }
    }
    
    return undefined;
}

// ==========================================
// TEXT / CHAT MODEL CONFIGURATION
// ==========================================

export interface TextModelConfig {
    // API chuẩn: openai (mặc định), anthropic (claude), gemini, custom
    apiFormat: 'openai' | 'anthropic' | 'gemini' | 'custom';
    
    // Tên endpoint thay thế nếu không dùng /chat/completions mặc định
    endpointOverride?: string;
    
    // Sử dụng max_completion_tokens thay vì max_tokens (Thường dùng cho model reasoning như o1, o3, deepseek-reasoner)
    useMaxCompletionTokens?: boolean;
    
    // Các tham số extra tuỳ chỉnh (vd: { "search": true } cho doubao)
    extraParams?: Record<string, any>;
}

export const TEXT_MODEL_CONFIGS: Record<string, TextModelConfig> = {
    'claude': {
        apiFormat: 'anthropic',
        // endpointOverride: '/v1/messages', // Bỏ comment nếu Astraflow yêu cầu endpoint riêng cho Claude
    },
    'gemini': {
        apiFormat: 'gemini',
        // endpointOverride: '/v1beta/models/{model}:generateContent', // Bỏ comment nếu Astraflow yêu cầu endpoint riêng cho Gemini
    },
    'deepseek-reasoner': {
        apiFormat: 'openai',
        useMaxCompletionTokens: true
    },
    'o1': {
        apiFormat: 'openai',
        useMaxCompletionTokens: true
    },
    'o3': {
        apiFormat: 'openai',
        useMaxCompletionTokens: true
    },
    'doubao': {
        apiFormat: 'openai',
        // extraParams: { search_enabled: true } // Ví dụ nếu doubao cần param search
    }
};

/**
 * Trả về config text cho model name. Nếu không có, mặc định dùng chuẩn OpenAI.
 */
export function getTextModelConfig(modelName: string): TextModelConfig {
    if (modelName) {
        const lowerName = modelName.toLowerCase();
        for (const prefix of Object.keys(TEXT_MODEL_CONFIGS)) {
            if (lowerName.includes(prefix)) {
                return TEXT_MODEL_CONFIGS[prefix];
            }
        }
    }
    // Mặc định luôn là chuẩn OpenAI
    return { apiFormat: 'openai' };
}
