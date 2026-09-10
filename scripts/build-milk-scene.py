"""Rebuild with: /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-milk-scene.py"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=.4, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat

milk = material('Warm whole milk', (.91, .89, .79), .23)
milk.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = .6
glass = material('Reflective glass edge', (.54, .65, .49), .13, .45)
paper = material('Uncoated ivory label', (.98, .965, .91), .85)
green = material('Forest enamel cap', (.025, .12, .083), .25, .42)
silver = material('Brushed silver cap', (.64, .69, .63), .28, .75)
ink = material('Forest typography', (.018, .075, .051), .65)

seal = material('Original brand seal', (1, 1, 1), .65)
node = seal.node_tree.nodes.new('ShaderNodeTexImage')
node.image = bpy.data.images.load(str(ROOT / 'public/images/mleko-i-mleko-seal.webp'))
node.image.pack()
bsdf = seal.node_tree.nodes.get('Principled BSDF')
seal.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
seal.node_tree.links.new(node.outputs['Alpha'], bsdf.inputs['Alpha'])
seal.surface_render_method = 'DITHERED'

def lathe(name, profile, mat, parent, start=-math.pi, span=math.tau, segments=80):
    vertices, faces = [], []
    for r, z in profile:
        for i in range(segments + 1):
            theta = start + span * i / segments
            vertices.append((r * math.sin(theta), -r * math.cos(theta), z))
    for row in range(len(profile) - 1):
        for i in range(segments):
            a = row * (segments + 1) + i
            faces.append((a, a + 1, a + segments + 2, a + segments + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.data.materials.append(mat)
    uv = mesh.uv_layers.new(name='Label UV')
    for poly in mesh.polygons:
        poly.use_smooth = True
        for loop in poly.loop_indices:
            idx = mesh.loops[loop].vertex_index
            uv.data[loop].uv = ((idx % (segments + 1)) / segments, (idx // (segments + 1)) / (len(profile) - 1))
    return obj

def cylinder(name, radius, depth, z, mat, parent):
    bpy.ops.mesh.primitive_cylinder_add(vertices=80, radius=radius, depth=depth, location=(0, 0, z))
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
    bevel.width = .014
    bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for face in obj.data.polygons:
        face.use_smooth = True

def text(body, z, size, parent):
    curve = bpy.data.curves.new(body, 'FONT')
    curve.body = body
    curve.align_x = 'CENTER'
    curve.size = size
    curve.space_character = 1.15
    curve.resolution_u = 3
    obj = bpy.data.objects.new(body, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = (0, -.477, z)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.parent = parent
    obj.data.materials.append(ink)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)

profile = [(.01, .03), (.33, .03), (.41, .055), (.448, .12), (.46, .23), (.46, 1.67), (.455, 1.79), (.43, 1.91), (.38, 2.05), (.31, 2.2), (.252, 2.35), (.232, 2.48), (.232, 2.73), (.01, 2.73)]
for name, cap, location, tilt, scale in [
    ('Kozje', silver, (.54, .18, .2), -.14, .9),
    ('Kravlje', green, (-.42, -.12, .09), .12, 1.04),
]:
    root = bpy.data.objects.new(name + ' bottle', None)
    bpy.context.collection.objects.link(root)
    lathe(name + ' glass bottle filled with milk', profile, milk, root)
    lathe('Thick glass base', [(.40, .03), (.446, .07), (.461, .13), (.461, .17)], glass, root)
    cylinder('Cap', .255, .145, 2.76, cap, root)
    cylinder('Tamper rim', .251, .035, 2.69, cap, root)
    for i in range(48):
        theta = math.tau * i / 48
        bpy.ops.mesh.primitive_uv_sphere_add(segments=6, ring_count=4, radius=1)
        rib = bpy.context.object
        rib.name = 'Cap grip'
        rib.parent = root
        rib.location = (.253 * math.sin(theta), .253 * math.cos(theta), 2.755)
        rib.scale = (.005, .005, .045)
        rib.data.materials.append(cap)
    lathe('Paper label', [(.467, .62), (.467, 1.69)], paper, root, -1.08, 2.16)
    lathe('Brand emblem', [(.472, .99), (.472, 1.63)], seal, root, -.76, 1.52)
    text(name.upper() + ' MLEKO', .90, .078, root)
    text('PUNOMASNO · SIROVO', .78, .043, root)
    text('1 L', .66, .071, root)
    root.location = location
    root.rotation_euler = (0, tilt, -.035 if name == 'Kravlje' else .08)
    root.scale = (scale,) * 3

# Export only the product objects; lighting is recreated cheaply in the browser.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/milk-bottles.glb'), export_format='GLB', use_selection=True, export_yup=True, export_animations=False, export_cameras=False, export_lights=False)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.render.resolution_x = 1000
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.world.color = (.35, .35, .35)

def area(name, location, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1.5)) - obj.location).to_track_quat('-Z', 'Y').to_euler()

area('Large window', (-3, -4, 6), 550, 4, (1, .95, .85))
area('Soft fill', (4, -1, 3), 350, 3, (.87, .95, 1))
area('Rim strip', (1, 3, 4), 600, 2, (1, 1, 1))
bpy.ops.object.camera_add(location=(0, -8.4, 3.15))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 1.55)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 3.9
scene.camera = camera
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = str(ROOT / 'public/images/3d/milk-bottles.png')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/blender/milk-bottles.blend'))
bpy.ops.render.render(write_still=True)
