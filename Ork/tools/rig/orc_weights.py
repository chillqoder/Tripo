"""Weight post-processing + morph targets for the orc rig (numpy only - Blender's Python has no scipy)."""
import numpy as np
import orc_mouth
from orc_mouth import smoothstep


def normalize(W):
    s = W.sum(1, keepdims=True)
    s[s < 1e-9] = 1.0
    return W / s


def limit_influences(W, n=4, cutoff=0.01):
    W = W.copy()
    idx = np.argsort(-W, axis=1)[:, n:]
    np.put_along_axis(W, idx, 0.0, axis=1)
    W[W < cutoff] = 0.0
    return normalize(W)


def refine_weld_weights(W, ctx):
    """Operates on the welded mesh (true surface connectivity)."""
    log = ctx["log"]
    missing = np.nonzero(W.sum(1) < 1e-6)[0]
    if len(missing):
        solved = np.nonzero(W.sum(1) >= 1e-6)[0]
        P = ctx["P_weld"]
        for vi in missing:
            d = ((P[solved] - P[vi]) ** 2).sum(1)
            W[vi] = W[solved[d.argmin()]]
        log("filled %d unweighted verts from nearest neighbours" % len(missing))
    return normalize(W)


def refine_orig_weights(W, ctx):
    S, P, bi, log = ctx["S"], ctx["P_orig"], ctx["bone_index"], ctx["log"]
    jb = bi["Jaw"]
    W = W.copy()
    W[:, jb] = 0.0
    W = normalize(W)
    J = orc_mouth.jaw_weights(P, S, ctx["mouth_info"], ctx["ivory"])
    log("jaw weights: %d verts with J>0.05, %d with J>0.95" % ((J > 0.05).sum(), (J > 0.95).sum()))
    W = W * (1 - J[:, None])
    W[:, jb] = J
    return limit_influences(W)


def breath_displacement(P, S):
    """Smooth chest/belly expansion field (metres) evaluated at positions P (metres)."""
    p = P / S
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    yc = -0.006
    ry = y - yc
    r = np.sqrt(x * x + ry * ry) + 1e-6
    dx, dy = x / r, ry / r
    front = 0.35 + 0.65 * np.clip(-ry / 0.07, 0, 1)
    belly = np.exp(-((z - 0.45) / 0.030) ** 2) * 0.0038
    chest = np.exp(-((z - 0.545) / 0.045) ** 2) * 0.0064
    upper = np.exp(-((z - 0.60) / 0.030) ** 2) * 0.0016
    lat = 1 - smoothstep(0.10, 0.17, np.abs(x))
    amp = (belly + chest + upper) * front * lat
    d = np.stack([dx * amp * 0.8, dy * amp, chest * 0.30 * front * lat], axis=1)
    return d * S
