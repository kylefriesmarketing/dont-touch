import bpy, math, random, os
from mathutils import Vector
bpy.context.preferences.filepaths.save_version=0
random.seed(1409)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def mat(name, color):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=.88
    return m
bark=mat('warm bark',(.19,.105,.047)); leaf=mat('summer foliage',(.19,.38,.055)); light=mat('leaf tips',(.31,.48,.10)); dark=mat('pine needles',(.055,.20,.10)); stone=mat('weathered stone',(.34,.36,.29)); moss=mat('lichen',(.29,.34,.14))
def branch(a,b,r1,r2,m):
    d=Vector(b)-Vector(a)
    bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=r1,radius2=r2,depth=d.length,location=(Vector(a)+Vector(b))/2)
    o=bpy.context.object; o.rotation_euler=d.to_track_quat('Z','Y').to_euler(); o.data.materials.append(m); return o

def blob(loc,scale,m,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc)
    o=bpy.context.object; o.scale=scale; o.rotation_euler=(random.random()*.3,random.random()*.3,random.random()*6.28); o.data.materials.append(m); return o

def finish(name,parts):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join()
    o=bpy.context.object; o.name=name; bpy.context.scene.cursor.location=(0,0,0); bpy.ops.object.origin_set(type='ORIGIN_CURSOR'); bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    return o
parts=[branch((0,0,0),(.025,0,.72),.065,.027,bark)]
for i in range(7):
    a=i*2.399; z=.48+(i%3)*.13; end=(math.cos(a)*.27,math.sin(a)*.27,z+.14)
    parts.append(branch((0,0,z-.15),end,.026,.009,bark)); parts.append(blob(end,(.26,.23,.23),light if i%3==0 else leaf,2))
parts.append(blob((0,0,.91),(.24,.22,.22),light,2)); finish('oak',parts)
parts=[branch((0,0,0),(.016,0,1.23),.041,.008,bark)]
# Uneven branch skirts with pointed, drooping tips, instead of solid cones.
for j in range(6):
    z=.19+j*.16; radius=.32-j*.041; verts=[(.01,0,z+.34)]; faces=[]; seg=16
    for i in range(seg):
        a=i*math.tau/seg+j*.71; r=radius*(1 if i%2==0 else .64)*(1+random.uniform(-.1,.1))
        verts.append((math.cos(a)*r,math.sin(a)*r,z+(.01 if i%2==0 else .075)))
    verts.append((.01,0,z+.085))
    for i in range(seg):
        k=(i+1)%seg;faces.append((0,i+1,k+1));faces.append((seg+1,k+1,i+1))
    mesh=bpy.data.meshes.new('fir branches');mesh.from_pydata(verts,[],faces);mesh.materials.append(dark);mesh.materials.append(leaf)
    o=bpy.data.objects.new('needle tier',mesh);bpy.context.collection.objects.link(o)
    for p in mesh.polygons:p.material_index=1 if p.index%7==0 else 0
    parts.append(o)
finish('pine',parts)
parts=[blob((0,0,.14),(.34,.24,.22),stone,2),blob((.13,.02,.29),(.16,.13,.033),moss,1)]
finish('rock',parts)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'tools','nature-kit.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'assets','nature.glb'),export_format='GLB',export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False,export_extras=False)
print('Nature kit exported: oak, pine, lichen rock')
