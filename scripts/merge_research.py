# -*- coding: utf-8 -*-
"""
merge_research.py — 合并 data/research/ 下 18 个任务包片段。
L2 机械去重：id / 规范化 nameEn / aliases / wikiEn 四键匹配，命中即合并。
输出：data/techs.json + merge-report.json（供 L3 语义审查）。
"""
import json
import re
import glob
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESEARCH_DIR = os.path.join(ROOT, "data", "research")
OUT_JSON = os.path.join(ROOT, "data", "techs.json")
REPORT = os.path.join(ROOT, "data", "merge-report.json")

REQUIRED_FIELDS = ["id", "name", "nameEn", "wikiEn", "aliases", "year",
                   "era", "category", "importance", "prereqs", "related", "desc"]


def norm_title(s: str) -> str:
    """规范化英文标题：小写、去标点、空格折叠。不做词干/复数归一（误伤率高）。"""
    if not s:
        return ""
    s = s.lower().strip()
    s = re.sub(r"[\u2010-\u2015\-_/(),.:;!?'\"&]", " ", s)  # 标点（含 en-dash）转空格
    s = re.sub(r"\s+", " ", s).strip()
    return s


# L3 裁决：以下 id 对虽被机械键匹配，但实为不同概念/不同代，强制拆为独立条目
FORCE_SPLIT = {
    frozenset(p) for p in [
        ("ssl", "http"),                              # HTTPS 别名碰撞；安全层 ≠ HTTP
        ("twitter", "weibo"),                          # 共同别名“微博客”；两个平台
        ("nfc", "apple_pay"),                          # 共同别名“NFC支付”；技术 ≠ 服务
        ("smart_speaker", "voice_assistant"),          # 共同别名“小度”；硬件 ≠ 软件服务
        ("gas_turbine", "gas_turbine_ship"),           # 原动机 ≠ 舰船平台
        ("insulin", "recombinant_insulin"),            # 动物胰岛素 ≠ 重组人胰岛素（代际）
        ("integrated_development_environment", "ide_ata"),  # 缩写 IDE 撞车：开发环境 ≠ 硬盘接口
        ("nuclear_marine_propulsion", "nuclear_submarine"),  # 动力系统 ≠ 舰艇平台
        ("natural_gas_salt", "natural_gas_distribution"),    # 古代火井利用 ≠ 近代管网
        ("proto_porcelain", "porcelain"),              # 原始瓷 ≠ 成熟瓷（代际）
        ("ct_precursor", "ct_scanner"),                # CT 理论前身 ≠ CT 扫描仪（代际）
        ("ptolemaic_astronomy", "ptolemy_trigonometry"),   # 地心天文模型 ≠ 三角学弦表（同书两成果）
        ("marine_clock_early", "huygens_centrifugal_force"),  # 航海钟应用 ≠ 离心力理论
        ("cuvier_paleontology_catastrophism", "cuvier_comparative_anatomy"),  # 灾变论 ≠ 比较解剖学
        ("newtonian_mechanics", "inverse_square_gravity"),  # 力学体系 ≠ 万有引力定律（独立知识节点）
    ]
}

