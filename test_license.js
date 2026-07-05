const { License } = require('licensekey');
const info = new License({
    info: { customerName: "A", email: "B" },
    appToken: "",
    appId: "A",
    appVersion: "1"
});
console.log(info);
