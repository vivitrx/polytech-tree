import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ERA_COUNT } from './data'
import { startViewDistance } from './layout'

// 相机系统：环绕观察（默认）+ 螺旋上升漫游动画
const TOUR_DURATION = 72 // 秒
const TOUR_BLEND = 2.2   // 开场从当前位姿融入路径的时长（秒）

export type CameraMode = 'orbit' | 'tour'

export class CameraRig {
  mode: CameraMode = 'orbit'
  controls: OrbitControls
  onEraChange?: (era: number) => void
  onTourEnd?: () => void

  private camera: THREE.PerspectiveCamera
  private eraRadii: number[]
  private eraY: number[]
  private towerHeight: number
  private tourT = 0
  private lastEra = -1
  private startPos = new THREE.Vector3()
  private startTarget = new THREE.Vector3()
  private lookTarget = new THREE.Vector3()

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, eraRadii: number[], eraY: number[], towerHeight: number) {
    this.camera = camera
    this.eraRadii = eraRadii
    this.eraY = eraY
    this.towerHeight = towerHeight

    this.controls = new OrbitControls(camera, dom)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 0.35
    this.controls.maxDistance = 950
    this.controls.minDistance = 6
    this.controls.target.set(0, this.towerHeight * 0.5, 0)

    // 用户一旦交互就停掉自动旋转
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false })

    // ESC 中断漫游
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.mode === 'tour') this.stopTour()
    })
    // 点击画布中断漫游
    dom.addEventListener('pointerdown', () => {
      if (this.mode === 'tour') this.stopTour()
    })
  }

  resetView() {
    this.stopTour()
    this.controls.target.set(0, this.towerHeight * 0.5, 0)
    const d = startViewDistance(this.eraRadii, this.towerHeight) / Math.SQRT2
    this.camera.position.set(d, this.towerHeight * 0.68, d)
    this.controls.autoRotate = true
    this.controls.update()
  }

  startTour() {
    if (this.mode === 'tour') return
    this.mode = 'tour'
    this.tourT = 0
    this.lastEra = -1
    this.startPos.copy(this.camera.position)
    this.startTarget.copy(this.controls.target)
    this.controls.enabled = false
  }

  stopTour() {
    if (this.mode !== 'tour') return
    this.mode = 'orbit'
    this.controls.enabled = true
    this.controls.target.copy(this.lookTarget.lengthSq() > 0 ? this.lookTarget : new THREE.Vector3(0, this.camera.position.y, 0))
    this.controls.update()
    this.onTourEnd?.()
  }

  update(dt: number) {
    if (this.mode === 'orbit') {
      this.controls.update()
      return
    }

    this.tourT += dt / TOUR_DURATION
    if (this.tourT >= 1) {
      this.tourT = 1
      this.applyTourPose(this.tourT)
      this.stopTour()
      return
    }
    this.applyTourPose(this.tourT)
  }

  private applyTourPose(t: number) {
    const y = -8 + t * (this.towerHeight + 16)
    const angle = -Math.PI * 0.25 + t * Math.PI * 5
    const radius = this.radiusAtY(y) + 22

    const pos = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
    const target = new THREE.Vector3(0, Math.min(y + 12, this.towerHeight + 4), 0)

    // 开场位姿融入
    if (this.tourT * TOUR_DURATION < TOUR_BLEND) {
      const k = (this.tourT * TOUR_DURATION) / TOUR_BLEND
      const s = k * k * (3 - 2 * k) // smoothstep
      pos.lerpVectors(this.startPos, pos, s)
      target.lerpVectors(this.startTarget, target, s)
    }

    this.camera.position.copy(pos)
    this.lookTarget.copy(target)
    this.camera.lookAt(target)

    // 时代字幕：按各层实际 Y 位置检测
    let era = 0
    for (let e = 0; e < ERA_COUNT; e++) {
      if (y >= this.eraY[e] - (this.eraY[e] - (e > 0 ? this.eraY[e - 1] : -12)) * 0.45) era = e
      else break
    }
    if (era !== this.lastEra) {
      this.lastEra = era
      this.onEraChange?.(era)
    }
  }

  private radiusAtY(y: number): number {
    // 在各层实际 Y 位置之间插值半径
    if (y <= this.eraY[0]) return this.eraRadii[0]
    for (let i = 0; i < ERA_COUNT - 1; i++) {
      if (y >= this.eraY[i] && y <= this.eraY[i + 1]) {
        const frac = (y - this.eraY[i]) / (this.eraY[i + 1] - this.eraY[i])
        return this.eraRadii[i] + (this.eraRadii[i + 1] - this.eraRadii[i]) * frac
      }
    }
    return this.eraRadii[ERA_COUNT - 1]
  }
}
