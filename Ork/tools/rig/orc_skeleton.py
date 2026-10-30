"""Skeleton specification for the supplied orc mesh.

All joint positions are expressed in the ORIGINAL Tripo units of
`fantasy+orc+3d+model.glb` (Blender Z-up, the orc faces -Y, feet at z=0,
height 0.7405).  The orc's anatomical RIGHT side is -X.  The positions were
measured from cross-sections of the mesh (see docs/rig_notes.md).

Each entry: name -> dict(parent, head, tail, connect, deform)
Right-side bones are authored explicitly; left-side bones are mirrored (x -> -x).
"""

# --- finger layouts (right hand) ----------------------------------------------------------
# joints: MCP, PIP, DIP, TIP positions along the finger axis
FINGERS_R = {
    "Index":  [(-0.436, -0.021, 0.591), (-0.458, -0.021, 0.589), (-0.475, -0.021, 0.587), (-0.489, -0.021, 0.585)],
    "Middle": [(-0.438,  0.002, 0.592), (-0.462,  0.002, 0.590), (-0.481,  0.002, 0.587), (-0.498,  0.002, 0.584)],
    "Ring":   [(-0.436,  0.024, 0.592), (-0.458,  0.024, 0.590), (-0.477,  0.024, 0.587), (-0.493,  0.024, 0.585)],
    "Pinky":  [(-0.432,  0.042, 0.592), (-0.452,  0.042, 0.590), (-0.468,  0.042, 0.588), (-0.485,  0.042, 0.586)],
}
# thumb joints: CMC, MCP, IP, TIP
THUMB_R = [(-0.402, -0.026, 0.578), (-0.421, -0.040, 0.573), (-0.433, -0.049, 0.5705), (-0.446, -0.054, 0.568)]


def mirror(p):
    return (-p[0], p[1], p[2])


def build_spec():
    spec = {}
    order = []

    def add(name, parent, head, tail, connect=False, deform=True):
        spec[name] = dict(parent=parent, head=tuple(head), tail=tuple(tail), connect=connect, deform=deform)
        order.append(name)

    # ---- spine / head ----
    add("Hips",   None,     (0, -0.008, 0.350), (0, -0.010, 0.395))
    add("Spine",  "Hips",   (0, -0.010, 0.395), (0, -0.012, 0.455), True)
    add("Spine1", "Spine",  (0, -0.012, 0.455), (0, -0.006, 0.525), True)
    add("Spine2", "Spine1", (0, -0.006, 0.525), (0,  0.002, 0.605), True)
    add("Neck",   "Spine2", (0,  0.002, 0.605), (0, -0.010, 0.648), True)
    add("Head",   "Neck",   (0, -0.010, 0.648), (0, -0.030, 0.738), True)
    add("HeadTop_End", "Head", (0, -0.030, 0.738), (0, -0.030, 0.750), True, deform=False)
    add("Jaw",    "Head",   (0, -0.022, 0.677), (0, -0.068, 0.640))
    add("Jaw_End", "Jaw",   (0, -0.068, 0.640), (0, -0.075, 0.636), True, deform=False)

    # ---- sides ----
    for side, m in (("R", lambda p: p), ("L", mirror)):
        def P(p):
            return m(p)
        s = "_" + side
        # arm
        add("Shoulder" + s,  "Spine2",         P((-0.030, 0.003, 0.597)), P((-0.150, 0.012, 0.592)))
        add("UpperArm" + s,  "Shoulder" + s,   P((-0.150, 0.012, 0.592)), P((-0.268, 0.016, 0.588)), True)
        add("LowerArm" + s,  "UpperArm" + s,   P((-0.268, 0.016, 0.588)), P((-0.388, 0.012, 0.588)), True)
        add("Hand" + s,      "LowerArm" + s,   P((-0.388, 0.012, 0.588)), P((-0.436, 0.010, 0.590)), True)
        # fingers
        for fname, j in FINGERS_R.items():
            prev = "Hand" + s
            for k in range(3):
                bn = "%s%d%s" % (fname, k + 1, s)
                add(bn, prev, P(j[k]), P(j[k + 1]), connect=(k > 0))
                prev = bn
            add("%s4%s" % (fname, s), prev, P(j[3]), P((j[3][0] - 0.008, j[3][1], j[3][2] - 0.002)), True, deform=False)
        prev = "Hand" + s
        for k in range(3):
            bn = "Thumb%d%s" % (k + 1, s)
            add(bn, prev, P(THUMB_R[k]), P(THUMB_R[k + 1]), connect=(k > 0))
            prev = bn
        add("Thumb4" + s, prev, P(THUMB_R[3]), P((THUMB_R[3][0] - 0.006, THUMB_R[3][1] - 0.004, THUMB_R[3][2] - 0.002)), True, deform=False)
        # weapon socket (palm centre, handle runs across the palm along the knuckle line)
        add("Socket" + s, "Hand" + s, P((-0.424, 0.004, 0.578)), P((-0.424, 0.024, 0.578)), False, deform=False)
        # leg
        add("UpperLeg" + s,  "Hips",           P((-0.057, -0.004, 0.352)), P((-0.076, 0.004, 0.205)))
        add("LowerLeg" + s,  "UpperLeg" + s,   P((-0.076, 0.004, 0.205)),  P((-0.097, 0.014, 0.058)), True)
        add("Foot" + s,      "LowerLeg" + s,   P((-0.097, 0.014, 0.058)),  P((-0.105, -0.045, 0.022)), True)
        add("Toe" + s,       "Foot" + s,       P((-0.105, -0.045, 0.022)), P((-0.106, -0.090, 0.018)), True)
        add("Toe_End" + s,   "Toe" + s,        P((-0.106, -0.090, 0.018)), P((-0.106, -0.098, 0.016)), True, deform=False)
    return spec, order
