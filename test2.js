const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
    let win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true } });
    win.webContents.executeJavaScript(`
        const temp = document.createElement('div');
        temp.innerHTML = "<p>Chào anh em nhé! Hôm nay mình ngoi lên để mổ xẻ bản cập nhật mới nhất của OpenAI về dòng GPT-5.6. Không văn vở marketing dài dòng, dưới góc nhìn của một dev ngày ngày gõ phím và đốt tiền API, mình sẽ bóc tách xem bản release này thực sự có ý nghĩa gì với kiến trúc hệ thống của chúng ta.</p>";
        temp.innerText;
    `).then(result => {
        console.log("INNER_TEXT:", JSON.stringify(result));
        app.quit();
    });
});
