# Reusable render helper (import via exec). Provides: load_glb(path), setup_scene(), shoot(name, eye_dir, target, scale, ortho=True, size=900, gizmo=True)
import bpy, mathutils, math
from mathutils import Vector, Matrix

def setup_scene():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'FLAT'
    sc.display.shading.color_type = 'TEXTURE'
    sc.display.shading.show_object_outline = False
    sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.55,0.55,0.6)
    sc.display.shading.background_type = 'WORLD'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    return cam

def look_at(cam, eye, target, up=None):
    eye = Vector(eye); target = Vector(target)
    f = (target - eye).normalized()
    if up is None:
        up = Vector((0,0,1)) if abs(f.z) < 0.99 else Vector((0,1,0))
    r = f.cross(up).normalized()
    u = r.cross(f).normalized()
    m = Matrix(((r.x,u.x,-f.x,eye.x),(r.y,u.y,-f.y,eye.y),(r.z,u.z,-f.z,eye.z),(0,0,0,1)))
    cam.matrix_world = m

_gizmo = []
def add_gizmo(center, size):
    for o in _gizmo: bpy.data.objects.remove(o, do_unlink=True)
    _gizmo.clear()
    sc = bpy.context.scene
    for axis, col in ((Vector((1,0,0)),(1,0,0,1)), (Vector((0,1,0)),(0,1,0,1)), (Vector((0,0,1)),(0,0.2,1,1))):
        bpy.ops.mesh.primitive_cylinder_add(radius=size*0.03, depth=size, location=center+axis*size/2)
        o = bpy.context.active_object
        o.rotation_mode='QUATERNION'; o.rotation_quaternion = Vector((0,0,1)).rotation_difference(axis)
        mat = bpy.data.materials.new('g'); mat.diffuse_color = col; o.data.materials.append(mat)
        _gizmo.append(o)
    # solid color for gizmo materials in workbench texture mode: use material color
    
def shoot(cam, path, eye_dir, target, scale, ortho=True, size=900, gizmo=0.0, up=None, dist=5.0):
    sc = bpy.context.scene
    sc.render.resolution_x = size; sc.render.resolution_y = size
    d = Vector(eye_dir).normalized(); t = Vector(target)
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    if ortho: cam.data.ortho_scale = scale
    else: cam.data.angle = scale
    cam.data.clip_start = 0.001; cam.data.clip_end = 100
    look_at(cam, t + d*dist, t, up)
    if gizmo: add_gizmo(t - Vector((gizmo*0.0,0,0)), gizmo)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
