"""Checks PI against the spec's formula (tree/CO2 terms absent) and the built JSON."""
import json, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from build_pollution_index import pollution_index, CSV, ROOT

def spec_pi(r):  # hand-written from the markdown spec, renormalised over 3 air terms
    s = lambda x, lo, hi: min(max((x - lo) / (hi - lo), 0), 1) * 100
    air = .5*s(r.pm25, 5, 150) + .3*s(r.no2, 0, 1.5e16) + .2*s(r.aod, 0, 2)
    return air * (1 - .25 * min(max(r.rain_mm / 200, 0), 1))

df = pd.read_csv(CSV); out = pollution_index(df)
exp = df.apply(spec_pi, axis=1)
assert np.allclose(out["PI"], exp), "PI differs from spec formula"
assert out["PI"].between(0, 100).all()
j = json.load(open(os.path.join(ROOT, "frontend/data/pollution_index.json")))
assert len(j["cities"]) == 8 and all(len(c["pi"]) == 240 for c in j["cities"].values())
print("pollution index tests passed (1920 rows)")
