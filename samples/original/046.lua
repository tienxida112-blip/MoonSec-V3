-- MoonSec V3 sample 046
-- CRC-32 bitwise
local POLY = 0xEDB88320
local function u32(x) x = x % 4294967296; if x < 0 then x = x + 4294967296 end; return x end
local function bxor(a,b)
  a,b = u32(a),u32(b)
  local r,p=0,1
  for _=1,32 do
    local x,y=a%2,b%2
    if x~=y then r=r+p end
    a,b,p=(a-x)/2,(b-y)/2,p*2
  end
  return r
end
local crc = 4294967295
for i = 1, 80 do
  crc = bxor(crc, (i * 13) % 256)
  for _ = 1, 8 do
    if crc % 2 == 1 then crc = bxor(math.floor(crc/2), POLY)
    else crc = math.floor(crc/2) end
  end
end
print(bxor(crc, 4294967295))

