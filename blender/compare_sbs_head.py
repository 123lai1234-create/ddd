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
ours = ours.convert('RGB')

FRAC = float(sys.argv[1]) if len(sys.argv) > 1 else 0.55
H = 1300

def head(im):
    w, h = im.size
    top = im.crop((0, 0, w, int(h * FRAC)))
    s = H / top.height
    return top.resize((max(1, int(top.width * s)), H), Image.LANCZOS)

R = head(ref); O = head(ours)
pad = 16
canvas = Image.new('RGB', (R.width + O.width + pad * 3, H + pad * 2), (255, 255, 255))
canvas.paste(R, (pad, pad)); canvas.paste(O, (R.width + pad * 2, pad))
canvas.save(r'D:\project\blender\out\_sbs_head.png')
print('sbs_head', canvas.size, 'ref', ref.size, 'ours', ours.size)
