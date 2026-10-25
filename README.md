# Android Automation · 本地视觉执行器 0.3（星铁 APK 版本漂移保护）

截至 2026-10-22：**已有 Node/Rhino 验证和部分 Android 模拟器框架测试；AutoJs6 截图/OCR/Shizuku 完整链路及 Redmi 真机仍未验收。**
交付形态是官方 AutoJs6 APK + 单个脚本，不是新编译的 Personal OS 独立 APK。

## 工程路线与质量门禁（先测试，后开发）

项目优先级已调整为：**M0 自动 CI/CD + 可复现设备模拟器与故障注入测试 → M1 Redmi 真机验收 → M2 Skill/插件兼容性与回滚 → M3 AI 修复提案/经验固化 → M4 上游版本同步**。

- [ADR-0001：确定性 Game Agent + AI Skill Repair](docs/ADR-0001-reliable-game-agent.md) — 架构原则、更新自修复、零 Token 优先策略与安全边界。
- [游戏 Agent 研究矩阵](docs/GAME-AGENT-RESEARCH.md) — MaaFwPhoneAI、MobiAgent/AgentRR、Mobile-Agent-E、MaaFramework、MaaEnd、BetterGI、星铁上游等。
- [CI/CD、测试环境与质量门禁](docs/QUALITY-GATES.md) — Node LTS、随机故障注入、覆盖率、生成构建一致性、模拟器与真机的分级验收。
- [路线图与具体完成条件](docs/ROADMAP.md) — M0–M6、各阶段退出条件、Skill/版本管理接口草案。
- [不可执行的星铁 Skill 清单示例](examples/starrail-skill-manifest.example.json) — 为后续兼容性管理和有审核的发布提供数据契约示范，当前仅为设计样例。

**“0 bug”是质量目标，不能作为未经证明的绝对保证。** 实际执行标准是零已知 P0/P1 缺陷、全量强制测试通过、失败场景零误触控和零错误完成宣称。CI 仅验证硬件接口以上的可模拟策略；真机权限、MediaProjection、OCR 和 Shizuku 的行为必须独立验收。

CI 在 PR/提交上运行 Node 20/22 单元与故障注入测试、代码语法检查、覆盖率阈值、重新打包与产物一致性检查。候选标签 `vX.Y.Z-rc.N` 可以触发脚本与 SHA256 的自动预发布，**不是可供宣称真机通过的 APK**。


## 手机上测试（无需 PC）

