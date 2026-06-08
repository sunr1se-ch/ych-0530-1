# 皮影戏关节开合角度序列自检

一个纯前端的皮影戏关节角度训练自检工具，支持学员通过拖动滑块或输入角度来练习皮影角色的关节动作序列。

## 功能特性

- 🎭 **多角色支持**：内置「关公立像」示例，可自定义添加新角色
- 📊 **实时评估**：5° 内为 match，12° 内为 near，否则为 off
- 🔥 **Streak 系统**：连续正确计数，连续 3 次 off 自动清零
- 📈 **统计分析**：各关节 match 占比、平均偏差等数据展示
- 💾 **本地存储**：刷新页面自动恢复进度，记住个人最佳 streak
- ↩️ **撤销功能**：支持单步回退操作
- 🔄 **重置功能**：一键重置所有进度重新开始
- 📱 **响应式设计**：支持桌面端和移动端
- ⌨️ **快捷键支持**：Enter 提交，Ctrl+Z 撤销

## 快速开始

### 本地运行

直接在浏览器中打开 `index.html` 即可使用。

或使用本地 HTTP 服务器：

```bash
# 使用 Python
python -m http.server 8000

# 使用 Node.js
npx http-server .
```

然后访问 `http://localhost:8000`

### Docker 部署

```bash
# 构建镜像
docker build -t shadow-puppet-training .

# 运行容器
docker run -d -p 8080:80 shadow-puppet-training
```

访问 `http://localhost:8080` 即可使用。

## 使用说明

1. **选择角色**：从顶部下拉菜单中选择角色，点击「加载」
2. **调整角度**：通过拖动滑块或直接输入数值调整各关节角度
3. **实时预览**：调整时可实时看到当前偏差和评估结果
4. **提交答案**：点击「提交」按钮确认当前时间点的设置
5. **查看结果**：提交后系统会显示评估结果并自动进入下一时间点
6. **撤销操作**：如提交错误，可点击「撤销」回退一步
7. **重置进度**：点击「重置」可重新开始当前角色的练习

## 评估规则

| 偏差范围 | 等级 | 颜色 |
|---------|------|------|
| ≤ 5° | Match | 🟢 绿色 |
| 5° ~ 12° | Near | 🟡 橙色 |
| > 12° | Off | 🔴 红色 |

**Streak 规则**：
- 每次非 off 的提交，streak +1
- 每次 off 的提交，连续 off 计数 +1
- 连续 3 次 off，streak 清零
- 最佳 streak 会永久保存

## 如何添加新角色

### 1. 创建角色 JSON 文件

在 `characters/` 目录下创建新的 JSON 文件，格式如下：

```json
{
  "name": "角色名称",
  "description": "角色描述（可选）",
  "joints": [
    {
      "id": "joint_unique_id",
      "name": "关节显示名称",
      "minAngle": 0,
      "maxAngle": 180,
      "sequence": [
        { "time": 0, "angle": 30 },
        { "time": 1, "angle": 45 },
        { "time": 2, "angle": 60 }
      ]
    }
  ]
}
```

### 2. JSON 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 角色名称，显示在下拉菜单中 |
| `description` | string | 角色描述，可选 |
| `joints` | array | 关节列表，至少包含一个关节 |
| `joints[].id` | string | 关节唯一标识符，英文、数字和下划线 |
| `joints[].name` | string | 关节显示名称，如「左肩」「右肘」 |
| `joints[].minAngle` | number | 关节最小角度（度） |
| `joints[].maxAngle` | number | 关节最大角度（度） |
| `joints[].sequence` | array | 角度序列，包含多个时间点 |
| `sequence[].time` | number | 时间点（秒），所有关节必须使用相同的时间点 |
| `sequence[].angle` | number | 该时间点的目标角度 |

### 3. 更新角色清单

编辑 `characters/manifest.json`，添加新角色：

```json
[
  {
    "file": "guanyu.json",
    "name": "关公立像"
  },
  {
    "file": "your_character.json",
    "name": "你的角色名称"
  }
]
```

### 4. 注意事项

- 所有关节的 `sequence` 必须包含相同的时间点，数量一致
- 时间点建议按顺序排列，间隔均匀
- 角度值必须在 `minAngle` 和 `maxAngle` 范围内
- 建议时间点数量在 5-20 个之间，适合一次练习
- 文件命名使用小写字母和下划线，如 `guanyu.json`

## 项目结构

```
.
├── index.html          # 主页面
├── styles.css          # 样式文件
├── app.js              # 核心逻辑
├── Dockerfile          # Docker 部署配置
├── .dockerignore       # Docker 忽略文件
├── characters/         # 角色定义目录
│   ├── manifest.json   # 角色清单
│   └── guanyu.json     # 关公立像示例
└── README.md           # 说明文档
```

## 自定义配置

可在 `app.js` 开头的 `CONFIG` 对象中调整参数：

```javascript
const CONFIG = {
    MATCH_THRESHOLD: 5,      // Match 阈值（度）
    NEAR_THRESHOLD: 12,      // Near 阈值（度）
    MAX_OFF_STREAK: 3,       // 连续 off 次数清零 streak
    CHARACTERS_DIR: 'characters/'  // 角色目录
};
```

## 技术栈

- 纯 HTML5 + CSS3 + JavaScript (ES6+)
- 无任何外部依赖
- LocalStorage 本地存储
- Nginx 静态服务器（Docker）

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 许可证

MIT License
