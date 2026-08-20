# 汽水音乐音频解密工具

逆向自 SodaMusic v3.5.1(Win32, Electron)。给定 **PlayAuth(spade_a) + 音频链接**,
输出**可直接播放的 M4A / FLAC 文件**。

## 目录结构

```
decrypt-tool/
  soda-decrypt.js       CLI 入口(薄壳)
  lib/                  解密库(可直接 require 调用)
    index.js            高层 API:decryptSodaAudio()
    decode-spade.js     PlayAuth → 密钥(device.node)
    cenc.js             CENC AES-CTR 解密 MP4(核心)
    download.js         HTTP/HTTPS 下载
  tools/                数据提取工具
    read-entries.js     读 LunaCacheV2/entries.db → data/entries-index.json
    decode-spade.js     对索引里所有 spade 批量出密钥 → data/entries-with-keys.json
  data/                 生成的索引/密钥映射表(json)
  output/               解密产物
  test/                 测试脚本(与解密代码分离)
  index.html            浏览器暗房 UI(可部署 GitHub Pages)
  browser-libs/         浏览器版解密库(无 Node 依赖)
  package.json          main 指向 lib/index.js,可直接作为包引用
```

## CLI 用法

```bash
# 方式一:PlayAuth + 音频 URL
node soda-decrypt.js --playauth "你的spade_a" --url "音频链接" --out output/song.m4a

# 方式二:PlayAuth + 本地已下载的加密文件
node soda-decrypt.js --playauth "你的spade_a" --file "encrypted.bin" --out output/song.m4a

# 方式三:已经知道 16 字节密钥(32 hex)时,跳过 decodeSpade
node soda-decrypt.js --key 681abcf2dd0840a08eeda68c2876d6d4 --url "音频链接" --out output/song.m4a

# 解密后自动打印 ffprobe 信息验证
node soda-decrypt.js --playauth "..." --url "..." --out output/song.m4a --probe
```

**Windows PowerShell:** URL 里的 `&` 会被当成命令分隔符,导致链接被截断,并出现 `'ch' 不是内部或外部命令`。请先赋给变量,或把 URL 写入文本文件后用 `--url-file`:

```powershell
$u = 'https://...?a=8478&ch=0&cr=3&...'
node soda-decrypt.js --playauth '你的spade_a' --url $u --out output/song.m4a

# 或
node soda-decrypt.js --playauth '你的spade_a' --url-file url.txt --out output/song.m4a
```

运行环境:**无需安装 SodaMusic**。`decodeSpade` 有纯 JS 实现(与原生 `device.node`
在全部 425 个缓存 PlayAuth 上产出一致),唯一依赖是 Node.js(≥14)。
仅当纯 JS 解析失败时才会尝试加载 `device.node`(此时需设 `SODA_APP_DIR` 指向含
`device.node` 的目录;设 `SODA_FORCE_NATIVE=1` 可强制只用原生)。

## 网页 / GitHub Pages

纯静态页面,浏览器直连音频 URL,没有后端代理。

```bash
node serve.js    # 本地预览 http://127.0.0.1:3478/
```

部署:把仓库推到 GitHub,在仓库 Settings → Pages 选择主分支根目录。汽水 CDN 若未放行 CORS,URL 下载会失败,改用「本地文件」即可(先另存加密音频再拖进页面)。

## 库调用(直接 require)

```js
const { decryptSodaAudio } = require('./decrypt-tool')   // 或 require('./decrypt-tool/lib')

// PlayAuth + URL → 写文件 + 返回 Buffer
const r = await decryptSodaAudio({
  playAuth: '你的spade_a',        // 或 key: '681abcf2...'(32 hex)跳过第一层
  url: '音频链接',                 // 或 file: 'encrypted.bin' / Buffer
  out: 'song.m4a',                // 可选:同时写文件(自动建目录)
  onProgress: (m) => console.log(m),
})
// r = { buffer, decryptedBytes, key, codec }  codec 为 'mp4a' 或 'fLaC'

// 底层函数也导出
const { decodeSpade, decryptM4A, download } = require('./decrypt-tool/lib')
```

## 解密算法(两层)

音频是 **标准 CENC 加密的 MP4**(`enca` sample entry + `senc` box),不是自定义流密码。

### 第一层:PlayAuth → 密钥(decodeSpade,纯 JS)