1. 安装 [AutoJs6 6.7.0 arm64 官方 APK](https://github.com/SuperMonster003/AutoJs6/releases/download/v6.7.0/autojs6-v6.7.0-arm64-v8a-62db1ff8.apk)。
2. 在 AutoJs6 左侧抽屉打开 **Shizuku** 并允许授权。Shizuku 已启动不等于 AutoJs6 已获得授权。不需要打开无障碍或配置 ADB。
3. 下载本目录 `dist/AndroidAutomation.js`，用 AutoJs6 打开/导入并运行。
4. 点“1. 开始本机闭环自测”。Android 截图授权选择 **整个屏幕**，保持该页面前台，不手动触碰测试按钮。
5. 脚本会从截图 OCR 精确匹配随机 `TEST 六位数字`，触控后再次截图，只有连续两帧都**精确**识别到对应 `PASS 六位数字` 才显示 `verified`，防止随机令牌前后缀导致的假阳性。
6. 点击“复制最近的诊断报告”查看/反馈结果。再次测试需要退出并重新运行脚本。

要实测旋转保护，重新运行脚本后选择“2. 自测旋转保护（仅测试页）”。首帧出现后 8 秒内旋转手机，预期 `blocked / ROTATION_CHANGED` 且 `actionCount: 0`。这项测试只在夹具页运行，不会触碰游戏。若系统未开启自动旋转，请先开启。

系统授权无法由应用代替用户确认。小米如终止后台执行，再按系统提示允许 AutoJs6 后台运行；无需先批量修改系统设置。
APK SHA-256 已与 GitHub Release 的 digest 实际比对一致：
`a4fa5c941aecc4dbb770316e35ac98ae5b0efef5041ac0533dfa826b94595525`。
本项目不修改或重签官方 APK；上游源码、许可和发布说明均在 [AutoJs6](https://github.com/SuperMonster003/AutoJs6/tree/v6.7.0)。

## 星铁只读诊断（先做，不触控）

自测之后退出并重新运行脚本，选择 **“3. 星铁只读截图/识别诊断（绝不点击）”**。
授予截图权限并选择**整个屏幕**，在 15 秒内切到《崩坏：星穹铁道》任意可见页面。
脚本校验 Shizuku 授权与已知包名，采集两帧，检查前台是否切换、全屏尺寸及方向是否一致。
只汇总两次 OCR 文本数量、恰好识别出“设置”的次数、截图与 OCR 延迟；**绝不执行 input tap，也不保存截图或 OCR 原文**。
运行后回到 AutoJs6，通过“复制最近的诊断报告”获得 JSON，主要检查：

- `status: "observed"`：只证明两帧安全观察成功；**不是自测通过，也不是星铁任务完成**。
- `visualSummary.ocrCounts`：两次 OCR 块数。两个零可能代表纯图标界面、识别失败或截图异常，不能直接下结论。
- `visualSummary.targetCounts`：两帧“设置”目标数量；`targetStableUnique` 只表示两帧均识别为唯一目标，尚**不能证明可以安全点击**。
- `frames[].captureMs / ocrMs`：捕获与本地 OCR 的粗略耗时，可作为未来能耗基准前的性能线索。
- `actionCount: 0`：只读模式不请求任何触控。如果不是 0，应停止并反馈。

首次请只跑只读诊断；**单步点击测试须另行主动选择**，避免对星铁主账号产生意外操作。

## 星铁更新检测（v0.3）

星铁自动化采取**手动验证、自动动作阻断**的版本防护：

- 程序先检查当前前台包名，仅允许已列出的官方渠道包名；然后使用 Shizuku 只读 `dumpsys package` 提取 Android APK `versionCode/versionName`，不保存原始 dumpsys。
- **第一次使用、无法读取版本号或 APK 更新后，不允许直接执行“星铁设置入口单步测试”**；先重新运行脚本，完成“星铁只读截图/识别诊断”。
- 成功观察两帧后，程序仅将该包名和 APK 版本存入私有的 `starrail-client-version.json`，再允许下一次**用户明确主动点击按钮**进行单步实验。
- 检测到版本变化时报告 `clientVersionStatus: changed`，并拒绝原来的游戏触控。只读探测成功也**不是宣告新版本已完成游戏任务回归验证**，不允许把这个状态直接用于以后无人值守的自动日常。
- `versionCode` **不能检测游戏内热更新、服务端活动、资源变动**。因此游戏任务仍须逐项验证入口和结果条件；等我们实现自动日常与插件运行器时，必须增加针对资源/任务 revision 的兼容清单及回归门禁。

如果游戏更新后原来的任务入口不再出现，停止并更新识别资源，不能回退到固定坐标。诊断记录不包含截图、OCR 原文、包列表、账号信息。

## 星铁单步试验（显式触控）

先通过自测及**同包名下已记录的 APK 版本只读诊断**，退出并重新运行脚本后选择“4. 星铁设置入口单步测试（会点击一次）”。授予全屏截图后，在 **15 秒内**切回星铁的手机菜单，保持中文“设置”入口可见。
程序仅接受国服、B 服、国际服的已列出包名，并且当前文本必须是中文。

识别唯一“设置” → 两次位置稳定检查 → 点击一次 → 最多八次截图轮询。
验证候选关键词为“画面 / 声音 / 音量 / 分辨率 / 帧率”，至少两类连续出现两帧。
这些关键词是初始实验假设，尚未对当前游戏版本验证。
**如果入口只有齿轮图标或文字识别失败，会停止，不猜坐标。** 本版没有图标模板、日常任务、后台虚拟屏或 SRC Python 运行时。
不能把自测通过当作星铁通过，不能把设置页单步通过当作星铁日常自动化通过。

## 实现与边界

- Capture：AutoJs6 MediaProjection 全屏截图，显式复制其缓存图像并回收副本。
- Recognize：内置 ML Kit 中文 OCR，本地处理；复用上游 `ocr.mlkit.detect`，不依赖云 OCR。
- Act：Shizuku `input tap`。前台包名必须一致，坐标直接来自全屏像素，不做未经验证的比例映射。
- Verify：结果必须原先不存在，动作后连续两帧满足语义条件；画面变化或命令返回成功都不单独算成功。
- Safety：一次最多一个动作；注入不确定时不重试。重复目标、低置信度、截图尺寸不符、旋转、过期识别、取消或前台切换均拒绝后续触控。
- Stop：自测页有停止按钮；游戏中可从 AutoJs6 停止脚本。没有全局音量键急停。已提交的单次 input 命令不能撤回。
- Timeout：循环时间预算 45 秒，最多八次结果轮询；底层 OCR/Binder 阻塞不能被此同步调用硬中断，恢复后先检查截止时间并拒绝点击。极端阻塞用 AutoJs6 停止脚本。
- Evidence：诊断保存在 AutoJs6 私有目录，只保留最近一次；记录运行 ID、阶段、请求动作数、尺寸、耗时与 OCR 数量（新增独立 screenshot/OCR 时延）。默认不保存截图、识别原文、UID、原始异常或前台包列表，也没有上传路径。
- Recovery：中途进程终止，下次打开标记 `interrupted`，不自动续点。`actionCount` 是请求次数，不证明输入已到达。仅 APK 版本被本地只读记录为已观察，不代表执行兼容性审核通过。
- Evidence limit：截图 API 不提供此适配器可核验的帧时间戳；随机自测标记、结果预先不存在、间隔取样降低旧帧假阳性，但仍需真机检查采集稳定性。手动点击测试按钮也能产生结果，因此验收时不要干预。

## 与 Personal OS 关联

本项目独立维护在 `lse872317312010/android-automation`，不作为 Personal OS 子模块，也不依赖其源码、构建、Vault 或 Agent Protocol。Personal OS 仅是未来可选调用方。
`src/core.js` 接收 capture/foreground/tap 适配接口；AutoJs6 可被 MaaFramework native controller 替换。
`android-automation.run.v1` 是实验性外部运行记录，**不是已实现的 Personal OS 导入接口**。

后续由 Application API 校验已接受的 Task、strategy revision、runId 去重、adapter identity 和证据，
再建立 `Execution` / `Outcome`；执行器不能自行确认策略或直接写入 Vault。
`blocked`、`interrupted`、`action_requested` 都不能映射为 completed。
不伪造既有 `evidence/android` G3 记录。本实验与现有策略 App 的九场景验收分开。

## 代码核实与选型记录

核实 Personal OS main：`a5e39a006fec02fd19c3c2c1966cf6e6b9060d8a`（最近提交 #130）。
检查 README、AndroidManifest、MainActivity 所在原生目录、domain Execution/Outcome 与 device evidence。
现有策略 App 没有 MediaProjection/AccessibilityService/Shizuku 屏幕执行链，设备证据 README 明确未真机验收。

| 上游 | 本次核实 | 采用方式 |
| --- | --- | --- |
| [AutoJs6 6.7.0](https://github.com/SuperMonster003/AutoJs6/releases/tag/v6.7.0) | 下载官方 ARM64 APK 并核对摘要；读 OCR、UI、Shizuku 实现及截图文档 | 当前最小运行时，不 fork APK |
| [MaaFwApp](https://github.com/Aliothmoon/MaaFwApp) | README 明确 Android 9+、Shizuku/root 特权进程、native controller、资源构建期打包、虚拟屏 | 下一阶段完整原生宿主候选；并非 MaaXYZ/MaaFwApp |
| [MaaFramework](https://github.com/MaaXYZ/MaaFramework) | 确认主仓库与 MaaFwApp 引用关系 | 后续图像模板/Pipeline 引擎候选，本次未集成 |
| [StarRailCopilot](https://github.com/LmeSzinc/StarRailCopilot) | README 仍描述 Alas 衍生、模拟器/桌面运行与游戏任务资源 | 保持游戏业务唯一上游，本次不复制其任务逻辑 |

MaaFwApp 的资源是构建时集成，不能假定下载空宿主 APK 就能运行 SRC。
SRC 的 Python 业务不能直接当 Maa Pipeline 导入。本模块只验证执行原语，不承诺已经兼容 SRC。
后续先收集 Redmi 诊断，再根据 OCR 准确率、截图延迟和前台运行稳定性决定推进 MaaFwApp 资源包还是 SRC Android adapter。

## 开发与验收

```sh
node --test test/*.test.cjs
node --experimental-test-coverage --test --test-coverage-include=src/core.js --test-coverage-lines=100 --test-coverage-branches=90 --test-coverage-functions=100 test/*.test.cjs
node build.mjs
node --check dist/AndroidAutomation.js
git diff --exit-code -- dist/AndroidAutomation.js
```

离线测试验证控制策略（含只读探测不发送动作、前台变化、旋转、超时、取消），不验证 AutoJs6 Rhino/Android API、权限、实际 OCR 或游戏版本。
真机需至少验证：自测成功、拒绝截图、撤销 Shizuku、切换前台、旋转屏幕、停止脚本、进程中断后重启，以及星铁单步实际后置条件。
当前没有任何一项被宣称已完成。游戏内资源热更新检测、自动同步上游、插件版本清单、完整游戏自动化、Personal OS 自动回传、稳定 APK 自有签名升级是后续工作。
