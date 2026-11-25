from PIL import Image, ImageDraw, ImageFont
import sys
W,H=1200,630
import os
mark=Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'mark.png')).convert('RGBA')
BOLD=ImageFont.truetype('/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf',10)
def font(path,size): return ImageFont.truetype(path,size)
SERIF='/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf'
SANS='/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'
SANSM='/usr/share/fonts/opentype/inter/Inter-Medium.otf'
INK=(23,50,77); ACC=(29,106,138); GOLD=(215,154,34); TEAL=(22,163,155)
def grad(w,h,c1,c2):
    im=Image.new('RGB',(w,h)); px=im.load()
    for y in range(h):
        for x in range(w):
            t=(x/w*0.6+y/h*0.4)
            px[x,y]=tuple(int(c1[i]+(c2[i]-c1[i])*t) for i in range(3))
    return im
def wrap(d,text,f,maxw):
    words=text.split(); lines=[]; cur=''
    for w in words:
        t=(cur+' '+w).strip()
        if d.textlength(t,font=f)<=maxw: cur=t
        else: lines.append(cur); cur=w
    lines.append(cur); return lines
def make(out,title,sub,tag):
    bg=grad(W,H,(246,250,255),(222,238,245)).convert('RGBA')
    d=ImageDraw.Draw(bg)
    # soft accent circles
    ov=Image.new('RGBA',(W,H),(0,0,0,0)); od=ImageDraw.Draw(ov)
    od.ellipse((820,-220,1380,340),fill=(29,106,138,30)); od.ellipse((-160,430,380,900),fill=(215,154,34,38))
    bg=Image.alpha_composite(bg,ov); d=ImageDraw.Draw(bg)
    # bottom stripe
    for x in range(W):
        t=x/W
        c=tuple(int(a+(b-a)*(t/.6)) for a,b in zip(ACC,TEAL)) if t<.6 else tuple(int(a+(b-a)*((t-.6)/.4)) for a,b in zip(TEAL,GOLD))
        d.line([(x,H-16),(x,H)],fill=c)
    # logo mark
    mh=270; mw=int(mark.width*mh/mark.height)
    m=mark.resize((mw,mh),Image.LANCZOS)
    bg.alpha_composite(m,(70,(H-16-mh)//2))
    x0=70+mw+50; maxw=W-x0-50
    size=84
    while True:
        f=font(SERIF,size); lines=wrap(d,title,f,maxw)
        if len(lines)<=2 and all(d.textlength(l,font=f)<=maxw for l in lines): break
        size-=4
    lh=int(size*1.12)
    def fit(path,sz,text):
        while sz>16 and d.textlength(text,font=font(path,sz))>maxw: sz-=1
        return font(path,sz)
    sf=fit(SANS,36,sub); tf=fit(SANSM,28,tag or ' ')
    blockh=lh*len(lines)+14+46+(46 if tag else 0)
    y=(H-16-blockh)//2
    for l in lines:
        d.text((x0,y),l,font=f,fill=INK); y+=lh
    y+=10
    d.rounded_rectangle((x0,y+6,x0+90,y+11),radius=3,fill=GOLD); y+=26
    d.text((x0,y),sub,font=sf,fill=ACC); y+=50
    if tag: d.text((x0,y),tag,font=tf,fill=(84,104,124))
    bg.convert('RGB').save(out,'JPEG',quality=88,optimize=True)
if __name__=='__main__':
    # python3 tools/og/make_og.py out.jpg "Title" "Subtitle" "Small line"
    make(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else '')
