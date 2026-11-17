-- MoonSec V3 sample 050
-- LZW-lite on a small alphabet
local s = "ababcbababaaaaa"
local dict, nextc = {}, 256
for i = 0, 255 do dict[string.char(i)] = i end
local w, out = "", {}
for i = 1, #s do
  local c = s:sub(i,i)
  local wc = w .. c
  if dict[wc] then w = wc
  else
    out[#out+1] = dict[w]
    dict[wc] = nextc; nextc = nextc + 1
    w = c
  end
end
if w ~= "" then out[#out+1] = dict[w] end
local h = 0
for i = 1, #out do h = (h * 131 + out[i]) % 1000003 end
print(#out, h)

