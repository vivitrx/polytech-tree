import * as THREE from 'three'
import type { PlacedNode } from './layout'

// 形状 = 重要度（面数越多越重要），颜色 = 领域（见 categories.json）
// 5 档重要度正好对应 5 种柏拉图立体的面数：20 / 12 / 8 / 6 / 4
// importance 1 = 基石 → 二十面体；importance 5 = 长尾 → 四面体
const R = 1.5 // 统一外接球半径，低面数立体因体积小而自然显得更小
const BY_IMPORTANCE: THREE.BufferGeometry[] = [
  new THREE.IcosahedronGeometry(R),      // 20 面 —— importance 1
  new THREE.DodecahedronGeometry(R),     // 12 面 —— importance 2
  new THREE.OctahedronGeometry(R),       //  8 面 —— importance 3
  new THREE.BoxGeometry(R * 2 / Math.sqrt(3), R * 2 / Math.sqrt(3), R * 2 / Math.sqrt(3)), // 6 面 —— 4
  new THREE.TetrahedronGeometry(R),      //  4 面 —— importance 5
]
const LEVELS = BY_IMPORTANCE.length

export function facesOf(importance: number): number {
  return [20, 12, 8, 6, 4][Math.min(LEVELS, Math.max(1, Math.round(importance))) - 1]
}

interface InstanceMeta {
  nodeIdx: number
  placed: PlacedNode
}

export class PolyhedraField {
  meshes: THREE.InstancedMesh[] = []
  private metas: InstanceMeta[][] = []
  private highlightIdx: number | null = null
  private colors: THREE.Color[]
  private tmp = new THREE.Object3D()
  private white = new THREE.Color(0xffffff)
  // 筛选（§3 的 kind 副轴）：不改布局、不改尺寸，只把非匹配实例的颜色压向背景
  private keep: ((nodeIdx: number) => boolean) | null = null
  private byIdx: PlacedNode[]
  private dim = new THREE.Color(0x070a14)

  constructor(placed: PlacedNode[], colors: THREE.Color[]) {
    this.colors = colors
    this.byIdx = placed
    const buckets: InstanceMeta[][] = Array.from({ length: LEVELS }, () => [])
    placed.forEach((p, globalIdx) => {
      const level = Math.min(LEVELS, Math.max(1, Math.round(p.node.importance))) - 1
      buckets[level].push({ nodeIdx: globalIdx, placed: p })
    })

    for (let lv = 0; lv < LEVELS; lv++) {
      const meta = buckets[lv]
      const mesh = new THREE.InstancedMesh(
        BY_IMPORTANCE[lv],
        new THREE.MeshStandardMaterial({ metalness: 0.15, roughness: 0.55 }),
        Math.max(1, meta.length)
      )
      mesh.count = meta.length
      mesh.frustumCulled = false // 实例分布全塔，禁用剔除避免误裁
      meta.forEach((m, i) => mesh.setColorAt(i, colors[m.placed.node.category]))
      this.meshes.push(mesh)
      this.metas.push(meta)
    }
  }

  /** 每帧更新自转 */
  update(time: number) {
    for (let lv = 0; lv < this.meshes.length; lv++) {
      const mesh = this.meshes[lv]
      const meta = this.metas[lv]
      for (let i = 0; i < meta.length; i++) {
        const p = meta[i].placed
        this.tmp.position.copy(p.position)
        this.tmp.quaternion.setFromAxisAngle(p.spinAxis, p.phase + time * p.spinSpeed)
        this.tmp.scale.setScalar(p.scale)
        this.tmp.updateMatrix()
        mesh.setMatrixAt(i, this.tmp.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  /** 设置/清除筛选（传 null 显示全部）；只改颜色，节点位置与大小不动 */
  setFilter(keep: ((nodeIdx: number) => boolean) | null) {
    this.keep = keep
    for (let lv = 0; lv < this.meshes.length; lv++) {
      const mesh = this.meshes[lv]
      this.metas[lv].forEach((m, i) => mesh.setColorAt(i, this.colorOf(m.nodeIdx)))
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  private colorOf(nodeIdx: number): THREE.Color {
    const base = this.colors[this.byIdx[nodeIdx].node.category]
    if (this.highlightIdx === nodeIdx) return this.white
    if (this.keep && !this.keep(nodeIdx)) return base.clone().lerp(this.dim, 0.9)
    return base
  }

  /** 悬停高亮：nodeIdx 为全局索引，null 恢复 */
  highlight(nodeIdx: number | null) {
    if (this.highlightIdx === nodeIdx) return
    const prev = this.highlightIdx
    this.highlightIdx = nodeIdx
    for (const idx of [prev, nodeIdx]) {
      if (idx !== null && idx !== undefined) this.repaint(idx)
    }
  }

  private repaint(nodeIdx: number) {
    for (let lv = 0; lv < this.meshes.length; lv++) {
      const meta = this.metas[lv]
      for (let i = 0; i < meta.length; i++) {
        if (meta[i].nodeIdx !== nodeIdx) continue
        this.meshes[lv].setColorAt(i, this.colorOf(nodeIdx))
        if (this.meshes[lv].instanceColor) this.meshes[lv].instanceColor!.needsUpdate = true
        return
      }
    }
  }

  /** 根据射线命中的 mesh + instanceId 找回全局节点索引 */
  nodeIndexAt(mesh: THREE.Object3D, instanceId: number): number | null {
    const lv = this.meshes.indexOf(mesh as THREE.InstancedMesh)
    if (lv < 0 || instanceId >= this.metas[lv].length) return null
    return this.metas[lv][instanceId].nodeIdx
  }
}
