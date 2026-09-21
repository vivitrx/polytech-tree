// 真实科技数据加载：data/*.json 为唯一事实源
// 字符串 id（era/category）映射为数字索引，供布局与渲染管线使用
import techsRaw from '../data/techs.json'
import erasRaw from '../data/eras.json'
import categoriesRaw from '../data/categories.json'

// ───── 原始 JSON 结构（调研产物的 schema） ─────
interface RawTech {
  id: string
  name: string
  nameEn: string
  wikiEn?: string
  aliases?: string[]
  year: number
  era: string
  category: string
  importance: number
  prereqs: string[]
  related: string[]
  desc: string
}

interface RawEra {
  id: string
  name: string
  nameEn: string
  yearStart: number
  yearEnd: number
  order: number
}

interface RawCategory {
  id: string
  name: string
  nameEn: string
  color: string
  polyhedron: string
  subcategories: string[]
}

const techs = techsRaw as RawTech[]
const eras = [...(erasRaw as RawEra[])].sort((a, b) => a.order - b.order)
const categories = categoriesRaw as RawCategory[]

// ───── 字符串 id → 数字索引 ─────
export const ERA_ID_TO_INDEX = new Map(eras.map((e, i) => [e.id, i]))
export const CATEGORY_ID_TO_INDEX = new Map(categories.map((c, i) => [c.id, i]))

/** 渲染管线使用的节点结构（era/category 已转为索引，name 已做缺失回退） */
export interface TechNode {
  id: string
  name: string          // 中文名，缺失时回退英文（不向玩家暴露内部 id）
  nameEn: string
  year: number
  era: number           // 时代层索引
  category: number      // 领域索引
  importance: number
  prereqs: string[]
  related: string[]
  desc: string
}

export const TECHS: TechNode[] = techs.map(t => ({
  id: t.id,
  name: t.name || t.nameEn, // 中文缺失回退英文
  nameEn: t.nameEn,
  year: t.year,
  era: ERA_ID_TO_INDEX.get(t.era) ?? 0,
  category: CATEGORY_ID_TO_INDEX.get(t.category) ?? 0,
  importance: t.importance,
  prereqs: t.prereqs ?? [],
  related: t.related ?? [],
  desc: t.desc,
}))

export const TECH_BY_ID = new Map(TECHS.map(t => [t.id, t]))

// ───── 时代信息（供标签/字幕/悬浮使用） ─────
function yearLabel(y: number): string {
  if (y < 0) {
    const abs = Math.abs(y)
    return abs >= 10000 ? `前 ${(abs / 10000).toFixed(abs % 10000 === 0 ? 0 : 1)} 万` : `前 ${abs}`
  }
  return `${y}`
}

export const ERA_INFO: { id: string; name: string; range: string }[] = eras.map(e => ({
  id: e.id,
  name: e.name,
  range: `${yearLabel(e.yearStart)} – ${e.yearEnd >= 2025 ? '今' : yearLabel(e.yearEnd)}`,
}))

export const ERA_COUNT = eras.length

// ───── 领域信息（色值以数据为准，替代 scene.ts 硬编码） ─────
export const CATEGORY_NAMES = categories.map(c => c.name)
export const CATEGORY_HEX = categories.map(c => c.color)
export const CATEGORY_COUNT = categories.length
