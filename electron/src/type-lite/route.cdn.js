const Router = require("express");
const request = require("request").defaults({ encoding: null });
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const url = require("url");
const axios = require("axios");
const parseString = require("xml2js").parseString;

const Base64 = {
  _keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
  encode: function (e) {
    var t = "";
    var n, r, i, s, o, u, a;
    var f = 0;
    e = Base64._utf8_encode(e);
    while (f < e.length) {
      n = e.charCodeAt(f++);
      r = e.charCodeAt(f++);
      i = e.charCodeAt(f++);
      s = n >> 2;
      o = ((n & 3) << 4) | (r >> 4);
      u = ((r & 15) << 2) | (i >> 6);
      a = i & 63;
      if (isNaN(r)) {
        u = a = 64;
      } else if (isNaN(i)) {
        a = 64;
      }
      t =
        t +
        this._keyStr.charAt(s) +
        this._keyStr.charAt(o) +
        this._keyStr.charAt(u) +
        this._keyStr.charAt(a);
    }
    return t;
  },
  decode: function (e) {
    var t = "";
    var n, r, i;
    var s, o, u, a;
    var f = 0;
    e = e.replace(/[^A-Za-z0-9\+\/\=]/g, "");
    while (f < e.length) {
      s = this._keyStr.indexOf(e.charAt(f++));
      o = this._keyStr.indexOf(e.charAt(f++));
      u = this._keyStr.indexOf(e.charAt(f++));
      a = this._keyStr.indexOf(e.charAt(f++));
      n = (s << 2) | (o >> 4);
      r = ((o & 15) << 4) | (u >> 2);
      i = ((u & 3) << 6) | a;
      t = t + String.fromCharCode(n);
      if (u != 64) {
        t = t + String.fromCharCode(r);
      }
      if (a != 64) {
        t = t + String.fromCharCode(i);
      }
    }
    t = Base64._utf8_decode(t);
    return t;
  },
  _utf8_encode: function (e) {
    e = e.replace(/\r\n/g, "\n");
    var t = "";
    for (var n = 0; n < e.length; n++) {
      var r = e.charCodeAt(n);
      if (r < 128) {
        t += String.fromCharCode(r);
      } else if (r > 127 && r < 2048) {
        t += String.fromCharCode((r >> 6) | 192);
        t += String.fromCharCode((r & 63) | 128);
      } else {
        t += String.fromCharCode((r >> 12) | 224);
        t += String.fromCharCode(((r >> 6) & 63) | 128);
        t += String.fromCharCode((r & 63) | 128);
      }
    }
    return t;
  },
  _utf8_decode: function (e) {
    var t = "";
    var n = 0;
    var r = (c1 = c2 = 0);
    while (n < e.length) {
      r = e.charCodeAt(n);
      if (r < 128) {
        t += String.fromCharCode(r);
        n++;
      } else if (r > 191 && r < 224) {
        c2 = e.charCodeAt(n + 1);
        t += String.fromCharCode(((r & 31) << 6) | (c2 & 63));
        n += 2;
      } else {
        c2 = e.charCodeAt(n + 1);
        c3 = e.charCodeAt(n + 2);
        t += String.fromCharCode(
          ((r & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63),
        );
        n += 3;
      }
    }
    return t;
  },
};

const createCDNRouter = ({ dataPath }) => {
  const CDNRouter = Router();

  // google trả về trend hàng giờ
  CDNRouter.get("/trend", (req, res) => {
    request(
      { url: "https://trends.google.com/trending/rss?geo=VN", method: "GET" },
      (error, response, body) => {
        if (error) {
          console.error("Error: " + error);
          res.send([]);
        } else {
          parseString(body, (error, result) => {
            res.send(result.rss.channel[0]["item"]);
          });
        }
      },
    );
  });

  // google trả kết quả tìm kiếm
  CDNRouter.post("/google/search", (req, res) => {
    const searchAPIKey = req.body.searchAPIKey;
    const query = req.body.query;
    const CX = searchAPIKey[req.body.index].split(":")[0];
    const API_KEY = searchAPIKey[req.body.index].split(":")[1];
    const searchType = req.body.searchType;

    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${API_KEY}&cx=${CX}${searchType ? "&searchType=" + searchType : ""}`;
    axios
      .get(url)
      .then((response) => {
        const items = response.data.items;
        res.send(items);
      })
      .catch((error) => {
        res.send([]);
      });
  });

  // duyệt files trong thư mục nhất định và sắp xếp theo ngày tháng
  CDNRouter.post("/files", (req, res) => {
    const username = req.body.username;
    const folder = req.body.folder;
    const basePath = folder
      ? path.join(dataPath, "uploads", folder, username)
      : path.join(dataPath, "uploads", username);

    // Hàm đọc file đệ quy có lấy thông tin thời gian
    function getAllFiles(dirPath, arrayOfFiles = []) {
      const files = fs.readdirSync(dirPath);

      files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          getAllFiles(fullPath, arrayOfFiles);
        } else {
          // Lưu cả đường dẫn và thời gian sửa đổi (mtime)
          arrayOfFiles.push({
            path: fullPath,
            mtime: stats.mtime,
          });
        }
      });

      return arrayOfFiles;
    }

    try {
      let fileObjects = getAllFiles(basePath).filter(
        (item) => !/(^|\/)\.[^\/\.]/g.test(item.path),
      );

      // Sắp xếp: File mới nhất lên đầu (descending)
      // Nếu muốn cũ nhất lên đầu, hãy dùng a.mtime - b.mtime
      fileObjects.sort((a, b) => b.mtime - a.mtime);

      // Trả về danh sách chỉ gồm đường dẫn file như format cũ
      const sortedFiles = fileObjects.map((file) => file.path);

      res.send({ files: sortedFiles });
    } catch (err) {
      console.error("Lỗi duyệt file:", err);
      res.send({ files: [] });
    }
  });

  // tạo hình AI và up lên website
  CDNRouter.post("/create/image", async (req, res) => {
    const username = req.body.username;
    const imageData = req.body.imageData;
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const folder = req.body.folder;
    const pathDir = folder
      ? `${dataPath}/uploads/${folder}/${username}`
      : `${dataPath}/uploads/${username}`;
    const imagePath = folder
      ? `${dataPath}/uploads/${folder}/${username}/${uniqueSuffix}.png`
      : `${dataPath}/uploads/${username}/${uniqueSuffix}.png`;

    fs.mkdirSync(pathDir, { recursive: true });

    if (imageData) {
      const buffer = Buffer.from(imageData, "base64");
      fs.writeFileSync(imagePath, buffer);

      // nếu truyền vào domain thì upload ảnh mới tạo ra lên server luôn
      if (req.body.domain) {
        const apiURL = `${req.body.domain["domain"]}/wp-json/wp/v2/media`;
        const account = `${req.body.domain["username"]}:${req.body.domain["password"]}`;
        const fileName = path.basename(url.parse(imagePath).pathname); // -> 'photo123.jpg'
        const mimeType = mime.lookup(imagePath);

        const thumbnail = await axios({
          url: apiURL,
          method: "POST",
          headers: {
            Authorization: `Basic ${Base64.encode(account)}`,
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Content-Type": mimeType,
          },
          data: buffer,
        })
          .then((response) => {
            return response.data;
          })
          .catch((err) => {
            console.log("err", err);
            return null;
          });

        res.status(200).send({
          img: imagePath,
          data: thumbnail,
        });
      } else {
        res.status(200).send({
          img: imagePath,
          data: null,
        });
      }
    } else {
      res.status(200).send({
        img: imagePath,
        data: null,
      });
    }
  });

  // upload ảnh lên Website
  CDNRouter.post("/delete/image", async (req, res) => {
    const filePath = req.body.filePath;

    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("Lỗi khi xóa:", err);
        return res.status(500).send({ message: "Xóa thất bại" });
      }
      res.send({ message: "Xóa thành công" });
    });
  });

  // upload ảnh lên Website
  CDNRouter.post("/website/image", async (req, res) => {
    const imagePath = req.body.imagePath;
    const fileName = path.basename(url.parse(imagePath).pathname); // -> 'photo123.jpg'
    const mimeType = mime.lookup(imagePath);

    if (req.body.domain) {
      const buffer = fs.readFileSync(imagePath);

      const apiURL = `${req.body.domain["domain"]}/wp-json/wp/v2/media`;
      const account = `${req.body.domain["username"]}:${req.body.domain["password"]}`;

      const thumbnail = await axios({
        url: apiURL,
        method: "POST",
        headers: {
          Authorization: `Basic ${Base64.encode(account)}`,
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Type": mimeType,
        },
        data: buffer,
      })
        .then((response) => {
          return response.data;
        })
        .catch((err) => {
          console.log("err", err);
          return null;
        });

      res.status(200).send({
        buffer: buffer,
        mimeType: mimeType,
        fileName: fileName,
        data: thumbnail,
      });
    } else {
      const buffer = fs.readFileSync(imagePath, {
        encoding: "base64",
      });

      res.status(200).send({
        buffer: buffer,
        fileName: fileName,
        mimeType: mimeType,
        data: null,
      });
    }
  });

  // lưu hình facebook
  CDNRouter.post("/upload/images", async (req, res) => {
    // Note: The only accepted mime types are some image types, image/*.
    const images = req.body.images;
    const username = req.body.username;

    const requests = images.map(async (image) => {
      const fileName = path.basename(url.parse(image).pathname); // -> 'photo123.jpg'
      const pathDir = `${dataPath}/uploads/facebook/${username}`;
      const savePath = `${dataPath}/uploads/facebook/${username}/${fileName}`;
      const mimeType = mime.lookup(savePath);

      try {
        const base64Image2File = fs.readFileSync(savePath, {
          encoding: "base64",
        });

        if (base64Image2File.length < 1000) {
          return { base64Image2File: null, mimeType: null };
        }

        return { base64Image2File, mimeType };
      } catch (error) {
        fs.mkdirSync(pathDir, { recursive: true });

        return request(
          {
            url: image,
            encoding: null,
          },
          (err, resp, buffer) => {
            if (err) {
              console.error("Lỗi tải ảnh:", err);
              return { base64Image2File: null, mimeType: null };
            }

            return fs.writeFile(savePath, buffer, (err) => {
              if (err) {
                console.error("Lỗi ghi file:", err);
                return { base64Image2File: null, mimeType: null };
              } else {
                console.log("Đã lưu ảnh thành công vào:", savePath);
                const base64Image2File = fs.readFileSync(savePath, {
                  encoding: "base64",
                });

                return { base64Image2File, mimeType };
              }
            });
          },
        );
      }
    });

    const results = await Promise.all(requests);
    res.send(results);
  });

  return CDNRouter;
};

module.exports = createCDNRouter;