# L3 拆分后的修补（wikiEn 置空 + 关系连线），key=id
PATCH = {
    "gas_turbine_ship": {"wikiEn": "", "add_related": ["gas_turbine"]},
    "recombinant_insulin": {"wikiEn": "", "add_prereqs": ["insulin"]},
    "natural_gas_salt": {"wikiEn": "", "add_related": ["natural_gas_distribution"]},
    "ct_precursor": {"wikiEn": "", "add_related": ["x_ray"]},
    "ct_scanner": {"add_prereqs": ["ct_precursor"]},
    "ssl": {"add_related": ["http"]},
    "twitter": {"add_related": ["weibo"]},
    "weibo": {"add_related": ["twitter"]},
    "nfc": {"add_related": ["apple_pay"]},
    "apple_pay": {"add_related": ["nfc"]},
    "smart_speaker": {"add_related": ["voice_assistant"]},
    "voice_assistant": {"add_related": ["smart_speaker"]},
    "nuclear_marine_propulsion": {"add_related": ["nuclear_submarine"]},
    "nuclear_submarine": {"add_related": ["nuclear_marine_propulsion"]},
    "lunar_calendar": {"add_related": ["calendar"]},
    "stonehenge": {"add_related": ["stone_circle"]},
    "lacquerware": {"add_prereqs": ["lacquer"]},
    "camshaft": {"add_prereqs": ["cam_mechanism"]},
    "wagonway": {"add_prereqs": ["diolkos"]},
    "modern_sewer": {"add_prereqs": ["sewerage_system"]},
    "teletype_model_33": {"add_prereqs": ["teleprinter"]},
    "wikipedia": {"add_prereqs": ["wiki"]},
    "digital_wallet": {"add_prereqs": ["digicash"]},
    "grid_plan": {"add_related": ["planned_city"]},
    # 知识包新冲突（同书/同人多成果，拆分后互链）
    "ptolemy_trigonometry": {"add_related": ["ptolemaic_astronomy"]},
    "ptolemaic_astronomy": {"add_related": ["ptolemy_trigonometry"]},
    "huygens_centrifugal_force": {"add_related": ["marine_clock_early", "pendulum_clock"]},
    "cuvier_comparative_anatomy": {"add_related": ["cuvier_paleontology_catastrophism"]},
    "cuvier_paleontology_catastrophism": {"add_related": ["cuvier_comparative_anatomy"]},
    "inverse_square_gravity": {"add_prereqs": ["newtonian_mechanics"]},
    "b2fh_nucleosynthesis": {"add_prereqs": ["bethe_stellar_nucleosynthesis"]},
    "bethe_stellar_nucleosynthesis": {"add_related": ["b2fh_nucleosynthesis"]},
    "buffon_natural_history": {"add_related": ["pliny_natural_history"]},
    "pliny_natural_history": {"add_related": ["buffon_natural_history"]},
    "streptomycin": {"remove_related": ["tuberculosis"], "remove_prereqs": ["penicillin"]},
    # 知识包反向 prereq 修正（晚出条不能作前置；同代互启改 related）
    "pythagorean_theorem": {"remove_prereqs": ["shulba_sutras"], "add_related": ["shulba_sutras"]},
    "platonic_solids": {"remove_prereqs": ["geometry_deductive"], "add_related": ["geometry_deductive"]},
    "eudoxus_proportion_theory": {"remove_prereqs": ["geometry_deductive"], "add_related": ["geometry_deductive"]},
    "diophantine_equations": {"remove_prereqs": ["algebra"]},
    "merkle_puzzles": {"remove_prereqs": ["des"]},
    "diffie_hellman": {"remove_prereqs": ["des"]},
    "hopfield_network": {"remove_prereqs": ["backpropagation"], "add_related": ["backpropagation"]},
    # 通称条目并入后代应用条后，反向（更晚的）prereq 无效，清理
    "map": {"remove_prereqs": ["clay_tablet"]},
    "ink": {"remove_prereqs": ["movable_type_printing"]},
    "bellows": {"remove_prereqs": ["blast_furnace", "water_wheel"]},
    "force_pump": {"remove_prereqs": ["crankshaft"]},
    "finery_forge": {"remove_prereqs": ["blast_furnace"]},
    "clock_tower": {"remove_prereqs": ["mechanical_clock"]},
    "proto_porcelain": {"wikiEn": "", "add_related": ["porcelain"]},
    "porcelain": {"add_prereqs": ["proto_porcelain"]},
    "coke_fuel": {"remove_prereqs": ["blast_furnace"]},
    "cannon": {"remove_prereqs": ["blast_furnace"]},
    "jacobs_staff": {"remove_prereqs": ["mariners_astrolabe"]},
    "screw_cutting_lathe": {"remove_prereqs": ["cylinder_boring_machine"]},
    "blood_transfusion": {"remove_prereqs": ["aseptic_surgery"]},
    "telephone_exchange": {"remove_prereqs": ["pulse_code_modulation"]},
    "halftone": {"remove_prereqs": ["kodak_camera"]},
    "cesarean_section": {"remove_prereqs": ["aseptic_surgery"]},
    "positron_imaging": {"remove_prereqs": ["gamma_camera"]},
    "gene_therapy": {"remove_prereqs": ["human_genome_project"]},
}

