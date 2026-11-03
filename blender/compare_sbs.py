from PIL import Image
import numpy as np, sys
sys.path.insert(0, r'D:\project\blender')
from measure_hero import figure_mask

ref = Image.open(r'D:\project\astro\public\images\chibi-hero.png').convert('RGB')
a = np.array(ref); mask = figure_mask(a)
ys, xs = np.nonzero(mask)
ref = ref.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))

ours = Image.open(r'D:\project\blender\out\_ortho_front.png').convert('RGBA')
oa = np.array(ours); om = oa[...,3] > 127
oys, oxs = np.nonzero(om)
ours = ours.crop((oxs.min(), oys.min(), oxs.max()+1, oys.max()+1))

H = 1100
def fit(im, bg=(245,245,248)):
    im = im.convert('RGBA')
    w,h = im.size; s = H/h
    im = im.resize((max(1,int(w*s)), H), Image.LANCZOS)
    base = Image.new('RGBA', im.size, bg+(255,))
    base.alpha_composite(im)
    return base.convert('RGB')

R = fit(ref); O = fit(ours)
pad = 20
canvas = Image.new('RGB', (R.width+O.width+pad*3, H+pad*2), (255,255,255))
canvas.paste(R, (pad, pad)); canvas.paste(O, (R.width+pad*2, pad))
canvas.save(r'D:\project\blender\out\_sbs_front.png')
print('sbs', canvas.size, 'ref', ref.size, 'ours', ours.size)