`spade_a`(即 `item.PlayAuth`)经 `decodeSpade` 得到 **16 字节 AES-128 密钥**(32 个 hex 字符)。
纯 JS 实现(`lib/decode-spade.js`),算法:

1. Base64 解码 `spade_a`
2. `paddingLength = (bytes[0] ^ bytes[1] ^ bytes[2]) - 48`;有效数据取 `bytes[1 .. len-padding]`
3. 解密内核:前置字节流 `[0xfa, 0x55]`,对第 `i` 字节做
   `raw = bytes[i] ^ buff[i] - popcount(i) - 0x15`,负值按 **mod 255** 归位
4. 结果首字节经 base36 解码得到密钥长度,取后续字节 UTF-8 解码 → hex 密钥

**不依赖 MachineGuid,不依赖 app。**

### 第二层:音频流解密(CENC AES-CTR,ffmpeg.dll demuxer 内建)

ffmpeg.dll 通过 `setDemuxerArg({key:'decryption_key', value: 密钥})` 接收密钥,播放时按 CENC 规范解密:

- **容器**:非分片 MP4(已确认缓存文件均为 `ftyp + moov + mdat`;如有 `moof` 分片也支持)
- **sample entry**:`enca`(Encrypted Audio),解密后须改回真实 codec
- **IV**:`senc` box 中每个 sample 一个 **8 字节 IV**(version 0;version 1 为 16 字节)
- **加密方式**:对每个 sample 做 **AES-128-CTR**
  - counter 初始块 = 8 字节 IV 置于**高 8 字节**,低 8 字节为 0
  - 每 16 字节块按 **128 位大端整数 +1**
- sample 在 `mdat` 中的位置由 `stsz`(大小)、`stco`(chunk 偏移)、`stsc`(sample↔chunk 映射)决定
- **codec 补丁**:`enca` 内层若是 FLAC 音频条目(含 `dfLa` box)则补丁成 `fLaC`,否则 `mp4a`
  - AAC 曲目:`enca` → `mp4a`
  - **lossless 曲目(quality=lossless)**:24-bit FLAC 装在 MP4 容器里,`enca` → `fLaC`;
    输出是 MP4 容器内的 FLAC,可再 `ffmpeg -i out.mp4 -c copy out.flac` 转成纯 FLAC
    (已验证:44100Hz / 立体声 / 24-bit)

### 解密结果验证

`ffprobe` 识别输出为 AAC LC 或 FLAC,时长与 `stsz` sample 数一致。已对缓存中
425 个文件的采样批次(19 个不同曲目、含 `highest`/`hi_res`/`lossless`/`spatial`/`medium`
各音质)全部验证通过(每首全量解码 0 错误、非静音)。

## 测试

```bash
node test/pick-newest.js      # 取最近访问的缓存条目 → data/_newest.json
node test/test-url.js         # PlayAuth+URL 模式端到端测试(输出到 output/)
node test/batch-verify.js     # 批量解密多样曲目 + ffprobe 验证
node test/demo.js             # 模拟用户输入(PlayAuth+URL)完整流程
```

## 从缓存批量提取音频(可选)

缓存里已有 425 个加密 `.bin`(`LunaCacheV2\<chunkId>.bin`),元数据(含 spade)在 `entries.db`。
用 `tools/` 生成映射表,再逐条调用 `soda-decrypt.js` 全部还原:

```bash
node tools/read-entries.js     # → data/entries-index.json
node tools/decode-spade.js     # → data/entries-with-keys.json
# 然后对每条:
node soda-decrypt.js --key <key> --file "C:\Users\<user>\AppData\Roaming\SodaMusic\LunaCacheV2\<chunkId>.bin" --out output/<resourceId>.m4a
```

> 注意:`tools/read-entries.js` 依赖 `restored-sources/addons/lmdb` 下的 JS 封装 + 复制到
> `restored-sources/addons/lmdb/build/Release/lmdb.node` 的原生模块(bindings shim 在
> `restored-sources/node_modules/bindings`)。

## 关键文件位置

- 原生模块:`$Var31/app/resources/app/{device.node, lmdb.node, ffmpeg.dll}`
- 缓存目录:`C:\Users\<user>\AppData\Roaming\SodaMusic\LunaCacheV2\`
- 播放器解密调用点:`restored-sources/src/services/player/v4/engine.ts:471-483`