# id 撞车预修复：(批次, 原id) -> 新id（同包内引用同步重写）
PRE_ID_FIX = {
    ("14-info-network", "mosaic"): "mosaic_browser",  # NCSA Mosaic 浏览器 ≠ 古代镶嵌工艺
}

# ── 8 领域重分类 ──────────────────────────────────────────────
# 批次默认领域：21 物理包、22 化学+天地包全部入物理科学
BATCH_CATEGORY = {"21": "physical_science", "22": "physical_science"}

# id 级领域覆盖（旧包知识节点 + 20/23 包逐条归类）
CATEGORY_OVERRIDE = {
    # —— 旧 01-19 包：数学·逻辑 ——
    "zero": "math_logic", "hindu_numerals": "math_logic",
    "aristotelian_logic": "math_logic", "shulba_sutras": "math_logic",
    "geometry_deductive": "math_logic", "algebra": "math_logic",
    "symbolic_algebra": "math_logic", "analytic_geometry": "math_logic",
    "projective_geometry": "math_logic", "probability_theory": "math_logic",
    "calculus": "math_logic", "boolean_algebra": "math_logic",
    "information_theory": "math_logic", "fuzzy_logic": "math_logic",
    # —— 旧包：物理科学（物理/化学/天文地学理论） ——
    "camera_obscura": "physical_science", "archimedes_statics": "physical_science",
    "impetus_theory": "physical_science", "book_of_optics": "physical_science",
    "heliocentric_model": "physical_science", "keplers_laws": "physical_science",
    "snells_law": "physical_science", "galilean_kinematics": "physical_science",
    "boyles_law": "physical_science", "hookes_law": "physical_science",
    "pascal_law": "physical_science", "wave_theory_light": "physical_science",
    "newtonian_mechanics": "physical_science", "atomic_theory": "physical_science",
    "conservation_of_energy": "physical_science", "maxwell_equations": "physical_science",
    "periodic_table": "physical_science", "steno_stratigraphy": "physical_science",
    "x_ray_crystallography": "physical_science", "equatorium": "physical_science",
    "calendar": "physical_science", "lunar_calendar": "physical_science",
    "julian_calendar": "physical_science", "gregorian_calendar": "physical_science",
    "maya_calendar": "physical_science",
    # —— 旧包：生命科学理论归位 ——
    "cell_theory": "life_medicine", "evolution_natural_selection": "life_medicine",
    "germ_theory": "life_medicine",
    # —— 旧包：社会·生活（制度/货币/知识制度） ——
    "law_code": "society", "patent_system": "society", "coinage": "society",
    "shell_money": "society", "paper_money": "society",
    "double_entry_bookkeeping": "society", "medieval_university": "society",
    "scientific_journal": "society",
    # —— 20 包：纯数学/统计/运筹/可计算性 → 数学·逻辑 ——
    **{k: "math_logic" for k in [
        "egyptian_rhind_papyrus", "pythagorean_theorem", "irrational_numbers",
        "zeno_paradoxes", "platonic_solids", "eudoxus_proportion_theory",
        "golden_ratio", "herons_formula", "diophantine_equations",
        "liu_hui_circle_cutting", "chinese_remainder_theorem", "zu_chongzhi_pi",
        "khayyam_cubic_equations", "fibonacci_sequence", "qin_jiushao_treatise",
        "tusi_trigonometry", "ptolemy_trigonometry", "madhava_infinite_series",
        "cavalieri_principle", "fermat_last_theorem", "newton_generalized_binomial",
        "fundamental_theorem_of_calculus", "leibniz_binary", "newton_iterative_method",
        "bernoulli_law_large_numbers", "taylor_series", "demoivre_normal_curve",
        "seven_bridges_graph_theory", "calculus_of_variations", "eulers_identity",
        "bayes_theorem", "laplace_transform", "lagrange_multipliers",
        "gauss_least_squares", "monge_descriptive_geometry",
        "gauss_fundamental_theorem_algebra", "gauss_normal_error_theory",
        "central_limit_theorem", "bolzano_intermediate_value", "fourier_analysis",
        "abel_impossibility_quintic", "lobachevsky_non_euclidean", "galois_theory",
        "hamilton_quaternions", "riemann_geometry", "riemann_integral",
        "cayley_matrix_algebra", "weierstrass_epsilon_delta", "dedekind_cuts",
        "cantor_set_theory", "frege_begriffsschrift", "peano_axioms",
        "peano_space_filling_curve", "poincare_topology", "hilbert_program",
        "russell_paradox", "lebesgue_integration", "markov_chains", "zermelo_zfc",
        "godel_incompleteness", "tarski_truth_theory", "church_lambda_calculus",
        "turing_machine", "game_theory", "nash_equilibrium", "category_theory",
        "shannon_sampling_theorem", "lorenz_chaos", "kolmogorov_complexity",
        "cook_levin_np_completeness", "appel_haken_four_color",
        "black_scholes_formula", "wiles_fermat_proof", "perelman_poincare_conjecture",
        "finite_element_method", "operations_research", "mandelbrot_fractal",
        "watts_strogatz_small_world", "barabasi_scale_free_network",
    ]},
    # 20 包中的物理原理
    "fermat_principle_least_time": "physical_science",
    # —— 23 包：经济学/心理学/社会学/管理/语言/系统 → 社会·生活 ——
    **{k: "society" for k in [
        "smith_wealth_of_nations", "malthus_population", "ricardo_comparative_advantage",
        "marx_das_kapital", "marginal_utility_revolution", "wundt_experimental_psychology",
        "james_principles_psychology", "marshall_neoclassical_economics",
        "durkheim_sociology", "freud_psychoanalysis", "taylor_scientific_management",
        "gestalt_psychology", "watson_behaviorism", "weber_bureaucracy",
        "kuznets_national_income", "keynes_general_theory",
        "schumpeter_creative_destruction", "maslow_hierarchy_needs",
        "arrow_impossibility_theory", "bowlby_attachment_theory",
        "arrow_debreu_model", "simon_bounded_rationality", "miller_magical_number_seven",
        "solow_growth_model", "sapir_whorf_relativity", "chomsky_generative_grammar",
        "festinger_cognitive_dissonance", "coase_theorem", "becker_human_capital",
        "neisser_cognitive_psychology", "bertalanffy_general_systems",
        "tversky_kahneman_heuristics", "prospect_theory", "santa_fe_complex_systems",
        "pavlov_conditioned_reflex",
    ]},
    # 23 包跨界条目
    "gaia_hypothesis": "life_medicine",
}


