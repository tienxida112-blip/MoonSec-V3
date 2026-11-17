-- MoonSec V3 sample 094
-- Murmur-ish mix of 16 keys
local function rotl(x, r)
  r = r % 32
  local a = (x * (2^r)) % 4294967296
  local b = math.floor(x / (2^(32-r)))
  return (a + b) % 4294967296
end
local h = 0x9747b28c
for i = 1, 16 do
  local k = (i * 0xcc9e2d51) % 4294967296
  k = rotl(k, 15)
  h = (h + k) % 4294967296
  h = rotl(h, 13)
  h = (h * 5 + 0xe6546b64) % 4294967296
end
print(h)

