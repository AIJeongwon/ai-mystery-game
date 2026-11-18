# 컬렉션 하나를 glb로 내보낸다. Blender 안에서: export_collection("room12", r"...\x.glb")
#   draco  메시를 Draco로 줄인다 (게임은 DRACOLoader로 푼다)      webp  텍스처를 WebP로 다시 싼다 (0이면 원본 그대로)
import bpy, logging, os

def export_collection(name, out, draco=False, apply=True, webp=0, anim=False):
    for o in bpy.data.objects:
        o.hide_set(False)
    bpy.ops.object.select_all(action="DESELECT")
    objs = list(bpy.data.collections[name].all_objects)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=out, export_format="GLB", use_selection=True, export_apply=apply, export_yup=True,
              export_extras=True, export_cameras=False, export_lights=False, export_animations=anim,
              export_draco_mesh_compression_enable=draco)
    if draco:
        kw.update(export_draco_mesh_compression_level=6, export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12)
    if webp:
        kw.update(export_image_format="WEBP", export_image_quality=webp)
    if anim:
        kw.update(export_animation_mode="ACTIONS", export_force_sampling=True, export_optimize_animation_size=True, export_skins=True, export_anim_slide_to_zero=True)
    logging.disable(logging.CRITICAL)
    try:
        bpy.ops.export_scene.gltf(**kw)
    finally:
        logging.disable(logging.NOTSET)
    return os.path.getsize(out)
