"""Pose-test the rig inside Blender and render the result.
Run: Blender -b tools/build/orc_rig.blend --python tools/rig/test_pose.py -- <scenario> <outprefix>
"""
import bpy, sys, os, math
from mathutils import Vector, Matrix
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, 'render_helpers.py')).read())
argv = sys.argv[sys.argv.index('--')+1:]
scenario, prefix = argv[0], argv[1]
arm = bpy.data.objects['OrcRig']; mesh = bpy.data.objects['Orc']
bpy.context.view_layer.objects.active = arm

def rot(name, axis, deg):
    pb = arm.pose.bones[name]
    head = pb.head.copy()
    ax = {'x':Vector((1,0,0)),'y':Vector((0,1,0)),'z':Vector((0,0,1))}[axis] if isinstance(axis,str) else Vector(axis)
    M = Matrix.Translation(head) @ Matrix.Rotation(math.radians(deg), 4, ax) @ Matrix.Translation(-head)
    pb.matrix = M @ pb.matrix
    bpy.context.view_layer.update()

def fist(side, amounts=(70, 80, 60), thumb=(35, 50, 40)):
    sgn = -1 if side == 'R' else 1   # right fingers point -X -> curl by negative rotation about +Y
    for f in ('Index','Middle','Ring','Pinky'):
        for k,a in enumerate(amounts):
            rot('%s%d_%s'%(f,k+1,side), 'y', sgn*a)
    return

cam = setup_scene()
sc = bpy.context.scene
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'

if scenario == 'fist':
    fist('R'); fist('L')
    t = Vector((-0.44,0.0,0.57))*3.241
    for name, d in (('top',(0,0,1)),('front',(0,-1,0)),('back',(0,1,0)),('bottom',(0,0,-1)),('tip',(-1,0,0))):
        shoot(cam, f'{prefix}_{name}.png', d, t, 0.55, up=Vector((0,1,0)) if name in ('top','bottom') else None)
elif scenario == 'body':
    rot('UpperArm_R','y',70); rot('LowerArm_R','z',70)
    rot('UpperArm_L','y',-40)
    rot('Spine','x',15); rot('Spine1','x',15); rot('Spine2','x',10)
    rot('Head','x',-10); rot('Jaw','x',25)
    rot('UpperLeg_R','x',-35); rot('LowerLeg_R','x',55)
    rot('UpperLeg_L','x',10); rot('LowerLeg_L','x',20)
    c = Vector((0,0,0.37))*3.241
    for name, d in (('front',(0,-1,0)),('side',(-1,0,0)),('q34',(-0.7,-0.7,0.2)),('back',(0,1,0))):
        shoot(cam, f'{prefix}_{name}.png', d, c, 3.0)
elif scenario == 'rest':
    c = Vector((0,0,0.37))*3.241
    shoot(cam, f'{prefix}_front.png', (0,-1,0), c, 3.3)

if scenario == 'jaw':
    sc.display.shading.light='FLAT'; sc.display.shading.color_type='TEXTURE'
    bpy.data.materials['OrcMouthInterior'].diffuse_color=(0.22,0.03,0.04,1)
    rot('Jaw','x',int(os.environ.get('JAW','28')))
    c = Vector((0,-0.04,0.675))*3.241
    shoot(cam, f'{prefix}_front.png', (0,-1,0), c, 0.45)
    shoot(cam, f'{prefix}_side.png', (-1,0,0), c, 0.45)
    shoot(cam, f'{prefix}_q34.png', (-0.7,-0.7,0.15), c, 0.45)
elif scenario == 'jawmat':
    rot('Jaw','x',28)
    c = Vector((0,-0.04,0.675))*3.241
    shoot(cam, f'{prefix}_front.png', (0,-1,0), c, 0.45)
    shoot(cam, f'{prefix}_side.png', (-1,0,0), c, 0.45)
