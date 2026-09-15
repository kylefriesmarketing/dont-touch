import bpy, math, random, os
bpy.context.preferences.filepaths.save_version=0
random.seed(1909)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def material(name,c):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.88;return m
plaster=material('limewash',(.64,.56,.39));wood=material('aged oak',(.12,.075,.037));straw=material('weathered thatch',(.34,.235,.105));tips=material('sunlit straw',(.48,.36,.17));stone=material('foundation stone',(.29,.30,.25))
parts=[]
def cube(loc,scale,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=scale;o.data.materials.append(mat);parts.append(o);return o
def beam(a,b,r,mat):
 from mathutils import Vector
 d=Vector(b)-Vector(a);bpy.ops.mesh.primitive_cone_add(vertices=5,radius1=r,radius2=r*.85,depth=d.length,location=(Vector(a)+Vector(b))/2);o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat);parts.append(o)
bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.47,depth=.42,location=(0,0,.25));o=bpy.context.object;o.data.materials.append(plaster);parts.append(o)
for i in range(12):
 a=i*math.tau/12;o=cube((math.cos(a)*.44,math.sin(a)*.44,.065),(.23,.14,.13),stone);o.rotation_euler.z=a+math.pi/2
for i in range(10):
 a=i*math.tau/10;beam((math.cos(a)*.472,math.sin(a)*.472,.1),(math.cos(a)*.472,math.sin(a)*.472,.48),.021,wood)
# A layered, slightly irregular thatch roof, with an overhanging eave.
verts=[];faces=[];segments=32
for j in range(7):
 t=j/6;r=.615*(1-t)+.035*t;z=.44+.46*t
 for i in range(segments):
  a=i*math.tau/segments;rr=r*(1+.023*math.sin(i*2.1+j*.8));verts.append((math.cos(a)*rr,math.sin(a)*rr,z+.01*math.sin(i*1.7)*(1-t)))
for j in range(6):
 for i in range(segments):
  a=j*segments+i;b=j*segments+(i+1)%segments;faces.append((a,b,b+segments,a+segments))
mesh=bpy.data.meshes.new('woven roof');mesh.from_pydata(verts,[],faces);mesh.materials.append(straw);mesh.materials.append(tips);o=bpy.data.objects.new('thatch roof',mesh);bpy.context.collection.objects.link(o);parts.append(o)
for p in mesh.polygons:p.material_index=1 if (p.index%32)%7==0 else 0
for i in range(28):
 a=i*math.tau/28;beam((math.cos(a)*.606,math.sin(a)*.606,.446),(math.cos(a)*.10,math.sin(a)*.10,.858),.0065,tips if i%3==0 else straw)
# Recessed doorway, jambs, lintel, doorstep and a little rain canopy.
cube((0,.478,.22),(.19,.027,.29),wood)
for x in [-.12,.12]:cube((x,.495,.225),(.035,.045,.33),tips)
cube((0,.50,.39),(.29,.065,.045),wood);cube((0,.56,.035),(.32,.24,.06),stone)
for x in [-.265,.265]:
 cube((x,.393,.30),(.105,.03,.105),wood);cube((x,.414,.30),(.012,.02,.108),tips)
# Join by object while retaining five material primitives for cheap cloning.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=bpy.context.object;o.name='hut';bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root,'tools','village-details.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(root,'assets','village-details.glb'),export_format='GLB',export_materials='EXPORT',export_animations=False,export_cameras=False,export_lights=False)
print('Detailed thatch hut exported')