def apply_category(rec, batch):
    """知识节点迁移到新领域；器物条目不动。"""
    rid = rec["id"]
    if rid in CATEGORY_OVERRIDE:
        rec["category"] = CATEGORY_OVERRIDE[rid]
    elif batch[:2] in BATCH_CATEGORY:
        rec["category"] = BATCH_CATEGORY[batch[:2]]
    elif batch[:2] == "23" and rec.get("category") == "information":
        rec["category"] = "society"



def merge_records(a: dict, b: dict, reason: str, sources: list) -> dict:
    """两个同概念记录合并，a 为先到（更早批次）。"""
    m = dict(a)
    # 中文名取非空，优先 a
    if not m.get("name") and b.get("name"):
        m["name"] = b["name"]
    # nameEn/wikiEn 取非空且较短的规范名（a 优先）
    for k in ("nameEn", "wikiEn"):
        if not m.get(k) and b.get(k):
            m[k] = b[k]
    # 别名并集（含被合并条目的主名，便于追溯）
    alias = set(m.get("aliases") or [])
    alias.update(b.get("aliases") or [])
    for r in (b,):
        if r.get("nameEn") and r["nameEn"] != m.get("nameEn"):
            alias.add(r["nameEn"])
        if r.get("name") and r["name"] != m.get("name"):
            alias.add(r["name"])
        if r.get("wikiEn") and r["wikiEn"] != m.get("wikiEn"):
            alias.add(r["wikiEn"])
    m["aliases"] = sorted(x for x in alias if x)
    # 关系并集（剔除指向合并双方自身的引用）
    self_ids = {a.get("id"), b.get("id")}
    m["prereqs"] = sorted((set(m.get("prereqs") or []) | set(b.get("prereqs") or [])) - self_ids)
    m["related"] = sorted((set(m.get("related") or []) | set(b.get("related") or [])) - self_ids)
    # 描述取信息量更大的（更长），优先非空中文
    if len(b.get("desc") or "") > len(m.get("desc") or ""):
        m["desc"] = b["desc"]
    # importance 取更高优先级（数值更小）
    m["importance"] = min(m.get("importance", 3), b.get("importance", 3))
    # year/era/category 保留先到（以注册表为准的修正留给 validate 阶段）
    m["_mergedFrom"] = list(dict.fromkeys(sources + [b["id"]]))
    m["_mergeReason"] = reason
    return m


