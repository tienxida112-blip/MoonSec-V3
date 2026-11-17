-- MoonSec V3 sample 043
-- RC4 KSA+PRGA stream xor checksum
local key = {1,2,3,4,5,6,7,8}
local S = {}
for i = 0, 255 do S[i] = i end
local j = 0
for i = 0, 255 do
  j = (j + S[i] + key[(i % #key)+1]) % 256
  S[i], S[j] = S[j], S[i]
end
local i, acc = 0, 0
j = 0
for n = 1, 64 do
  i = (i + 1) % 256
  j = (j + S[i]) % 256
  S[i], S[j] = S[j], S[i]
  acc = acc + S[(S[i] + S[j]) % 256]
end
print(acc)

