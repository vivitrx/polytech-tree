# Polytech Tree · 人类科技树 3D 可视化

[English](#english) · [中文](#中文)

---

## 中文

一座可以自由旋转的"科技之塔"：人类历史上的每一项科技都是一个多面体节点，按时代分层堆叠，按领域分扇区着色。

### 视觉编码

| 通道 | 含义 |
|---|---|
| 高度（Y 轴） | 时间。每个水平层是一个时代，从底部的史前到顶部的智能时代 |
| 角度（扇区） | 领域。一整圈按 `data/categories.json` 的领域等分 |
| 颜色 | 领域，色值同样取自 `categories.json` |
| 面数 | 重要度：20 面 = 基石 → 12 领域支柱 → 8 领域内重要 → 6 改良与细分 → 4 长尾补充 |
| 尺寸 | 与重要度同向（`importanceScale()`） |
| 层半径 | 该层节点数越多，塔身越宽，所以近代会出现明显的"爆炸"轮廓 |

### 交互

- 左键拖拽旋转 · 滚轮缩放 · 右键平移
- 悬停节点：中英文名、年份、时代、领域、重要度星级、前置科技、简介
- `▶ 漫游动画`：相机自下而上穿过各时代层，切换层时弹出时代字幕
- 图例中的滑块：控制在画面里显示多少个节点名称（按到相机的距离取最近 N 个）

### 快速开始

```bash
npm install
npm run dev        # 开发服务器
npm run build      # tsc 类型检查 + 打包到 dist/
npm run validate   # 校验 data/ 下的数据（见 CONTRIBUTING.md）
```

需要 Node.js 18+ 和 Python 3（仅 `validate` 用到）。

### 项目结构

```
data/
  techs.json       科技节点：唯一事实源
  eras.json        时代分层与年份区间
  categories.json  领域：颜色 / 多面体形状 / 子类
  core-ids.json    核心科技注册表（校验用的锚点）
  research/        分时代的调研记录（数据来源，供追溯）
src/
  data.ts          JSON → 渲染用节点（字符串 id 转索引）
  layout.ts        圆柱塔布局：时代分层 + 领域扇区 + 拥挤度扩散
  polyhedra.ts     按重要度实例化多面体（InstancedMesh）
  edges.ts         前置/关联连线 + 时代标记环
  labels.ts        节点名称与时代名的弧形实例化文字
  controls.ts      相机：自由漫游 + 分层巡游
  scene.ts         渲染器、光照、雾
scripts/
  validate_data.py    数据校验（CI 用，返回非零表示有错误）
  merge_research.py   research/ → techs.json 的合并
  recompute_era.py    按 year 重算 era
```

技术栈：TypeScript + [three.js](https://threejs.org/) + Vite。无后端、无运行时网络请求，全部数据在构建时打进包里。

### 参与贡献

新增科技、时代、领域，请看 [CONTRIBUTING.md](CONTRIBUTING.md)。数据是普通 JSON，改完跑一次 `npm run validate` 即可提 PR。

---

## English

A freely rotatable "tower of technology": every technology humans ever invented is a polyhedron, stacked in era layers and split into domain sectors by angle.

- **Height = time.** Each horizontal layer is an era, from prehistory at the base to the intelligent age at the top.
- **Angle = domain.** One full circle divided by `data/categories.json`; color comes from the same file.
- **Face count = importance.** 20 faces for cornerstone technologies down to 4 for long-tail entries; node size follows the same scale.
- **Layer radius = density.** Eras with more recorded technologies bulge outward, which is why the modern section reads as an explosion.

Interactions: drag to orbit, wheel to zoom, right-drag to pan, hover a node for its card (bilingual name, year, era, domain, importance, prerequisites, summary), and press the tour button to fly the camera up through the eras.

Built with TypeScript, three.js and Vite. No backend and no runtime network calls — the dataset is bundled at build time, so the site is a set of static files.

The dataset lives in plain JSON files under `data/`, so adding a technology, an era or a domain is a pull request away. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Data provenance

Technology names, dates and summaries were compiled from English Wikipedia articles (the `wikiEn` field records the article title for each entry) plus period references; `data/research/` holds the per-era working notes behind every batch. Treat the dataset as a curated educational index, not an authoritative chronology — dating the first instance of a technology is genuinely contested, and entries carry the year the compilation chose.

## License

Not declared yet. Until a license file is added, all rights are reserved by the repository owner, including the `data/` JSON files.