def main():
    files = sorted(glob.glob(os.path.join(RESEARCH_DIR, "*.json")))
    records = []
    parse_errors = []
    for fp in files:
        batch = os.path.splitext(os.path.basename(fp))[0]
        with open(fp, encoding="utf-8") as f:
            try:
                arr = json.load(f)
            except Exception as e:
                parse_errors.append({"file": batch, "error": str(e)})
                continue
        for rec in arr:
            rec["_batch"] = batch
            new_id = PRE_ID_FIX.get((batch, rec["id"]))
            if new_id:
                old_id = rec["id"]
                rec["id"] = new_id
                for k in ("prereqs", "related"):  # 同包内引用同步重写
                    rec[k] = [new_id if x == old_id else x for x in (rec.get(k) or [])]
            apply_category(rec, batch)
            records.append(rec)

    total_in = len(records)

    # 注册表核心 id：合并时核心条目必须作为最终 id/时代归属
    with open(os.path.join(ROOT, "data", "core-ids.json"), encoding="utf-8") as f:
        CORE = {c["id"] for c in json.load(f)["coreIds"]}
    ID_REDIRECT = {}  # 被并入核心条目的非核心旧 id -> 核心 id

    # 索引：id -> 合并记录下标；其余键 -> id
    by_id = {}
    by_nameen = {}
    by_alias = {}
    by_wikien = {}
    merged = []
    auto_merges = []
    conflicts = []  # 疑似但无法自动合并

    def find_existing(rec):
        rid = rec["id"]
        if rid in by_id:
            return by_id[rid], "id"
        w = norm_title(rec.get("wikiEn", ""))
        if w and w in by_wikien:
            return by_wikien[w], "wikiEn"
        n = norm_title(rec.get("nameEn", ""))
        if n and n in by_nameen:
            return by_nameen[n], "nameEn"
        for al in rec.get("aliases") or []:
            na = norm_title(al)
            if na and na in by_alias:
                return by_alias[na], "alias"
        # 反向：现有记录的 alias 是否命中本条的 nameEn/wikiEn
        if n:
            if n in by_alias:
                return by_alias[n], "reverse-alias"
        return None, None

    for rec in records:
        idx, reason = find_existing(rec)

        def register(new_rec):
            new_rec.setdefault("_mergedFrom", [new_rec["id"]])
            merged.append(new_rec)
            i = len(merged) - 1
            by_id[new_rec["id"]] = i
            nk = norm_title(new_rec.get("nameEn", ""))
            if nk:
                by_nameen.setdefault(nk, i)
            wk = norm_title(new_rec.get("wikiEn", ""))
            if wk:
                by_wikien.setdefault(wk, i)
            for al in new_rec.get("aliases") or []:
                na = norm_title(al)
                if na:
                    by_alias.setdefault(na, i)

        if idx is not None:
            old = merged[idx]
            if frozenset((old["id"], rec["id"])) in FORCE_SPLIT:
                register(rec)  # L3 裁决：强制保留为独立条目
                continue
            # 同键匹配但 era 跨度大 → 可能是代际误并，保留独立并记录冲突
            if old["era"] != rec["era"] and reason in ("nameEn", "alias", "reverse-alias"):
                conflicts.append({
                    "reason": reason,
                    "kept": {"id": old["id"], "era": old["era"], "nameEn": old["nameEn"], "wikiEn": old.get("wikiEn")},
                    "dropped": {"id": rec["id"], "era": rec["era"], "nameEn": rec["nameEn"], "wikiEn": rec.get("wikiEn"), "batch": rec["_batch"]},
                })
                register(rec)
                continue
            if rec["id"] in CORE and old["id"] not in CORE:
                # 核心条目作为基底（最终 id/year/era/category 取核心条）
                ID_REDIRECT[old["id"]] = rec["id"]
                base, other = rec, old
                by_id[rec["id"]] = idx
            else:
                base, other = old, rec
            merged[idx] = merge_records(base, other, reason, old.get("_mergedFrom", [old["id"]]))
            for k in ("nameEn", "wikiEn"):
                nk = norm_title(merged[idx].get(k, ""))
                if nk:
                    (by_nameen if k == "nameEn" else by_wikien).setdefault(nk, idx)
            for al in merged[idx].get("aliases") or []:
                na = norm_title(al)
                if na:
                    by_alias.setdefault(na, idx)
            auto_merges.append({"into": merged[idx]["id"], "from": other["id"], "reason": reason, "batch": rec["_batch"]})
            ID_REDIRECT[other["id"]] = merged[idx]["id"]
        else:
            register(rec)

    # 全局重写被并入核心条目的旧 id 引用（须先于 PATCH 清理，保证引用名已是最终 id）
    if ID_REDIRECT:
        for r in merged:
            for k in ("prereqs", "related"):
                vals = [ID_REDIRECT.get(x, x) for x in (r.get(k) or [])]
                vals = [x for x in dict.fromkeys(vals) if x != r["id"]]
                r[k] = vals

    # 应用 L3 拆分修补
    for r in merged:
        p = PATCH.get(r["id"])
        if not p:
            continue
        if "wikiEn" in p and r.get("wikiEn"):
            r.setdefault("aliases", [])
            if r["wikiEn"] not in r["aliases"]:
                r["aliases"].append(r["wikiEn"])
            r["wikiEn"] = p["wikiEn"]
        if p.get("add_related"):
            r["related"] = sorted(set((r.get("related") or []) + p["add_related"]))
        if p.get("remove_related"):
            r["related"] = sorted(set(r.get("related") or []) - set(p["remove_related"]))
        if p.get("remove_prereqs"):
            r["prereqs"] = sorted(set(r.get("prereqs") or []) - set(p["remove_prereqs"]))
        if p.get("add_prereqs"):
            r["prereqs"] = sorted(set((r.get("prereqs") or []) + p["add_prereqs"]))

    # 关系数量上限 4：超出时优先保留年代更早、重要度更高的目标
    meta = {r["id"]: r for r in merged}
    for r in merged:
        for k in ("prereqs", "related"):
            vals = r.get(k) or []
            if len(vals) > 4:
                vals.sort(key=lambda x: (meta.get(x, {}).get("year", 99999),
                                         meta.get(x, {}).get("importance", 5)))
                r[k] = vals[:4]

    # wikiEn 重复但未被合并（理论上不应有，兜底报告）
    wikien_dupes = defaultdict(list)
    for r in merged:
        wk = norm_title(r.get("wikiEn", ""))
        if wk:
            wikien_dupes[wk].append(r["id"])
    wiki_conflicts = [{"wikiEnNorm": k, "ids": v} for k, v in wikien_dupes.items() if len(v) > 1]

    # 输出（去掉内部字段前保留溯源到报告，正式数据不含 _batch）
    out = []
    for r in merged:
        rr = {k: r.get(k) for k in REQUIRED_FIELDS}
        rr["aliases"] = rr["aliases"] or []
        rr["prereqs"] = rr["prereqs"] or []
        rr["related"] = rr["related"] or []
        out.append(rr)
    out.sort(key=lambda x: (x["year"], x["id"]))

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    report = {
        "files": [os.path.basename(x) for x in files],
        "parseErrors": parse_errors,
        "totalRaw": total_in,
        "totalMerged": len(out),
        "autoMergedCount": len(auto_merges),
        "autoMerges": auto_merges,
        "eraSpanConflicts": conflicts,
        "wikiKeyConflicts": wiki_conflicts,
    }
    with open(REPORT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"raw={total_in} merged={len(out)} auto_merges={len(auto_merges)} "
          f"era_conflicts={len(conflicts)} wiki_conflicts={len(wiki_conflicts)} parse_errors={len(parse_errors)}")


if __name__ == "__main__":
    main()
