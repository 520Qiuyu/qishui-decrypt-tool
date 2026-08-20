import sys, struct
data = sys.stdin.buffer.read()
n = len(data)//2
samples = struct.unpack('<%dh' % n, data[:n*2])
peak = max(abs(s) for s in samples)
rms = (sum(s*s for s in samples)/n)**0.5
print(f'decoded {n} samples, peak={peak}/32768, rms={rms:.0f}')
print('audio is', 'REAL (non-silent)' if rms > 500 else 'SILENT/INVALID')
