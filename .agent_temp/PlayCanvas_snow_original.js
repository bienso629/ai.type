var SnowAccumulation = pc.createScript('snowAccumulation');

// Các thuộc tính điều chỉnh trong Editor
SnowAccumulation.attributes.add('snowColor', { type: 'rgba', default:, title: 'Màu tuyết' });
SnowAccumulation.attributes.add('snowSpeed', { type: 'number', default: 0.05, title: 'Tốc độ tuyết dày lên' });
SnowAccumulation.attributes.add('snowDirection', { type: 'vec3', default:, title: 'Hướng tuyết rơi (Mặc định: Lên trên)' });

SnowAccumulation.prototype.initialize = function() {
    // Tìm Material gắn trên Entity này
    if (this.entity.render) {
        this.material = this.entity.render.meshInstances[0].material;
    } else if (this.entity.model) {
        this.material = this.entity.model.meshInstances[0].material;
    }

    if (!this.material) {
        console.error("Script này cần được gắn vào Entity có Render hoặc Model component!");
        return;
    }

    // Khởi tạo lượng tuyết ban đầu = 0
    this.snowAmount = 0;

    // Định nghĩa đoạn code Shader Custom (GLSL) để can thiệp vào vật liệu mặt đất
    // Chỉ những bề mặt có Vector Pháp tuyến (vNormalW) trùng với hướng tuyết rơi mới bị phủ trắng
    var snowDiffuseChunk = `
        uniform vec3 uSnowColor;
        uniform float uSnowAmount;
        uniform vec3 uSnowDir;

        void getAlbedo() {
            // Lấy màu gốc ban đầu của mặt đất (texture hoặc màu phẳng)
            dAlbedo = texture2D(texture_diffuseMap, vUv0).rgb * dDiffuseTexControls.rgb;
            
            // Tính toán góc giữa bề mặt vật thể và hướng tuyết rơi
            float dotProduct = dot(vNormalW, normalize(uSnowDir));
            
            // Nếu bề mặt hướng lên trên (dotProduct > 0), tính toán độ phủ tuyết
            float snowFactor = smoothstep(0.3, 0.8, dotProduct) * uSnowAmount;
            
            // Trộn màu gốc của mặt đất với màu trắng của tuyết dựa trên độ dày (snowFactor)
            dAlbedo = mix(dAlbedo, uSnowColor, snowFactor);
        }
    `;

    // Thay thế hàm tính toán màu sắc gốc của PlayCanvas bằng đoạn code trên
    this.material.chunks.diffusePS = snowDiffuseChunk;
    this.material.update();
};

SnowAccumulation.prototype.update = function(dt) {
    if (!this.material) return;

    // Tăng dần độ dày của tuyết theo thời gian nhưng giới hạn tối đa là 1.0 (phủ trắng hoàn toàn)
    if (this.snowAmount < 1.0) {
        this.snowAmount += this.snowSpeed * dt;
    }

    // Truyền các tham số từ Script vào trong Shader để GPU xử lý đồ họa
    var gd = this.app.graphicsDevice;
    gd.scope.resolve('uSnowColor').setValue(new Float32Array([this.snowColor.r, this.snowColor.g, this.snowColor.b]));
    gd.scope.resolve('uSnowAmount').setValue(this.snowAmount);
    gd.scope.resolve('uSnowDir').setValue(this.snowDirection.data);
};

