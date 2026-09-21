import * as THREE from 'three'
import type { PlacedNode } from './layout'
import { CATEGORY_COLORS } from './scene'
import { ERA_COUNT } from './data'

const SEG = 8 // 每条弧线的分段数

/**
 * 真实依赖边：prereqs 中每条依赖连一条弧线（前置节点 → 当前节点），
 * 控制点向塔轴内收，颜色取目标节点（当前科技）的领域色。
 */
export function buildEdges(placed: PlacedNode[]): THREE.LineSegments {
  const byId = new Map(placed.map(p => [p.node.id, p]))

  const positions: number[] = []
  const colors: number[] = []
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3()
  const mid = new THREE.Vector3(), ctrl = new THREE.Vector3(), axisPt = new THREE.Vector3()
  const a = new THREE.Vector3(), b = new THREE.Vector3()

  for (const node of placed) {
    for (const prereqId of node.node.prereqs) {
      const from = byId.get(prereqId)
      if (!from) continue // 数据已验证无悬空，防御性跳过
      p0.copy(from.position)
      p1.copy(node.position)

      // 控制点：中点向塔轴内收
      mid.addVectors(p0, p1).multiplyScalar(0.5)
      axisPt.set(0, mid.y, 0)
      ctrl.copy(axisPt).sub(mid)
      const bend = Math.min(8, p0.distanceTo(p1) * 0.12)
      ctrl.normalize().multiplyScalar(bend).add(mid)

      const c = CATEGORY_COLORS[node.node.category].clone().multiplyScalar(0.5)
      for (let s = 0; s < SEG; s++) {
        const t0 = s / SEG, t1 = (s + 1) / SEG
        quadBezier(a, p0, ctrl, p1, t0)
        quadBezier(b, p0, ctrl, p1, t1)
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b)
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
}

function quadBezier(out: THREE.Vector3, p0: THREE.Vector3, c: THREE.Vector3, p1: THREE.Vector3, t: number) {
  const it = 1 - t
  out.set(
    it * it * p0.x + 2 * it * t * c.x + t * t * p1.x,
    it * it * p0.y + 2 * it * t * c.y + t * t * p1.y,
    it * it * p0.z + 2 * it * t * c.z + t * t * p1.z,
  )
}

/** 每个时代层的标记环 + 时代名锚点 */
export function buildEraRings(eraRadii: number[], eraY: number[]): { rings: THREE.Object3D[]; anchors: { era: number; pos: THREE.Vector3 }[] } {
  const rings: THREE.Object3D[] = []
  const anchors: { era: number; pos: THREE.Vector3 }[] = []
  const labelAngle = Math.PI * 0.25 // 朝向初始相机方向

  for (let e = 0; e < ERA_COUNT; e++) {
    const y = eraY[e]
    const r = eraRadii[e] + 2.5
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r))
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const ring = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0x3a4a7a, transparent: true, opacity: 0.4,
    }))
    rings.push(ring)
    anchors.push({ era: e, pos: new THREE.Vector3(Math.cos(labelAngle) * (r + 4), y + 1.5, Math.sin(labelAngle) * (r + 4)) })
  }
  return { rings, anchors }
}
