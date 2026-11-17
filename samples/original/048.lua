-- MoonSec V3 sample 048
-- Base64 encode then checksum
local abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local src = "MoonSecV3"
local bytes = {src:byte(1,#src)}
while #bytes % 3 ~= 0 do bytes[#bytes+1] = 0 end
local out = {}
for i = 1, #bytes, 3 do
  local n = bytes[i]*65536 + bytes[i+1]*256 + bytes[i+2]
  out[#out+1] = abc:sub(math.floor(n/262144)%64+1, math.floor(n/262144)%64+1)
  out[#out+1] = abc:sub(math.floor(n/4096)%64+1, math.floor(n/4096)%64+1)
  out[#out+1] = abc:sub(math.floor(n/64)%64+1, math.floor(n/64)%64+1)
  out[#out+1] = abc:sub(n%64+1, n%64+1)
end
local e = table.concat(out)
local h = 0
for i = 1, #e do h = (h * 33 + e:byte(i)) % 1000003 end
print(#e, h)

