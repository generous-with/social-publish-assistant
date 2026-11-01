# 社交发布助手 · Social Publish Assistant

Chrome / Edge Manifest V3 扩展。从本地多平台标题 TXT 提取文案，在创作平台网页内预览并自动填写。无需构建、API Key 或后台服务，最终发布由用户操作。

## 安装

1. 下载 Releases 中的安装 ZIP，解压到固定目录；也可克隆本仓库。
2. 打开 chrome://extensions 或 edge://extensions，开启开发者模式。
3. 选择“加载已解压的扩展程序”，选取包含 manifest.json 的目录。
4. 登录创作平台，上传视频并进入编辑页，点击扩展图标。
5. 选择多平台标题 TXT，检查文案后点击“填写当前页面”。已有不同内容需勾选替换。

更新后重新加载扩展，再点击图标重建面板；当前文案会保留。首次使用新平台前核对实际填写结果。

## 平台与功能

| 平台 | 页面 | 填写行为 |
| --- | --- | --- |
| 抖音 | creator.douyin.com/creator-micro/content/post/video | 标题、简介、逐个话题和回车 |
| 今日头条 | mp.toutiao.com/profile_v4/xigua/upload-video | 标题、简介、搜索候选后逐个话题回车 |
| B站 | member.bilibili.com/platform/upload/video/frame | 标题、简介、标签、人工智能分区、个人观点声明、更多设置中的粉丝动态 |
| 小红书 | creator.xiaohongshu.com/publish/publish | 标题、正文、逐个话题、原创声明协议及确认 |
| 知乎 | www.zhihu.com/upload-video | 标题、简介/正文，#后输入名称选择第一候选；个人观点标记、科技互联网领域 |
| YouTube | studio.youtube.com/channel/.../videos/upload | 标题、说明、非儿童受众、展开后整体填入逗号标签 |
| Facebook | www.facebook.com | 使用抖音简介原文，含#话题，填写发帖窗口 |
| X | x.com/home、x.com/compose/post | 使用抖音简介原文，含#话题，填写首页或新帖窗口 |

B站可自动清理表单已选标签，助手文案保持原样；超过10个时按顺序最多填写10个，并列出未填入项。小红书自动原创声明可在面板取消勾选。扩展不会点击发布、投稿、Post 或 YouTube“继续”，也不会修改公开范围。

## TXT 格式

见 [完整示例](examples/multi-platform.txt)。段落使用【平台名】，字段使用中文冒号。支持UTF-8/BOM及GB18030。B站支持【B站】和【B 站】；知乎支持“简介”或“正文”；YouTube支持繁体字段名。Facebook与X复用【抖音】简介，不需要单独段落。

B站标签按空格拆分，因此 AI Agent 会计为两项；YouTube按逗号拆分，AI Agent 保留一项。不要选择口播全文文件。浏览器不能按任意磁盘路径静默读取文件，必须通过文件选择器授权。

## 隐私与权限

仅申请 activeTab、scripting、storage。点击工具栏后注入当前页面，不申请全站后台访问，不使用远程代码、统计或外部AI服务。草稿保存在扩展本机 storage.local，填写内容会交给目标网站，网站可能自动保存草稿。详见 [隐私说明](PRIVACY.md)。

## 局限和反馈

平台DOM、富文本编辑器和合成事件处理随时可能变化。已有自动化验证含真实文件解析与模拟浏览器，不等同于所有平台的当前线上验收；非Chrome浏览器需自行核验。遇到失败，点击“复制诊断”，检查并脱敏后提交Issue，注明平台、浏览器、扩展版本及操作步骤。诊断可能包含候选话题、页面标签和身份相关属性，不要直接公开含隐私的完整页面。

本地预检与平台实际字数规则可能不同，尤其X中文权重、YouTube标签计数和会员功能限制。扩展不自动截短正文，发布前以平台计数和提示为准。

## 开发与验证

Node.js 18+，不需要安装依赖：

~~~sh
npm test
npm run check
npm run package
~~~

安装包输出到 dist/。解析器位于 parser.js，面板与消息分派为 panel.js/background.js，各平台适配在 *-fill.js。运行时无构建步骤。测试不使用个人素材或登录账号，不会真实发帖。

## 许可证

[MIT](LICENSE)
