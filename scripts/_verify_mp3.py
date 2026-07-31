with open(r'D:\Users\Downloads\Scream-lyric.mp3', 'rb') as f:
    data = f.read()
tag_size = ((data[6]&0x7f)<<21)|((data[7]&0x7f)<<14)|((data[8]&0x7f)<<7)|(data[9]&0x7f)
pos = 10; end = 10 + tag_size
while pos + 10 <= end:
    fid = data[pos:pos+4]
    if fid[0] == 0: break
    fsize = (data[pos+4]<<24)|(data[pos+5]<<16)|(data[pos+6]<<8)|data[pos+7]
    if fid == b'USLT':
        body = data[pos+10:pos+10+fsize]
        enc = body[0]; lang = body[1:4]
        text_bytes = body[5:]
        if enc == 3: text = text_bytes.decode('utf-8', errors='replace')
        elif enc in (1,2): text = text_bytes.decode('utf-16', errors='replace')
        else: text = text_bytes.decode('iso-8859-1', errors='replace')
        with open(r'D:\Users\Downloads\_uslt_korean.txt', 'w', encoding='utf-8') as out:
            out.write(text)
        hangul = sum(1 for c in text if 0xAC00 <= ord(c) <= 0xD7AF)
        print(f'SIZE={fsize} ENC={enc} LANG={lang} HANGUL={hangul}')
        print('written _uslt_korean.txt')
    pos += 10 + fsize
