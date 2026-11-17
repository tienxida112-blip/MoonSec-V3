-- MoonSec V3 sample 058
-- Nim xor win-count
local function xorall(t)
  local x = 0
  for i = 1, #t do
    local a, b, r, p = x, t[i], 0, 1
    for _ = 1, 16 do
      local u, v = a % 2, b % 2
      if u ~= v then r = r + p end
      a, b, p = (a-u)/2, (b-v)/2, p*2
    end
    x = r
  end
  return x
end
local wins = 0
local st = 9090
for k = 1, 50 do
  st = st * 48271 % 2147483647
  local h = {st%8, math.floor(st/8)%8, math.floor(st/64)%8, math.floor(st/512)%8}
  if xorall(h) ~= 0 then wins = wins + 1 end
end
print(wins)

