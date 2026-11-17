-- MoonSec V3 sample 035
-- Newton integer square root
local function isqrt(n)
  if n <= 0 then return 0 end
  local x = n
  local y = math.floor((x + 1) / 2)
  while y < x do x = y; y = math.floor((x + math.floor(n/x)) / 2) end
  return x
end
local s = 0
for n = 2, 80 do
  local r = isqrt(n * n * 3)
  s = s + r
end
print(s, isqrt(2^20))

