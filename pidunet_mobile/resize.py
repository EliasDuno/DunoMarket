import sys
from PIL import Image

try:
    img = Image.open('assets/images/icon_original.png')
    img.thumbnail((700, 700), Image.Resampling.LANCZOS)
    background = Image.new('RGBA', (1024, 1024), (255, 255, 255, 0))
    offset = ((1024 - img.width) // 2, (1024 - img.height) // 2)
    background.paste(img, offset)
    background.save('assets/images/icon.png')
    print('Success')
except Exception as e:
    print(e)

