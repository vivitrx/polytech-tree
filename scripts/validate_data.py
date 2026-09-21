# -*- coding: utf-8 -*-
"""
validate_data.py — 校验 data/techs.json（合并后唯一事实源）。
检查：schema 字段、枚举、id 唯一、引用闭合、自环、年份/era 区间、
注册表白名单、importance 配额，并输出分布统计。
"""
import json
import os
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

REQUIRED = ["id", "name", "nameEn", "wikiEn", "aliases", "year",
            "era", "category", "importance", "prereqs", "related", "desc"]

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def era_deriver(era_list):
    """era 由 year 查表：半开区间 [yearStart, yearEnd)，仅末段包含其 yearEnd（规范 §3.8）。"""
    ordered = sorted(era_list, key=lambda e: e["order"])

    def derive(year):
        for i, e in enumerate(ordered):
            last = i == len(ordered) - 1
            if e["yearStart"] <= year < e["yearEnd"] or (last and year == e["yearEnd"]):
                return e["id"]
        return None
    return derive


def main():
    techs = json.load(open(os.path.join(DATA, "techs.json"), encoding="utf-8"))
    era_list = json.load(open(os.path.join(DATA, "eras.json"), encoding="utf-8"))
    eras = {e["id"]: e for e in era_list}
    derive_era = era_deriver(era_list)
    cats = {c["id"]: c for c in json.load(open(os.path.join(DATA, "categories.json"), encoding="utf-8"))}
    core = json.load(open(os.path.join(DATA, "core-ids.json"), encoding="utf-8"))["coreIds"]
    core_map = {c["id"]: c for c in core}

    ids = set()
    id_counter = Counter()
    for t in techs:
        id_counter[t.get("id", "?")] += 1
    dup_ids = [i for i, n in id_counter.items() if n > 1]
    if dup_ids:
        err(f"重复 id: {dup_ids}")

    for t in techs:
        rid = t.get("id", "?")
        missing = [k for k in REQUIRED if k not in t]
        extra = [k for k in t if k not in REQUIRED]
        if missing:
            err(f"{rid}: 缺字段 {missing}")
        if extra:
            warn(f"{rid}: 多余字段 {extra}")
        ids.add(rid)

        if t.get("era") not in eras:
            err(f"{rid}: 非法 era={t.get('era')}")
        if t.get("category") not in cats:
            err(f"{rid}: 非法 category={t.get('category')}")
        imp = t.get("importance")
        if not isinstance(imp, int) or not (1 <= imp <= 5):
            err(f"{rid}: 非法 importance={imp}")
        y = t.get("year")
        if not isinstance(y, int):
            err(f"{rid}: 非法 year={y}")
        elif t.get("era") in eras:
            want = derive_era(y)
            if want is None:
                err(f"{rid}: year={y} 落在所有 era 区间之外")
            elif want != t["era"]:
                err(f"{rid}: era 与 year 不一致（year={y} 应为 {want}，实为 {t['era']}）—— era 由 year 生成，不得手填")
        for key in ("aliases", "prereqs", "related"):
            if not isinstance(t.get(key), list):
                err(f"{rid}: {key} 必须是数组")
        if len(t.get("prereqs", [])) > 4 or len(t.get("related", [])) > 4:
            warn(f"{rid}: 关系超过 4 条")
        if rid in (t.get("prereqs") or []) or rid in (t.get("related") or []):
            err(f"{rid}: 自引用")
        if not t.get("wikiEn"):
            warn(f"{rid}: wikiEn 为空")
        if not t.get("name"):
            warn(f"{rid}: 中文名留空（将回退显示英文）")
        if t.get("desc") and len(t["desc"]) > 40:
            warn(f"{rid}: desc 超 40 字 ({len(t['desc'])})")

    # 引用闭合
    year_of = {t["id"]: t["year"] for t in techs if "id" in t and isinstance(t.get("year"), int)}
    dangling = defaultdict(list)
    for t in techs:
        for key in ("prereqs", "related"):
            for ref in t.get(key) or []:
                if ref not in ids:
                    dangling[ref].append(f"{t['id']}({key})")
                elif key == "prereqs" and isinstance(t.get("year"), int) and ref in year_of:
                    if year_of[ref] > t["year"]:
                        warn(f"{t['id']}: prereq {ref} 年份晚于本条（{year_of[ref]} > {t['year']}）")
    if dangling:
        for ref, used in sorted(dangling.items()):
            warn(f"悬空引用 {ref} <- {used}")

    # 注册表白名单
    missing_core = []
    mismatched_core = []
    for cid, c in core_map.items():
        t = next((x for x in techs if x.get("id") == cid), None)
        if t is None:
            missing_core.append(cid)
        else:
            if t["era"] != c["era"] or t["category"] != c["category"]:
                mismatched_core.append(f"{cid}: 数据 era={t['era']}/cat={t['category']} vs 注册表 {c['era']}/{c['category']}")
    if missing_core:
        err(f"缺失注册表核心 id（{len(missing_core)}）: {missing_core}")
    for m in mismatched_core:
        err(f"注册表归属不一致: {m}")

    # 统计
    by_era = Counter(t["era"] for t in techs)
    by_cat = Counter(t["category"] for t in techs)
    by_imp = Counter(t["importance"] for t in techs)
    cross = Counter((t["era"], t["category"]) for t in techs)

    print("=== 校验结果 ===")
    print(f"总数: {len(techs)}")
    print(f"错误: {len(errors)}  警告: {len(warnings)}  悬空引用种类: {len(dangling)}")
    print("\n-- 按时代 --")
    for eid, e in sorted(eras.items(), key=lambda x: x[1]["order"]):
        print(f"  {e['name']:<12} {by_era.get(eid, 0)}")
    print("\n-- 按领域 --")
    for cid, c in cats.items():
        print(f"  {c['name']:<10} {by_cat.get(cid, 0)}")
    print("\n-- 按重要度（1 最高）--")
    for i in range(1, 6):
        print(f"  {i}: {by_imp.get(i, 0)}")

    out_report = os.path.join(DATA, "validate-report.json")
    with open(out_report, "w", encoding="utf-8") as f:
        json.dump({
            "total": len(techs), "errors": errors, "warnings": warnings,
            "dangling": {k: v for k, v in dangling.items()},
            "missingCoreIds": missing_core,
            "byEra": dict(by_era), "byCategory": dict(by_cat),
            "byImportance": dict(by_imp),
        }, f, ensure_ascii=False, indent=2)

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
