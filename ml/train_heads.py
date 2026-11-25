"""
Step 2: build a calibrated ensemble on top of the cached model outputs.
(Seconds to run: only small logistic-regression "heads" are fitted. The big
pretrained networks are NOT retrained.)

    python ml/train_heads.py --csv indiana_reports.csv --cache <dir> --out ml/heads/heads.npz

For every disease it compares, on patients held out from fitting:
  base      score of the single deployed model (densenet121-res224-all)
  avg       plain average of every model that predicts the disease
  stack     logistic regression on the logit scores of all 5 models
  stack+f   stack + compressed image features of the two strongest models
and keeps the best one. Thresholds are tuned per disease (Youden's J).

"Is this a chest X-ray?" is checked separately at inference time (ensemble.py,
pretrained X-ray autoencoder + colour check).

Honesty: 30% of patients are held out entirely (never used for fitting or
threshold choice). Headline numbers come from that set only.
"""
import argparse
import json
import os

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegressionCV
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import StandardScaler

from evaluate_full import LABEL_MAP

MODELS = ["densenet121-res224-all", "densenet121-res224-pc", "densenet121-res224-nih",
          "densenet121-res224-chex", "resnet50-res512-all"]
FEAT_MODELS = ["densenet121-res224-all", "resnet50-res512-all"]
N_PCA = 48
SEED = 7


def logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def youden(y, s):
    order = np.unique(s)
    best, bt = -1, 0.5
    for t in np.quantile(s, np.linspace(0.02, 0.98, 97)):
        pred = s >= t
        sens = (pred & y).sum() / max(y.sum(), 1)
        spec = (~pred & ~y).sum() / max((~y).sum(), 1)
        if sens + spec - 1 > best:
            best, bt = sens + spec - 1, t
    return float(bt)


def spec_threshold(y, s, spec=0.95):
    """Lowest score that still keeps `spec` of disease-free patients below it."""
    return float(np.quantile(s[~y], spec))


def sens_spec(y, s, t):
    pred = s >= t
    return float((pred & y).sum() / max(y.sum(), 1)), float((~pred & ~y).sum() / max((~y).sum(), 1))


