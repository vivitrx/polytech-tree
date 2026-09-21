import * as THREE from 'three'
import type { TechNode } from './data'
import { ERA_COUNT, CATEGORY_COUNT } from './data'

// 圆柱塔布局：Y 轴 = 时间（时代分层），角度 = 领域（CATEGORY_COUNT 扇区）
// 近代节点爆炸 → 超线性扩散：层间距更厚 + 半径超比例放大 + 节点最小间距放宽
export const BASE_RADIUS = 42      // 基准层半径
const SECTOR_TOTAL = (Math.PI * 2) / CATEGORY_COUNT
const RADIUS_EXPONENT = 0.65       // >0.5：近代层面密度实际下降，视觉更疏朗
const INNER_RATIO = 0.28           // 环空内径 / 外径
const SECTOR_FILL = 0.84           // 扇区实际占用的角度比例
// 面积目标占用率：按需求算层半径时留 20% 余量。圆形节点无法无缝铺满楔形，
// 若解到 fill=1.00（旧行为：peak/K 正好等于面积预算），松弛迭代必然要把节点挤出扇区或彼此重叠。
const SECTOR_FILL_TARGET = 0.8
// 单个扇区可容纳的环空面积 = SECTOR_FILL/CATEGORY_COUNT · π·(R²−(INNER_RATIO·R)²) = K·R²
const SECTOR_AREA_K = (SECTOR_FILL / CATEGORY_COUNT) * Math.PI * (1 - INNER_RATIO ** 2)

export interface PlacedNode {
  node: TechNode
  position: THREE.Vector3
  scale: number          // 多面体尺寸（由重要度决定）
  spinAxis: THREE.Vector3
  spinSpeed: number
  phase: number
}

export interface TowerLayout {
  placed: PlacedNode[]
  eraRadii: number[]     // 每层外径
  eraY: number[]         // 每层的 Y 坐标（近代层间距更厚，Y 不再等差）
  towerHeight: number
}

export function importanceScale(importance: number): number {
  // 规范 §3.4：1 = 基石 → 最大，5 = 长尾 → 最小。与面数（20→4）构成双通道编码
  return 1.9 - (importance - 1) * 0.35   // 1→1.9  2→1.55  3→1.2  4→0.85  5→0.5
}

/**
 * 开场/复位视距：按塔的包围球推导，使展宽或收窄后的取景比例保持一致。
 * 2.03 由旧版实测取景反推（旧库 maxR=76、H≈330 → 视距 368 = 2.03×√(76²+165²)）。
 */
export const VIEW_FIT = 2.03
export function startViewDistance(eraRadii: number[], towerHeight: number): number {
  const maxR = Math.max(...eraRadii)
  return VIEW_FIT * Math.hypot(maxR, towerHeight / 2)
}

// mulberry32
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function layoutTower(nodes: TechNode[]): TowerLayout {
  const rand = mulberry32(9917)

  // 每层节点数与外径
  const counts = new Array(ERA_COUNT).fill(0)
  nodes.forEach(n => counts[n.era]++)
  const avgCount = nodes.length / ERA_COUNT

  // 按 (era, category) 分桶——必须先于半径计算，因为拥挤度由最挤的扇区决定
  const buckets = new Map<string, TechNode[]>()
  nodes.forEach(n => {
    const key = `${n.era}:${n.category}`
    const arr = buckets.get(key)
    if (arr) arr.push(n)
    else buckets.set(key, [n])
  })
  // 最挤扇区决定层半径：把该层按域分组，取各组需求面积的最大值
  const eraRadii = counts.map((c, era) => {
    let peak = 0
    for (let cat = 0; cat < CATEGORY_COUNT; cat++) {
      let demand = 0
      for (const n of buckets.get(`${era}:${cat}`) ?? []) {
        const r = 1.5 * importanceScale(n.importance)
        demand += Math.PI * (r * 1.15) ** 2
      }
      peak = Math.max(peak, demand)
    }
    return Math.max(
      BASE_RADIUS * Math.pow(c / avgCount, RADIUS_EXPONENT),
      Math.sqrt(peak / (SECTOR_AREA_K * SECTOR_FILL_TARGET))
    )
  })

  // 层间距：节点多的时代层更厚（近代拉开垂直距离）
  const eraGaps = counts.map(c => Math.min(42, 22 + c * 0.08))
  const eraY: number[] = []
  let acc = 0
  for (let e = 0; e < ERA_COUNT; e++) {
    eraY.push(acc)
    acc += eraGaps[e]
  }
  const towerHeight = eraY[ERA_COUNT - 1]

  const placed: PlacedNode[] = []
  const layerNodes: PlacedNode[][] = Array.from({ length: ERA_COUNT }, () => [])

  for (let era = 0; era < ERA_COUNT; era++) {
    const outerR = eraRadii[era]
    const innerR = Math.max(outerR * INNER_RATIO, 5)
    const y = eraY[era]
    // 节点最小间距随层节点数放宽（近代更疏朗）
    const spread = 1 + counts[era] / 500

    for (let cat = 0; cat < CATEGORY_COUNT; cat++) {
      const list = buckets.get(`${era}:${cat}`) ?? []
      const sectorStart = cat * SECTOR_TOTAL + SECTOR_TOTAL * 0.08
      const sectorWidth = SECTOR_TOTAL * 0.84

      for (const n of list) {
        // sqrt 分布的半径 + 扇区内随机角度
        const r = innerR + (outerR - innerR) * Math.sqrt(rand())
        const theta = sectorStart + sectorWidth * rand()
        const scale = importanceScale(n.importance)
        const p = new PlacedNodeImpl(
          n, new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r),
          scale,
          new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
          0.08 + rand() * 0.22,
          rand() * Math.PI * 2
        )
        placed.push(p)
        layerNodes[era].push(p)
      }
    }
  }

  // 同层最小间距修正（松弛迭代；几何外接半径 1.5 → 相切需 1.5·(a+b)，这里再留可见间隙）
  const GEOM_RADIUS = 1.5
  for (let era = 0; era < ERA_COUNT; era++) {
    const arr = layerNodes[era]
    const spread = 1 + counts[era] / 500
    for (let iter = 0; iter < 16; iter++) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j]
          const dx = b.position.x - a.position.x
          const dz = b.position.z - a.position.z
          const dist = Math.hypot(dx, dz)
          const minDist = (GEOM_RADIUS * (a.scale + b.scale) * 1.15 + 0.4) * spread
          if (dist < minDist && dist > 1e-4) {
            const push = (minDist - dist) / 2
            const nx = dx / dist, nz = dz / dist
            a.position.x -= nx * push; a.position.z -= nz * push
            b.position.x += nx * push; b.position.z += nz * push
          } else if (dist <= 1e-4) {
            a.position.x += (rand() - 0.5) * 0.5
            a.position.z += (rand() - 0.5) * 0.5
          }
        }
      }
    }
  }

  return { placed, eraRadii, eraY, towerHeight }
}

class PlacedNodeImpl implements PlacedNode {
  constructor(
    public node: TechNode,
    public position: THREE.Vector3,
    public scale: number,
    public spinAxis: THREE.Vector3,
    public spinSpeed: number,
    public phase: number
  ) {}
}
