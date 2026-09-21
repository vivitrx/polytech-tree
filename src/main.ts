import './style.css'
import * as THREE from 'three'
import { TECHS, TECH_BY_ID, ERA_INFO, ERA_COUNT, CATEGORY_NAMES, CATEGORY_COUNT, CATEGORY_HEX, CATEGORY_GROUPS, GROUP_NAMES, YEAR_BASIS_LABEL } from './data'
import type { TechNode } from './data'
import { layoutTower } from './layout'
import { createScene } from './scene'
import { PolyhedraField, facesOf } from './polyhedra'
import { buildEdges, buildEraRings } from './edges'
import { buildNameLabels, buildEraLabels, updateLabelFocal } from './labels'
import { CameraRig } from './controls'

// ───── 数据与布局 ─────
const { placed, eraRadii, eraY, towerHeight } = layoutTower(TECHS)

// 统计行随数据变化，避免写死后再也数不清
document.getElementById('statLine')!.textContent =
  `${TECHS.length} 项科技 · ${ERA_COUNT} 个时代 · ${CATEGORY_COUNT} 大领域`

// ───── 场景 ─────
const { scene, camera, renderer } = createScene(towerHeight, eraRadii)

const field = new PolyhedraField(
  placed,
  CATEGORY_HEX.map(h => new THREE.Color(h))
)
field.meshes.forEach(m => scene.add(m))

scene.add(buildEdges(placed))

const { rings } = buildEraRings(eraRadii, eraY)
rings.forEach(r => scene.add(r))

const nameLabels = buildNameLabels(placed)
nameLabels.meshes.forEach(m => scene.add(m))

// 时代名标签：每个时代名拆成单字，沿该层圆环外沿固定方位弧形排布
const eraLabels = buildEraLabels(eraRadii, eraY)
eraLabels.meshes.forEach(m => scene.add(m))

// ───── 相机 ─────
const rig = new CameraRig(camera, renderer.domElement, eraRadii, eraY, towerHeight)

// ───── UI：图例 + 名称显示上限 ─────
const legend = document.getElementById('legend')!
legend.innerHTML = `
  <div class="lg-title">领域图例</div>
  ${['A', 'B', 'C', 'D'].map(g => `
    <div class="lg-group">${GROUP_NAMES[g]}</div>
    ${CATEGORY_NAMES.map((name, i) => CATEGORY_GROUPS[i] === g ? `
      <div class="lg-item">
        <span class="lg-dot" style="background:${CATEGORY_HEX[i]};color:${CATEGORY_HEX[i]}"></span>${name}
      </div>` : '').join('')}`).join('')}
  <div class="lg-sep"></div>
  <div class="lg-title">形状 = 重要度（面数）</div>
  <div class="lg-item">20 面 基石</div>
  <div class="lg-item">12 面 领域支柱</div>
  <div class="lg-item">8 面 领域内重要</div>
  <div class="lg-item">6 面 改良与细分</div>
  <div class="lg-item">4 面 长尾补充</div>
  <div class="lg-sep"></div>
  <div class="lg-title">名称显示上限</div>
  <div class="lg-limit">
    <input type="range" id="labelLimitRange" min="0" max="${TECHS.length}" step="1" value="100">
    <span id="labelLimitValue">100</span>
  </div>
  <div class="lg-hint">按到相机距离显示最近的名称</div>
  <div class="lg-sep"></div>
  <div class="lg-title">副轴 kind（规范 §3：筛选与文案）</div>
  <div class="lg-kinds" id="kindFilter"></div>
  <div class="lg-hint">点选即筛选：只压暗与让出名称名额，不动节点位置</div>
`

// ───── `kind` 副轴筛选（§3；只改颜色与名称名额，不改布局） ─────
const kindFilter = document.getElementById('kindFilter')!
const KINDS = ['原理', '工艺', '器物', '制度', '媒介'] as const
const kindCount = KINDS.map(k => placed.filter(p => p.node.kind === k).length)
const activeKinds = new Set<string>()
kindFilter.innerHTML = KINDS.map((k, i) =>
  `<button class="lg-kind" data-kind="${k}">${k}<b>${kindCount[i]}</b></button>`).join('')
function applyKindFilter() {
  const keep = activeKinds.size
    ? (idx: number) => activeKinds.has(placed[idx].node.kind)
    : null
  field.setFilter(keep)
  nameLabels.setFilter(keep)
  kindFilter.querySelectorAll('.lg-kind').forEach(el =>
    el.classList.toggle('on', activeKinds.has((el as HTMLElement).dataset.kind!)))
}
kindFilter.addEventListener('click', e => {
  const k = (e.target as HTMLElement)?.dataset?.kind
  if (!k) return
  activeKinds.has(k) ? activeKinds.delete(k) : activeKinds.add(k)
  applyKindFilter()
})

