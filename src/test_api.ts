import { AuthUtils } from './app/core/auth/auth.utils';
import { HelperService } from './app/helper.service';


const user = {
    id: 1,
    name: "admin",
    email: "noreply.typing.vn@gmail.com",
    server: "vn.s1",
    postcount: 127,
    reputation: 100000004,
    avatar: "https://type.vn/assets/uploads/profile/uid-1/1-profileavatar-1736344301967.png",
    status: "online",
    groups: [
        "lập-trình-ai-type",
        "nhóm-big-data",
        "nhóm-chạy-traffic",
        "nhóm-download-video",
        "nhóm-dreamina-ai",
        "nhóm-quét-sitemap",
        "nhóm-seo-và-phân-tích",
        "nhóm-thu-thập-dữ-liệu",
        "nhóm-txt2voice",
        "nhóm-tạo-hình-ảnh",
        "nhóm-tự-động-hóa",
        "nhóm-video2content",
        "nhóm-x-cms",
        "nhóm-đã-mua-ai-type",
        "nhóm-đã-mua-chatbot"
    ]
};

const jwt = AuthUtils._generateJWTToken(user);
const helper = new HelperService();
const gen = '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8';

const dataForm = {
    year: 2023,
    reportYear: 2026,
    appId: 'ai.typing',
    username: user.name,
};

const encryptedParams = helper.encrypt(dataForm, gen);

fetch('https://apiv1.type.vn/v1/crawl/statistics/all', {
    method: 'POST',
    body: JSON.stringify({ params: encryptedParams }),
    headers: {
        'Authorization': 'Bearer ' + jwt,
        'Content-Type': 'application/json'
    }
}).then(res => res.json()).then(data => {
    console.log('SUCCESS:', data);
}).catch(err => {
    console.log('ERROR:', err);
});