class Head:
    """Standardise -> (optional PCA on features) -> logistic regression."""

    def __init__(self, use_feat):
        self.use_feat = use_feat

    def _x(self, S, F, fit=False):
        parts = [S]
        if self.use_feat:
            if fit:
                self.pcas = [PCA(N_PCA, random_state=SEED).fit(f) for f in F]
            parts += [p.transform(f) for p, f in zip(self.pcas, F)]
        X = np.hstack(parts)
        if fit:
            self.scaler = StandardScaler().fit(X)
        return self.scaler.transform(X)

    def fit(self, S, F, y):
        X = self._x(S, F, fit=True)
        self.lr = LogisticRegressionCV(Cs=[0.003, 0.01, 0.03, 0.1, 0.3, 1.0], cv=4, scoring="roc_auc",
                                       max_iter=3000, n_jobs=-1).fit(X, y)
        return self

    def predict(self, S, F):
        return self.lr.predict_proba(self._x(S, F))[:, 1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    meta = np.load(os.path.join(args.cache, "meta.npz"))
    uids = meta["uids"]
    df = pd.read_csv(args.csv)
    probs = {int(r.uid): set(t.strip() for t in str(r.Problems).split(";")) for r in df.itertuples()}

    data = {m: np.load(os.path.join(args.cache, f"{m}.npz")) for m in MODELS}
    names = {m: [str(n) for n in data[m]["names"]] for m in MODELS}
    target_names = names["densenet121-res224-all"]  # the 18 pathologies shown in the app

    # score matrix: logit of every (model, pathology) output that exists
    cols, S_all = [], []
    for m in MODELS:
        out = data[m]["out"].astype(np.float64)
        for j, n in enumerate(names[m]):
            if n and not np.isnan(out[:, j]).all():
                cols.append((m, n))
                S_all.append(logit(np.nan_to_num(out[:, j], nan=0.5)))
    S_all = np.stack(S_all, 1)
    F_all = [data[m]["feat"].astype(np.float32) for m in FEAT_MODELS]

    labels = {d: np.array([any(t in probs[u] for t in terms) for u in uids]) for d, terms in LABEL_MAP.items()}
    labels["_any"] = np.zeros(len(uids), bool)
    for d in LABEL_MAP:
        labels["_any"] |= labels[d]
    normal = np.array([probs[u] == {"normal"} for u in uids])

    idx = np.arange(len(uids))
    tr, te = train_test_split(idx, test_size=0.3, random_state=SEED, stratify=labels["_any"])
    print(f"{len(uids)} patients: {len(tr)} for fitting, {len(te)} held out for testing\n")

    report, heads = {}, {}
    test_scores = {}  # disease -> (held-out scores, possible thr, detected thr), all fitted on training part only
    base_col = {n: cols.index(("densenet121-res224-all", n)) for n in target_names if ("densenet121-res224-all", n) in cols}

    for d, y in labels.items():
        if y[tr].sum() < 10 or y[te].sum() < 5:
            continue
        # candidate scores on the held-out set
        if d == "_any":
            base_s = np.max(np.stack([S_all[:, base_col[n]] for n in LABEL_MAP if n in base_col], 1), 1)
            avg_s = base_s
        else:
            base_s = S_all[:, base_col[d]] if d in base_col else None
            same = [i for i, (m, n) in enumerate(cols) if n == d]
            avg_s = S_all[:, same].mean(1) if same else None
        cands = {}
        if base_s is not None:
            cands["base"] = (None, base_s)
        if avg_s is not None and d != "_any":
            cands["avg"] = (None, avg_s)
        for name, use_feat in [("stack", False), ("stack+f", True)]:
            # out-of-fold predictions on the training part (for choosing the method + threshold)
            oof = np.zeros(len(tr))
            for a, b in StratifiedKFold(4, shuffle=True, random_state=SEED).split(tr, y[tr]):
                h = Head(use_feat).fit(S_all[tr[a]], [f[tr[a]] for f in F_all], y[tr[a]])
                oof[b] = h.predict(S_all[tr[b]], [f[tr[b]] for f in F_all])
            h = Head(use_feat).fit(S_all[tr], [f[tr] for f in F_all], y[tr])
            cands[name] = (h, None, oof)

        rows = {}
        for name, c in cands.items():
            if c[0] is None:  # fixed score, no fitting
                s_tr, s_te = c[1][tr], c[1][te]
            else:
                s_tr, s_te = c[2], c[0].predict(S_all[te], [f[te] for f in F_all])
            if c[0] is None:
                s_tr, s_te = 1 / (1 + np.exp(-s_tr)), 1 / (1 + np.exp(-s_te))
            t = youden(y[tr], s_tr)
            td = max(spec_threshold(y[tr], s_tr), t)
            sens, spec = sens_spec(y[te], s_te, t)
            dsens, dspec = sens_spec(y[te], s_te, td)
            rows[name] = {"auc_train_oof": round(roc_auc_score(y[tr], s_tr), 3),
                          "auc_test": round(roc_auc_score(y[te], s_te), 3),
                          "sens_test": round(sens, 3), "spec_test": round(spec, 3),
                          "detect_sens_test": round(dsens, 3), "detect_spec_test": round(dspec, 3)}
        # choose the method on TRAINING out-of-fold AUROC (never on the test set)
        best = max(rows, key=lambda k: rows[k]["auc_train_oof"])
        c = cands[best]
        if c[0] is None:
            b_tr, b_te = 1 / (1 + np.exp(-c[1][tr])), 1 / (1 + np.exp(-c[1][te]))
        else:
            b_tr, b_te = c[2], c[0].predict(S_all[te], [f[te] for f in F_all])
        tt = youden(y[tr], b_tr)
        test_scores[d] = (b_te, tt, max(spec_threshold(y[tr], b_tr), tt))
        report[d] = {"n_pos": int(y.sum()), "chosen": best, "methods": rows}
        line = "  ".join(f"{k}={v['auc_test']:.3f}" for k, v in rows.items())
        print(f"{d:14s} n+={y.sum():4d}  test AUROC: {line}   -> using {best}: "
              f"possible sens {rows[best]['sens_test']:.0%}/spec {rows[best]['spec_test']:.0%}, "
              f"detected sens {rows[best]['detect_sens_test']:.0%}/spec {rows[best]['detect_spec_test']:.0%}", flush=True)

        # final head for deployment: refit the chosen method on ALL patients
        if best in ("stack", "stack+f"):
            use_feat = best == "stack+f"
            oof = np.zeros(len(idx))
            for a, b in StratifiedKFold(5, shuffle=True, random_state=SEED).split(idx, y):
                oof[b] = Head(use_feat).fit(S_all[a], [f[a] for f in F_all], y[a]).predict(S_all[b], [f[b] for f in F_all])
            h = Head(use_feat).fit(S_all, F_all, y)
            t = youden(y, oof)
            heads[d] = {"kind": best, "head": h, "threshold": t, "detect": max(spec_threshold(y, oof), t)}
        else:
            s = 1 / (1 + np.exp(-cands[best][1]))
            t = youden(y, s)
            heads[d] = {"kind": best, "threshold": t, "detect": max(spec_threshold(y, s), t)}

    # ---- what a user sees: flags per patient and "most likely diagnosis" hit rate (held-out only) ----
    SIGNS = {"Lung Opacity", "Infiltration"}
    dz = [d for d in test_scores if not d.startswith("_")]
    def disp(p, t, td):
        return np.where(p < t, 0.4 * p / t, np.where(p < td, 0.4 + 0.1 * (p - t) / (td - t + 1e-9), 0.5 + 0.5 * (p - td) / (1 - td + 1e-9)))
    new = np.stack([disp(*test_scores[d]) for d in dz], 1)
    base_i = [base_col.get(d) for d in dz]
    old = np.stack([1 / (1 + np.exp(-S_all[te, i])) for i in base_i], 1)
    truth = np.stack([labels[d][te] for d in dz], 1)
    nrm = normal[te]
    abn = truth.any(1)
    def summary(sc, name):
        det = sc >= 0.5
        prim_hit = []
        for r in np.where(abn)[0]:
            cand = [j for j in np.argsort(-sc[r]) if det[r, j]]
            spec_first = [j for j in cand if dz[j] not in SIGNS] or cand
            if spec_first:
                prim_hit.append(truth[r, spec_first[0]])
        print(f"  {name:22s} healthy patients: {det[nrm].sum(1).mean():.2f} false 'Detected' flags on average, "
              f"{(det[nrm].sum(1) == 0).mean():.0%} with none | sick patients: {(det[abn].any(1)).mean():.0%} flagged, "
              f"most-likely diagnosis correct in {np.mean(prim_hit):.0%} of flagged")
        return {"healthy_false_flags": float(det[nrm].sum(1).mean()), "healthy_clean": float((det[nrm].sum(1) == 0).mean()),
                "sick_flagged": float(det[abn].any(1).mean()), "primary_correct": float(np.mean(prim_hit))}
    print(f"\nHeld-out patients: {nrm.sum()} completely normal, {abn.sum()} with at least one of these diseases")
    report["_user_view"] = {"old_single_model": summary(old, "old (single model)"), "new_ensemble": summary(new, "new (ensemble)")}

    # ---- save deployable parameters (plain arrays, no pickles) ----
    out = {"cols": np.array([f"{m}|{n}" for m, n in cols]), "models": np.array(MODELS),
           "feat_models": np.array(FEAT_MODELS)}
    meta_out = {}
    for d, h in heads.items():
        meta_out[d] = {"kind": h["kind"], "threshold": h["threshold"], "detect": h["detect"]}
        if "head" in h:
            hh = h["head"]
            out[f"{d}|coef"] = hh.lr.coef_[0]
            out[f"{d}|b"] = np.array(hh.lr.intercept_[0])
            out[f"{d}|sc_mean"] = hh.scaler.mean_
            out[f"{d}|sc_scale"] = hh.scaler.scale_
            if hh.use_feat:
                for i, p in enumerate(hh.pcas):
                    out[f"{d}|pca{i}_mean"] = p.mean_
                    out[f"{d}|pca{i}_comp"] = p.components_
    out["meta"] = np.array(json.dumps(meta_out))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    np.savez_compressed(args.out, **out)
    json.dump(report, open(os.path.splitext(args.out)[0] + "_report.json", "w"), indent=2)

    tests = [v["methods"][v["chosen"]]["auc_test"] for k, v in report.items() if not k.startswith("_")]
    bases = [v["methods"]["base"]["auc_test"] for k, v in report.items() if not k.startswith("_") and "base" in v["methods"]]
    print(f"\nmean held-out AUROC per disease: deployed model {np.mean(bases):.3f} -> new ensemble {np.mean(tests):.3f}")
    print("saved", args.out)


if __name__ == "__main__":
    main()