let labelLimit = 100
const limitRange = document.getElementById('labelLimitRange') as HTMLInputElement
const limitValue = document.getElementById('labelLimitValue')!
limitRange.addEventListener('input', () => {
  labelLimit = Number(limitRange.value)
  limitValue.textContent = String(labelLimit)
})

// ───── UI：字幕 ─────
const caption = document.getElementById('eraCaption')!
let captionTimer = 0
function showCaption(era: number) {
  const info = ERA_INFO[era]
  caption.innerHTML = `${info.name}<span class="sub">${info.range}</span>`
  caption.classList.add('show')
  clearTimeout(captionTimer)
  captionTimer = window.setTimeout(() => caption.classList.remove('show'), 3000)
}
rig.onEraChange = showCaption

// ───── UI：工具栏 ─────
const btnTour = document.getElementById('btnTour') as HTMLButtonElement
const btnReset = document.getElementById('btnReset') as HTMLButtonElement

btnTour.addEventListener('click', () => {
  if (rig.mode === 'tour') {
    rig.stopTour()
  } else {
    rig.startTour()
    btnTour.textContent = '⏹ 停止漫游'
    btnTour.classList.add('active')
  }
})
btnReset.addEventListener('click', () => rig.resetView())
rig.onTourEnd = () => {
  btnTour.textContent = '▶ 漫游动画'
  btnTour.classList.remove('active')
}

// ───── 悬停信息 ─────
const tooltip = document.getElementById('tooltip')!
const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
let hoverIdx: number | null = null

// 规范 §6：tooltip 同时显示"精确数值"与"真实精度"，避免把约定值读成确证
function yearText(n: TechNode): string {
  const b = YEAR_BASIS_LABEL[n.yearBasis] ?? { mark: '', approx: false }
  const abs = Math.abs(n.year)
  const core = n.year >= 0
    ? `${n.year} 年`
    : abs >= 10000 ? `前 ${(abs / 10000).toFixed(abs % 10000 === 0 ? 0 : 1)} 万年` : `公元前 ${abs} 年`
  return `${b.approx ? '约' : ''}${core}${b.mark ? `（${b.mark}）` : ''}`
}

renderer.domElement.addEventListener('pointermove', e => {
  const rect = renderer.domElement.getBoundingClientRect()
  ndc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  )
  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObjects(field.meshes, false)

  if (hits.length > 0) {
    const h = hits[0]
    const idx = field.nodeIndexAt(h.object, h.instanceId!)
    if (idx !== null) {
      hoverIdx = idx
      const n = placed[idx].node
      // 前置科技：显示名称（最多 4 个，避免溢出）
      const prereqNames = n.prereqs
        .map(id => TECH_BY_ID.get(id)?.name ?? '')
        .filter(Boolean)
        .slice(0, 4)
        .join('、')
      tooltip.innerHTML = `
        <div class="tt-name">${n.name}</div>
        <div class="tt-dim">${n.nameEn !== n.name ? n.nameEn + ' · ' : ''}${yearText(n)}</div>
        <div class="tt-dim">${ERA_INFO[n.era].name} · ${CATEGORY_NAMES[n.category]}${n.kind ? ' · ' + n.kind : ''}</div>
        <div class="tt-dim">重要度 ${'★'.repeat(6 - n.importance)}${'☆'.repeat(n.importance - 1)}　${facesOf(n.importance)} 面</div>
        ${prereqNames ? `<div class="tt-dim">前置：${prereqNames}</div>` : ''}
        ${n.desc ? `<div class="tt-desc">${n.desc}</div>` : ''}
      `
      tooltip.style.left = `${e.clientX + 16}px`
      tooltip.style.top = `${e.clientY + 12}px`
      tooltip.classList.add('show')
      renderer.domElement.style.cursor = 'pointer'
      return
    }
  }
  hoverIdx = null
  tooltip.classList.remove('show')
  renderer.domElement.style.cursor = ''
})

// ───── 自适应窗口 ─────
function refreshView() {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  updateLabelFocal(innerHeight, camera.fov) // 标签屏幕最小像素换算依赖焦距
}
refreshView()
window.addEventListener('resize', refreshView)

// ───── 主循环 ─────
const clock = new THREE.Clock()

function loop() {
  requestAnimationFrame(loop)
  const dt = Math.min(clock.getDelta(), 0.1)
  const time = clock.elapsedTime

  field.update(time)
  field.highlight(hoverIdx)
  rig.update(dt)
  eraLabels.update() // 时代名位置固定，无需每帧更新（保留接口兼容）
  nameLabels.update(camera, labelLimit, innerWidth, innerHeight) // 名称：仅完整在屏内的，按距离保留最近 limit 个

  renderer.render(scene, camera)
}
loop()
