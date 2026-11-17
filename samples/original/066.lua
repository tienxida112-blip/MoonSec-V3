-- MoonSec V3 sample 066
-- Bitboard popcount + knight attacks
local function popcnt(x)
  local n = 0
  while x > 0 do n = n + x % 2; x = math.floor(x / 2) end
  return n
end
local function bit(r, f) return 2 ^ ((r-1)*8 + (f-1)) end
local knight = 0
local r0, f0 = 4, 4
for _, d in ipairs({{-2,-1},{-2,1},{-1,-2},{-1,2},{1,-2},{1,2},{2,-1},{2,1}}) do
  local r, f = r0+d[1], f0+d[2]
  if r>=1 and r<=8 and f>=1 and f<=8 then knight = knight + bit(r,f) end
end
print(popcnt(knight), knight % 1000003)

