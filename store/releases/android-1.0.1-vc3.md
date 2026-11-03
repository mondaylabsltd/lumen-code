# Android 1.0.1 / versionCode 3 优化补包

包名仍为 `ltd.mondaylabs.lumencode`，版本名仍为 `1.0.1`。使用原上传密钥签名，上传编号从 2 增加到 3。桌面、iOS 和协议不变；不替换已发布的 v1.0.1 标签。

## 原因与修复

- 原 release 配置关闭了 R8，导致依赖代码未裁剪、未充分混淆。现已启用代码裁剪、优化、混淆和资源裁剪。
- JNA 通过 JNI 和反射调用 Rust，不能任意改名。仅保留 JNA 及生成绑定中的原生方法、结构字段和回调接口；没有保留整个应用或 AndroidX。
- CameraX 1.4.1 → AppCompat 1.1.0 → Fragment 1.1.0 引入过时 SDK。现在通过依赖约束解析到 Fragment 1.9.1，保留原相机库版本。
- 16 KB 页面支持原先已通过，继续保留。中英文资源仍不按语言拆分，可离线切换。

## 本地结果

单位为十进制 MB；包的最终字节数和校验值见随包的 verification.json 与 SHA256SUMS。

| 项目 | 原 versionCode 2 | 新 versionCode 3 |
|---|---:|---:|
| 未压缩 DEX 总大小 | 24.54 MB | 2.80 MB |
| DEX 文件数 | 3 | 1 |
| AAB 大小 | 13.82 MB | 约 8.96 MB |
| 通用 APK 大小 | 30.21 MB | 约 7.88 MB |

DEX 减少约 88.6%。AAB 已包含 `r8.json` 和反混淆映射，三项代码优化开关均开启。Google Play 的展示以新包处理结果为准，不能用旧包页面判断修复结果。[Google 的 DEX 指标说明](https://developer.android.com/google/play/vitals/code-optimization)当前将普通应用告警门槛设为未压缩 DEX 至少 10 MB；新包已低于该大小。

## 验证

- 对同样启用 R8 的 bench 包，完成中英文文本及 64 KiB 随机文件编码、解码、校验与接收。
- 对关闭调试脚本的签名 release APK，验证启动、打开相机，以及从系统分享文本进入发送并播放彩色码。
- 检查上传签名、版本、R8 元数据、Fragment 解析结果及原生库 16 KB 对齐。
- 本轮运行检查使用 Android 模拟器；没有重新测量实机吞吐量。

## 使用

新的独立 Android 资料包为 `test/out/android-optimization/LumenCode-1.0.1-android-vc3.zip`。包含签名 AAB、APK、反混淆文件及校验报告，不含密钥或密码。

在 Google Play 当前发布轨道中，用 `LumenCode-1.0.1-android-vc3.aab` 替换旧的 versionCode 2。若旧版本已经发布，则创建新发布并使用 versionCode 3。上传后等待 Google 完成处理，核对新包的 SDK 与 DEX 信息。不要上传旧的完整资料包中的 AAB。

构建方式遵循 [AGP 9.3+ 官方 R8 配置](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)。反混淆文件已经内置于 AAB，也单独保存用于排查正式版崩溃。
